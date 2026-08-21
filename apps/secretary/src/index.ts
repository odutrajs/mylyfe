import { Boom } from "@hapi/boom";
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WAMessage
} from "@whiskeysockets/baileys";
import express from "express";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import QRCode from "qrcode";

type ConnectionState = "disconnected" | "qr" | "connecting" | "connected";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionDir = process.env.SECRETARY_SESSION_DIR
  ? path.resolve(process.env.SECRETARY_SESSION_DIR)
  : path.resolve(appRoot, "data", "session");
const port = Number(process.env.SECRETARY_PORT ?? 3334);
const apiUrl = process.env.API_URL ?? "http://localhost:3333";
const secretaryToken = process.env.SECRETARY_TOKEN ?? "dev-secretary-token";
const pollMs = Number(process.env.SECRETARY_POLL_MS ?? 20000);
const logger = pino({ level: process.env.SECRETARY_LOG_LEVEL ?? "warn" });

let socket: ReturnType<typeof makeWASocket> | null = null;
let connectionState: ConnectionState = "disconnected";
let qrDataUrl: string | null = null;
let connectedPhone = "";
let lastError = "";
let pollTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let socketGeneration = 0;
let disconnecting = false;

const requireToken: express.RequestHandler = (request, response, next) => {
  const header = request.headers.authorization ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const token = bearer || String(request.headers["x-secretary-token"] ?? "");
  if (token !== secretaryToken) {
    response.status(401).json({ error: "Nao autorizado." });
    return;
  }
  next();
};

const digits = (value: string) => value.replace(/\D/g, "");
const lidByPhone = new Map<string, string>();
const seenInbound = new Map<string, number>();
const sendingJobs = new Set<string>();
const INBOUND_TTL_MS = 10 * 60 * 1000;

const rememberInbound = (id?: string | null) => {
  if (!id) return false;
  const now = Date.now();
  if (seenInbound.has(id)) return false;
  seenInbound.set(id, now);
  if (seenInbound.size > 400) {
    for (const [key, at] of seenInbound) {
      if (now - at > INBOUND_TTL_MS) seenInbound.delete(key);
    }
  }
  return true;
};

const isFreshInbound = (message: WAMessage) => {
  const timestamp = Number(message.messageTimestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return true;
  const ageMs = Date.now() - timestamp * 1000;
  return ageMs >= 0 && ageMs < 90_000;
};

const jidToPhone = (jid?: string | null) => {
  if (!jid || jid.endsWith("@g.us") || jid.endsWith("@lid") || jid === "status@broadcast") return "";
  return digits(jid.split("@")[0]?.split(":")[0] ?? "");
};

const phoneToJid = (phone: string) => {
  const normalized = digits(phone);
  const withCountry = normalized.startsWith("55") || normalized.length > 11 ? normalized : `55${normalized}`;
  return `${withCountry}@s.whatsapp.net`;
};

const rememberLid = (phone: string, lid?: string | null) => {
  if (!phone || !lid?.endsWith("@lid")) return;
  lidByPhone.set(digits(phone), lid);
  if (!digits(phone).startsWith("55") && digits(phone).length >= 10) {
    lidByPhone.set(`55${digits(phone)}`, lid);
  }
};

const senderPhone = (message: WAMessage) => {
  const key = message.key as WAMessage["key"] & { remoteJidAlt?: string; participantPn?: string };
  const candidates = [key.senderPn, key.participantPn, key.remoteJidAlt, key.participant, key.remoteJid];
  for (const candidate of candidates) {
    const phone = jidToPhone(candidate);
    if (phone) {
      if (key.remoteJid?.endsWith("@lid")) rememberLid(phone, key.remoteJid);
      return phone;
    }
  }
  return "";
};

const resolveSendJid = async (phone: string) => {
  const pn = phoneToJid(phone);
  const cached = lidByPhone.get(digits(phone)) ?? lidByPhone.get(digits(pn));
  if (cached) return cached;
  if (!socket) return pn;
  try {
    const results = await socket.onWhatsApp(pn);
    const lid = results?.[0]?.lid;
    if (typeof lid === "string" && lid.endsWith("@lid")) {
      rememberLid(phone, lid);
      return lid;
    }
  } catch (error) {
    logger.warn({ err: error, phone }, "failed to resolve WhatsApp LID");
  }
  return pn;
};

const inboundContent = (message: WAMessage) =>
  message.message?.ephemeralMessage?.message ?? message.message ?? undefined;

const messageText = (message: WAMessage) => {
  const content = inboundContent(message);
  return (
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.buttonsResponseMessage?.selectedDisplayText ||
    ""
  ).trim();
};

const inboundAudio = (message: WAMessage) => inboundContent(message)?.audioMessage;

const transcribeAudio = async (message: WAMessage) => {
  if (!socket) throw new Error("WhatsApp desconectado.");
  const audio = inboundAudio(message);
  const buffer = (await downloadMediaMessage(
    message,
    "buffer",
    {},
    {
      logger,
      reuploadRequest: socket.updateMediaMessage
    }
  )) as Buffer;
  const form = new FormData();
  const mime = audio?.mimetype || "audio/ogg";
  const name = mime.includes("mp3") || mime.includes("mpeg") ? "audio.mp3" : "audio.ogg";
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mime }), name);
  const response = await fetch(`${apiUrl}/api/secretary/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretaryToken}` },
    body: form
  });
  const payload = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!response.ok || !payload.text?.trim()) {
    throw new Error(payload.error || "Nao consegui transcrever o audio.");
  }
  return payload.text.trim();
};

const statusPayload = () => ({
  state: connectionState,
  qr: connectionState === "qr" ? qrDataUrl : null,
  phone: connectedPhone,
  lastError,
  sessionDir
});

const apiFetch = async (pathname: string, init?: RequestInit) => {
  const response = await fetch(`${apiUrl}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secretaryToken}`,
      ...(init?.headers ?? {})
    }
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `API ${response.status}`);
  }
  return payload;
};

const sendText = async (to: string, text: string) => {
  if (!socket || connectionState !== "connected") {
    throw new Error("WhatsApp desconectado.");
  }
  const destination = to.endsWith("@g.us") ? to : await resolveSendJid(to);
  await socket.sendMessage(destination, { text });
};

const deliverJob = async (job: { id: string; to: string; text: string }) => {
  if (!job.id || !job.text?.trim() || sendingJobs.has(job.id)) return;
  sendingJobs.add(job.id);
  try {
    await sendText(job.to, job.text);
    await apiFetch(`/api/secretary/jobs/${job.id}/sent`, { method: "POST" });
  } catch (error) {
    sendingJobs.delete(job.id);
    throw error;
  }
};

const deliverJobs = async () => {
  if (connectionState !== "connected") return;
  const payload = (await apiFetch("/api/secretary/jobs")) as { jobs?: Array<{ id: string; to: string; text: string }> };
  for (const job of payload.jobs ?? []) {
    try {
      await deliverJob(job);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Falha ao enviar mensagem.";
      logger.warn({ err: error, jobId: job.id }, "secretary job failed");
    }
  }
};

const forwardInbox = async (from: string, text: string, groupJid?: string, via?: string) => {
  const result = (await apiFetch("/api/secretary/inbox", {
    method: "POST",
    body: JSON.stringify({ from, text, groupJid, via })
  })) as { jobs?: Array<{ id: string; to: string; text: string }> };

  for (const job of result.jobs ?? []) {
    try {
      await deliverJob(job);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Falha ao responder.";
    }
  }
};

const startPolling = () => {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    deliverJobs().catch((error) => logger.warn({ err: error }, "secretary poll failed"));
  }, pollMs);
};

const stopPolling = () => {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
};

const clearReconnectTimer = () => {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
};

const resetConnectionState = (error = "") => {
  connectionState = "disconnected";
  qrDataUrl = null;
  connectedPhone = "";
  lastError = error;
};

const clearSession = async () => {
  await rm(sessionDir, { recursive: true, force: true });
  await mkdir(sessionDir, { recursive: true });
};

const endSocket = async (logoutFromWhatsApp: boolean) => {
  socketGeneration += 1;
  clearReconnectTimer();
  stopPolling();
  const current = socket;
  socket = null;
  if (!current) return;
  try {
    if (logoutFromWhatsApp) {
      await current.logout();
    } else {
      current.end(undefined);
    }
  } catch {
    try {
      current.end(undefined);
    } catch {
      // ignore leftover socket errors
    }
  }
};

const disconnectWhatsApp = async () => {
  if (disconnecting) return statusPayload();
  disconnecting = true;
  resetConnectionState();
  try {
    await endSocket(true);
    await clearSession();
    await startSocket();
  } finally {
    disconnecting = false;
  }
  return statusPayload();
};

const startSocket = async () => {
  const generation = ++socketGeneration;
  clearReconnectTimer();
  await mkdir(sessionDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    version,
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    browser: ["MyLyfe Secretaria", "Chrome", "1.0"],
    getMessage: async () => ({ conversation: "" })
  });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", async (update) => {
    if (generation !== socketGeneration) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionState = "qr";
      qrDataUrl = await QRCode.toDataURL(qr);
      lastError = "";
    }

    if (connection === "connecting") {
      connectionState = qr ? "qr" : "connecting";
    }

    if (connection === "open") {
      connectionState = "connected";
      qrDataUrl = null;
      connectedPhone = jidToPhone(socket?.user?.id);
      lastError = "";
      startPolling();
      deliverJobs().catch((error) => logger.warn({ err: error }, "initial job flush failed"));
    }

    if (connection === "close") {
      stopPolling();
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      connectionState = "disconnected";
      qrDataUrl = null;
      lastError = loggedOut ? "Sessao encerrada no WhatsApp. Gerando um QR novo." : "Conexao caiu. Reconectando.";
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (generation !== socketGeneration) return;
        const restart = loggedOut
          ? clearSession().then(() => startSocket())
          : startSocket();
        restart.catch((error) => {
          lastError = error instanceof Error ? error.message : "Falha ao reconectar.";
        });
      }, loggedOut ? 400 : 2500);
    }
  });

  socket.ev.on("messages.upsert", async ({ messages }) => {
    if (generation !== socketGeneration) return;
    for (const message of messages) {
      if (message.key.fromMe) continue;
      if (!rememberInbound(message.key.id) || !isFreshInbound(message)) continue;
      const from = senderPhone(message);
      const text = messageText(message);
      const audio = inboundAudio(message);
      const groupJid = message.key.remoteJid?.endsWith("@g.us") ? message.key.remoteJid : undefined;
      const replyTo = groupJid || from;
      try {
        if (audio) {
          if (!from && !groupJid) {
            logger.warn({ key: message.key }, "ignored inbound whatsapp audio");
            continue;
          }
          try {
            const heard = await transcribeAudio(message);
            await forwardInbox(from, heard, groupJid, "audio");
          } catch (error) {
            lastError = error instanceof Error ? error.message : "Falha ao transcrever audio.";
            logger.warn({ err: error, from, groupJid }, "audio transcription failed");
            if (replyTo) {
              await sendText(
                replyTo,
                "Recebi o audio, mas nao consegui entender. Pode mandar de novo ou escrever?"
              );
            }
          }
          continue;
        }
        if (!text || (!from && !groupJid)) {
          logger.warn({ key: message.key, from, hasText: Boolean(text) }, "ignored inbound whatsapp message");
          continue;
        }
        await forwardInbox(from, text, groupJid);
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Falha ao processar resposta.";
        logger.warn({ err: error, from, groupJid }, "inbox failed");
      }
    }
  });
};

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, state: connectionState });
});

app.get("/status", requireToken, (_request, response) => {
  response.json(statusPayload());
});

app.get("/groups", requireToken, async (_request, response) => {
  if (!socket || connectionState !== "connected") {
    response.status(503).json({ error: "WhatsApp desconectado.", groups: [] });
    return;
  }
  try {
    const participating = await socket.groupFetchAllParticipating();
    const groups = Object.values(participating).map((group) => ({
      id: group.id,
      name: group.subject
    }));
    response.json({ groups });
  } catch (error) {
    response.status(503).json({
      error: error instanceof Error ? error.message : "Falha ao listar grupos.",
      groups: []
    });
  }
});

app.post("/logout", requireToken, async (_request, response) => {
  try {
    response.json({ ok: true, ...(await disconnectWhatsApp()) });
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : "Falha ao desconectar." });
  }
});

app.post("/send", requireToken, async (request, response) => {
  const body = request.body as { to?: string; text?: string };
  if (!body.to || !body.text?.trim()) {
    response.status(400).json({ error: "Destino e texto sao obrigatorios." });
    return;
  }
  try {
    await sendText(body.to, body.text.trim());
    response.json({ ok: true });
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : "Falha ao enviar." });
  }
});

app.listen(port, () => {
  console.log(`MyLyfe secretary running on http://localhost:${port}`);
  startSocket().catch((error) => {
    lastError = error instanceof Error ? error.message : "Falha ao iniciar o WhatsApp.";
    logger.error({ err: error }, "failed to start baileys");
  });
});
