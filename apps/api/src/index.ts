import "./load-env.js";
import {
  analyzePlan,
  buildMonthlySnapshot,
  buildSpendCoachBrief,
  createRuleFromCorrection,
  formatMonthKey,
  isWorkspaceAdmin,
  lifeModulePlanId,
  type FinancePlan,
  type FinancialTransaction,
  type LifeAlert,
  type RoutineModuleState,
  type SecretarySettings,
  type SpendCoachMessage
} from "@mylyfe/domain";
import cors from "cors";
import express from "express";
import multer from "multer";
import { createRepository } from "./repository.js";
import { transcribeSecretaryAudio } from "./secretary-transcribe.js";
import { dedupeTransactions, findDuplicateStatementImport, parseCsvStatement, parsePdfStatement } from "./parser.js";
import {
  AuthError,
  deleteUserAccount,
  completePasswordReset,
  confirmPasswordResetCode,
  loginUser,
  logoutUser,
  registerUser,
  requirePaidSession,
  startPasswordReset,
  savePushToken,
  sessionFromToken,
  updateAuthSession
} from "./auth-service.js";
import {
  BillingError,
  createCheckoutLink,
  createCheckoutSession,
  createPortalSession,
  createSubscriptionElements,
  subscriptionForUser,
  syncSubscriptionFromStripe,
  userFromCheckoutStart
} from "./billing-service.js";
import { handleStripeWebhook } from "./stripe-webhook.js";
import { confirmPhoneVerification, PhoneVerifyError, sanitizePlanWhatsappIdentity, startPhoneVerification } from "./phone-verify-service.js";
import {
  deletePlanAlert,
  handleSecretaryInbox,
  handleShoppingGroupInbox,
  markJobSent,
  pendingSecretaryJobs,
  savePlanSecretarySettings,
  secretarySnapshot,
  completePlanAlert,
  setAlertStatus,
  tickSecretary,
  upsertPlanAlert
} from "./secretary-service.js";
import { runSpendCoach } from "./spend-coach-ai.js";
import {
  finishGoogleConnect,
  finishMicrosoftConnect,
  googleCallbackErrorRedirect,
  googleConfigured,
  listRoutineEvents,
  loadRoutineCalendarSnapshot,
  microsoftCallbackErrorRedirect,
  microsoftConfigured,
  refreshConnectionCalendars,
  removeGoogleConnection,
  RoutineError,
  routineSnapshot,
  saveRoutineState,
  startGoogleConnect,
  startMicrosoftConnect,
  syncRoutineCalendars
} from "./routine-service.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});
const repository = await createRepository();
const port = Number(process.env.API_PORT ?? 3333);
const secretaryUrl = process.env.SECRETARY_URL ?? "http://localhost:3334";
const secretaryToken = process.env.SECRETARY_TOKEN ?? "dev-secretary-token";

const requireSecretaryToken: express.RequestHandler = (request, response, next) => {
  const header = request.headers.authorization ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const token = bearer || String(request.headers["x-secretary-token"] ?? "");
  if (token !== secretaryToken) {
    response.status(401).json({ error: "Nao autorizado." });
    return;
  }
  next();
};

const fetchSecretaryGateway = async (pathname: string, init?: RequestInit) => {
  const response = await fetch(`${secretaryUrl}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secretaryToken}`,
      ...(init?.headers ?? {})
    }
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, payload };
};

const requireWorkspaceAdmin = async (header: string | undefined, planId?: string) => {
  const current = await sessionFromToken(header);
  const plan = await repository.get(planId || current.session.planId);
  if (!isWorkspaceAdmin(plan, current.session.email, current.session.personalPlanId)) {
    throw new AuthError("So o administrador pode alterar esta configuracao.", 403);
  }
  return current;
};

const resolveRoutinePlanId = async (header: string | undefined, requestedPlanId: string) => {
  const planId = requestedPlanId.trim();
  if (!planId) throw new AuthError("Informe o plano.", 400);
  if (!header) return planId;
  try {
    const current = await sessionFromToken(header);
    const plan = await repository.get(planId);
    return lifeModulePlanId(plan, current.session.email, current.session.personalPlanId);
  } catch (error) {
    if (error instanceof AuthError && error.message === "Informe o plano.") throw error;
    return planId;
  }
};
const routeParam = (value: string | string[] | undefined, fallback: string) =>
  Array.isArray(value) ? (value[0] ?? fallback) : (value ?? fallback);

const webOrigins = (process.env.WEB_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const localWebOrigins = ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"];
app.use(cors({ origin: webOrigins.length > 0 ? [...new Set([...webOrigins, ...localWebOrigins])] : true }));

const requestWebOrigin = (request: express.Request) => {
  const origin = request.get("origin")?.trim();
  if (origin) return origin.replace(/\/$/, "");
  const referer = request.get("referer");
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
};
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  (request, response, next) => {
    Promise.resolve(
      handleStripeWebhook(request.body as Buffer, String(request.headers["stripe-signature"] ?? ""))
    )
      .then((result) => {
        response.json({ received: true, ...result });
      })
      .catch((error) => {
        response.status(400).json({
          error: error instanceof Error ? error.message : "Webhook invalido."
        });
      })
      .catch(next);
  }
);

app.use(express.json({ limit: "5mb" }));

const asyncRoute =
  <T extends express.RequestHandler>(handler: T): express.RequestHandler =>
  (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    auth: "server-users",
    storage: process.env.USE_PRISMA === "true" && process.env.DATABASE_URL ? "postgresql-prisma" : "local-json"
  });
});

app.post(
  "/api/auth/register",
  asyncRoute(async (request, response) => {
    try {
      response.status(201).json(await registerUser(repository, request.body as { name?: string; email?: string; password?: string; phone?: string }));
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.post(
  "/api/auth/login",
  asyncRoute(async (request, response) => {
    try {
      response.json(await loginUser(request.body as { email?: string; password?: string }));
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.get(
  "/api/auth/me",
  asyncRoute(async (request, response) => {
    try {
      const current = await sessionFromToken(request.headers.authorization);
      response.json({ session: current.session });
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.patch(
  "/api/auth/me",
  asyncRoute(async (request, response) => {
    try {
      response.json(await updateAuthSession(request.headers.authorization, request.body as { planId?: string; name?: string }));
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.post(
  "/api/auth/push-token",
  asyncRoute(async (request, response) => {
    try {
      response.json(await savePushToken(request.headers.authorization, request.body as { token?: string; platform?: string }));
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.post(
  "/api/auth/password/forgot",
  asyncRoute(async (request, response) => {
    try {
      response.json(await startPasswordReset(repository, request.body as { email?: string }));
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.post(
  "/api/auth/password/verify",
  asyncRoute(async (request, response) => {
    try {
      response.json(await confirmPasswordResetCode(repository, request.body as { email?: string; code?: string }));
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.post(
  "/api/auth/password/reset",
  asyncRoute(async (request, response) => {
    try {
      response.json(await completePasswordReset(request.body as { token?: string; password?: string }));
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.post(
  "/api/auth/logout",
  asyncRoute(async (request, response) => {
    await logoutUser(request.headers.authorization);
    response.json({ ok: true });
  })
);

app.delete(
  "/api/auth/me",
  asyncRoute(async (request, response) => {
    try {
      await deleteUserAccount(repository, request.headers.authorization);
      response.json({ ok: true });
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

const sendAuthError = (response: express.Response, error: unknown) => {
  if (error instanceof AuthError || error instanceof BillingError) {
    response.status(error.status).json({ error: error.message });
    return true;
  }
  return false;
};

app.post(
  "/api/billing/checkout",
  asyncRoute(async (request, response) => {
    try {
      const current = await sessionFromToken(request.headers.authorization);
      const body = (request.body ?? {}) as { source?: string };
      response.json(
        body.source === "mobile"
          ? await createCheckoutLink(current.user, { source: "mobile" })
          : await createCheckoutSession(current.user, { source: body.source })
      );
    } catch (error) {
      if (sendAuthError(response, error)) return;
      throw error;
    }
  })
);

app.post(
  "/api/billing/elements",
  asyncRoute(async (request, response) => {
    try {
      const body = (request.body ?? {}) as { start?: string };
      const user = body.start
        ? await userFromCheckoutStart(body.start)
        : (await sessionFromToken(request.headers.authorization)).user;
      response.json(await createSubscriptionElements(user));
    } catch (error) {
      if (sendAuthError(response, error)) return;
      throw error;
    }
  })
);

app.post(
  "/api/billing/sync",
  asyncRoute(async (request, response) => {
    try {
      const current = await sessionFromToken(request.headers.authorization);
      response.json({ subscription: await syncSubscriptionFromStripe(current.user) });
    } catch (error) {
      if (sendAuthError(response, error)) return;
      throw error;
    }
  })
);

app.post(
  "/api/billing/portal",
  asyncRoute(async (request, response) => {
    try {
      const current = await sessionFromToken(request.headers.authorization);
      response.json(await createPortalSession(current.user));
    } catch (error) {
      if (sendAuthError(response, error)) return;
      throw error;
    }
  })
);

app.get(
  "/api/billing/subscription",
  asyncRoute(async (request, response) => {
    try {
      const current = await sessionFromToken(request.headers.authorization);
      response.json({ subscription: await subscriptionForUser(current.user) });
    } catch (error) {
      if (sendAuthError(response, error)) return;
      throw error;
    }
  })
);

const requireAppAccess: express.RequestHandler = (request, response, next) => {
  Promise.resolve(requirePaidSession(request.headers.authorization))
    .then(() => next())
    .catch((error) => {
      if (sendAuthError(response, error)) return;
      next(error);
    });
};

app.use("/api/plans", requireAppAccess);

app.get(
  "/api/plans/:id",
  asyncRoute(async (request, response) => {
    response.json(await repository.get(routeParam(request.params.id, "primary")));
  })
);

app.put(
  "/api/plans/:id",
  asyncRoute(async (request, response) => {
    const id = routeParam(request.params.id, "primary");
    const plan = await sanitizePlanWhatsappIdentity(repository, id, request.body as FinancePlan);
    const saved = await repository.save({
      ...plan,
      id
    });
    response.json(saved);
  })
);

app.get(
  "/api/plans/:id/analysis",
  asyncRoute(async (request, response) => {
    const plan = await repository.get(routeParam(request.params.id, "primary"));
    response.json(analyzePlan(plan));
  })
);

app.post(
  "/api/plans/:id/spend-coach",
  asyncRoute(async (request, response) => {
    const plan = await repository.get(routeParam(request.params.id, "primary"));
    const body = (request.body ?? {}) as { month?: string; messages?: SpendCoachMessage[] };
    const month = body.month && /^\d{4}-\d{2}$/.test(body.month) ? body.month : formatMonthKey(new Date());
    const messages = Array.isArray(body.messages)
      ? body.messages.filter(
          (item): item is SpendCoachMessage =>
            Boolean(item) &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string" &&
            item.content.trim().length > 0
        )
      : [];
    const brief = buildSpendCoachBrief(plan, month);
    const turn = await runSpendCoach(brief, messages);
    response.json(turn);
  })
);

app.post(
  "/api/plans/:id/snapshots",
  asyncRoute(async (request, response) => {
    const plan = await repository.get(routeParam(request.params.id, "primary"));
    const snapshot = buildMonthlySnapshot(plan);
    const snapshots = plan.monthlySnapshots.filter((item) => item.month !== snapshot.month);
    const saved = await repository.save({
      ...plan,
      monthlySnapshots: [...snapshots, snapshot]
    });
    response.json({
      snapshot,
      plan: saved
    });
  })
);

app.post(
  "/api/plans/:id/import/card-statement",
  upload.single("file"),
  asyncRoute(async (request, response) => {
    if (!request.file) {
      response.status(400).json({ error: "Arquivo nao enviado." });
      return;
    }

    const plan = await repository.get(routeParam(request.params.id, "primary"));
    const fileName = request.file.originalname;
    const lowerName = fileName.toLowerCase();
    const parsedStatement = lowerName.endsWith(".pdf")
      ? await parsePdfStatement(request.file.buffer, fileName, plan)
      : parseCsvStatement(request.file.buffer, fileName, plan);
    const duplicateStatement = findDuplicateStatementImport(plan.transactions, parsedStatement);
    if (duplicateStatement) {
      response.status(409).json({
        error: "Esta fatura ja foi importada. Nenhuma transacao foi adicionada.",
        duplicateStatement,
        imported: 0,
        skippedDuplicates: parsedStatement.transactions.length,
        statement: parsedStatement.metadata,
        plan,
        analysis: analyzePlan(plan)
      });
      return;
    }

    const transactions = dedupeTransactions(plan.transactions, parsedStatement.transactions);
    const saved = await repository.save({
      ...plan,
      transactions: [...plan.transactions, ...transactions]
    });

    response.json({
      imported: transactions.length,
      skippedDuplicates: parsedStatement.transactions.length - transactions.length,
      statement: parsedStatement.metadata,
      plan: saved,
      analysis: analyzePlan(saved)
    });
  })
);

app.get(
  "/api/plans/:id/secretary",
  asyncRoute(async (request, response) => {
    response.json(await secretarySnapshot(repository, routeParam(request.params.id, "primary")));
  })
);

app.put(
  "/api/plans/:id/secretary/settings",
  asyncRoute(async (request, response) => {
    const planId = routeParam(request.params.id, "primary");
    try {
      await requireWorkspaceAdmin(request.headers.authorization, planId);
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
    const settings = request.body as Partial<SecretarySettings>;
    const state = await savePlanSecretarySettings(repository, planId, settings);
    response.json(state);
  })
);

app.post(
  "/api/plans/:id/alerts",
  asyncRoute(async (request, response) => {
    const result = await upsertPlanAlert(repository, routeParam(request.params.id, "primary"), request.body as Partial<LifeAlert> & { title?: string });
    response.status(201).json(result);
  })
);

app.put(
  "/api/plans/:id/alerts/:alertId",
  asyncRoute(async (request, response) => {
    const result = await upsertPlanAlert(repository, routeParam(request.params.id, "primary"), {
      ...(request.body as Partial<LifeAlert>),
      id: routeParam(request.params.alertId, "")
    });
    response.json(result);
  })
);

app.post(
  "/api/plans/:id/alerts/:alertId/status",
  asyncRoute(async (request, response) => {
    const status = (request.body as { status?: LifeAlert["status"] }).status;
    if (!status) {
      response.status(400).json({ error: "Status obrigatorio." });
      return;
    }
    response.json(await setAlertStatus(repository, routeParam(request.params.id, "primary"), routeParam(request.params.alertId, ""), status));
  })
);

app.post(
  "/api/plans/:id/alerts/:alertId/complete",
  asyncRoute(async (request, response) => {
    response.json(await completePlanAlert(repository, routeParam(request.params.id, "primary"), routeParam(request.params.alertId, "")));
  })
);

app.delete(
  "/api/plans/:id/alerts/:alertId",
  asyncRoute(async (request, response) => {
    response.json(await deletePlanAlert(repository, routeParam(request.params.id, "primary"), routeParam(request.params.alertId, "")));
  })
);

app.get(
  "/api/secretary/status",
  requireAppAccess,
  asyncRoute(async (_request, response) => {
    try {
      const gateway = await fetchSecretaryGateway("/status");
      response.status(gateway.ok ? 200 : gateway.status).json({
        ...gateway.payload,
        api: "ok"
      });
    } catch {
      response.json({
        state: "offline",
        api: "ok",
        message: "A secretaria WhatsApp esta desligada. Suba o container para conectar."
      });
    }
  })
);

app.post(
  "/api/secretary/logout",
  asyncRoute(async (request, response) => {
    try {
      await requireWorkspaceAdmin(request.headers.authorization);
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
    try {
      const gateway = await fetchSecretaryGateway("/logout", { method: "POST" });
      response.status(gateway.ok ? 200 : gateway.status).json({
        ...gateway.payload,
        api: "ok"
      });
    } catch {
      response.status(503).json({
        state: "offline",
        api: "ok",
        error: "A secretaria WhatsApp esta desligada. Suba o container para desconectar."
      });
    }
  })
);

app.post(
  "/api/secretary/tick",
  requireSecretaryToken,
  asyncRoute(async (_request, response) => {
    const result = await tickSecretary(repository);
    response.json(result);
  })
);

app.get(
  "/api/secretary/jobs",
  requireSecretaryToken,
  asyncRoute(async (_request, response) => {
    await tickSecretary(repository);
    response.json({ jobs: await pendingSecretaryJobs() });
  })
);

app.post(
  "/api/secretary/jobs/:jobId/sent",
  requireSecretaryToken,
  asyncRoute(async (request, response) => {
    const job = await markJobSent(routeParam(request.params.jobId, ""));
    if (!job) {
      response.status(404).json({ error: "Job nao encontrado." });
      return;
    }
    response.json(job);
  })
);

app.post(
  "/api/secretary/phone/start",
  requireAppAccess,
  asyncRoute(async (request, response) => {
    try {
      const current = await sessionFromToken(request.headers.authorization);
      const body = request.body as { phone?: string; personId?: string };
      response.json(
        await startPhoneVerification(repository, {
          planId: current.session.planId,
          personId: body.personId,
          email: current.session.email,
          personalPlanId: current.session.personalPlanId,
          phone: body.phone
        })
      );
    } catch (error) {
      if (error instanceof AuthError || error instanceof PhoneVerifyError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.post(
  "/api/secretary/phone/confirm",
  requireAppAccess,
  asyncRoute(async (request, response) => {
    try {
      const current = await sessionFromToken(request.headers.authorization);
      const body = request.body as { phone?: string; code?: string };
      const confirmed = await confirmPhoneVerification(repository, { ...body, planId: current.session.planId });
      response.json({
        ok: true,
        phone: confirmed.phone,
        person: confirmed.person,
        whatsappVerifiedAt: confirmed.person?.whatsappVerifiedAt
      });
    } catch (error) {
      if (error instanceof AuthError || error instanceof PhoneVerifyError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.post(
  "/api/secretary/transcribe",
  requireSecretaryToken,
  audioUpload.single("file"),
  asyncRoute(async (request, response) => {
    if (!request.file?.buffer?.length) {
      response.status(400).json({ error: "Audio nao enviado." });
      return;
    }
    const result = await transcribeSecretaryAudio(request.file.buffer, request.file.mimetype);
    if (!result.text) {
      response.status(502).json({ error: result.error || "Nao consegui transcrever o audio." });
      return;
    }
    response.json({ text: result.text });
  })
);

app.post(
  "/api/secretary/inbox",
  requireSecretaryToken,
  asyncRoute(async (request, response) => {
    const body = request.body as { from?: string; text?: string; groupJid?: string; via?: string };
    if (!body.text?.trim()) {
      response.status(400).json({ error: "Mensagem invalida." });
      return;
    }
    if (body.groupJid) {
      response.json(
        await handleShoppingGroupInbox(repository, body.groupJid, body.from ?? "", body.text.trim(), new Date(), body.via)
      );
      return;
    }
    if (!body.from) {
      response.status(400).json({ error: "Mensagem invalida." });
      return;
    }
    response.json(await handleSecretaryInbox(repository, body.from, body.text.trim(), new Date(), body.via));
  })
);

app.get(
  "/api/secretary/groups",
  requireAppAccess,
  asyncRoute(async (_request, response) => {
    try {
      const gateway = await fetchSecretaryGateway("/groups");
      response.status(gateway.ok ? 200 : gateway.status).json({
        ...gateway.payload,
        api: "ok"
      });
    } catch {
      response.json({
        groups: [],
        api: "ok",
        message: "A secretaria WhatsApp esta desligada. Suba o container para listar os grupos."
      });
    }
  })
);

app.get(
  "/api/plans/:id/routine",
  asyncRoute(async (request, response) => {
    const planId = await resolveRoutinePlanId(request.headers.authorization, routeParam(request.params.id, "primary"));
    const forceSync = String(request.query.sync ?? "") === "1";
    const [state, calendar] = await Promise.all([
      routineSnapshot(repository, planId),
      loadRoutineCalendarSnapshot(repository, planId, { sync: forceSync })
    ]);
    response.json({
      ...state,
      connections: calendar.connections,
      events: calendar.events,
      syncedAt: calendar.syncedAt,
      googleConfigured: googleConfigured(),
      microsoftConfigured: microsoftConfigured()
    });
  })
);

app.patch(
  "/api/plans/:id/routine",
  asyncRoute(async (request, response) => {
    const planId = await resolveRoutinePlanId(request.headers.authorization, routeParam(request.params.id, "primary"));
    const state = await saveRoutineState(repository, planId, request.body as Partial<RoutineModuleState>);
    response.json(state);
  })
);

app.get(
  "/api/routine/google/connect",
  requireAppAccess,
  asyncRoute(async (request, response) => {
    try {
      const planId = await resolveRoutinePlanId(request.headers.authorization, String(request.query.planId ?? ""));
      response.json(await startGoogleConnect(planId, requestWebOrigin(request)));
    } catch (error) {
      if (error instanceof RoutineError || error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.get(
  "/api/routine/google/callback",
  asyncRoute(async (request, response) => {
    const code = String(request.query.code ?? "");
    const state = String(request.query.state ?? "");
    const oauthError = String(request.query.error ?? "");
    if (oauthError) {
      response.redirect(googleCallbackErrorRedirect(oauthError));
      return;
    }
    try {
      const result = await finishGoogleConnect(repository, code, state);
      response.redirect(result.redirect);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao vincular o Google.";
      response.redirect(googleCallbackErrorRedirect(message));
    }
  })
);

app.get(
  "/api/routine/microsoft/connect",
  requireAppAccess,
  asyncRoute(async (request, response) => {
    try {
      const planId = await resolveRoutinePlanId(request.headers.authorization, String(request.query.planId ?? ""));
      response.json(await startMicrosoftConnect(planId, requestWebOrigin(request)));
    } catch (error) {
      if (error instanceof RoutineError || error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.get(
  "/api/routine/microsoft/callback",
  asyncRoute(async (request, response) => {
    const code = String(request.query.code ?? "");
    const state = String(request.query.state ?? "");
    const oauthError = String(request.query.error ?? "");
    const oauthDescription = String(request.query.error_description ?? oauthError);
    if (oauthError) {
      response.redirect(microsoftCallbackErrorRedirect(oauthDescription || oauthError));
      return;
    }
    try {
      const result = await finishMicrosoftConnect(repository, code, state);
      response.redirect(result.redirect);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao vincular o Teams.";
      response.redirect(microsoftCallbackErrorRedirect(message));
    }
  })
);

app.get(
  "/api/routine/google/connections/:id/calendars",
  requireAppAccess,
  asyncRoute(async (request, response) => {
    try {
      const requested = String(request.query.planId ?? "");
      const planId = requested ? await resolveRoutinePlanId(request.headers.authorization, requested) : undefined;
      response.json(await refreshConnectionCalendars(routeParam(request.params.id, ""), planId));
    } catch (error) {
      if (error instanceof RoutineError || error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.delete(
  "/api/routine/google/connections/:id",
  requireAppAccess,
  asyncRoute(async (request, response) => {
    try {
      const requested = String(request.query.planId ?? "");
      const planId = requested ? await resolveRoutinePlanId(request.headers.authorization, requested) : undefined;
      response.json(await removeGoogleConnection(repository, routeParam(request.params.id, ""), planId));
    } catch (error) {
      if (error instanceof RoutineError || error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.post(
  "/api/routine/sync",
  requireAppAccess,
  asyncRoute(async (request, response) => {
    try {
      const planId = await resolveRoutinePlanId(
        request.headers.authorization,
        String((request.body as { planId?: string })?.planId ?? request.query.planId ?? "")
      );
      response.json(await syncRoutineCalendars(repository, planId));
    } catch (error) {
      if (error instanceof RoutineError || error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.get(
  "/api/routine/events",
  requireAppAccess,
  asyncRoute(async (request, response) => {
    try {
      const planId = await resolveRoutinePlanId(request.headers.authorization, String(request.query.planId ?? ""));
      response.json(await listRoutineEvents(planId, String(request.query.from ?? "") || undefined, String(request.query.to ?? "") || undefined));
    } catch (error) {
      if (error instanceof AuthError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

app.post(
  "/api/plans/:id/transactions/:transactionId/correct",
  asyncRoute(async (request, response) => {
    const plan = await repository.get(routeParam(request.params.id, "primary"));
    const transactionId = routeParam(request.params.transactionId, "");
    const correction = request.body as Partial<
      Pick<FinancialTransaction, "audience" | "nature" | "category" | "spentByPersonId" | "recurringTransactionId">
    > & {
      spentByPersonId?: string | null;
      recurringTransactionId?: string | null;
    };
    const transaction = plan.transactions.find((item) => item.id === transactionId);

    if (!transaction) {
      response.status(404).json({ error: "Transacao nao encontrada." });
      return;
    }

    const linkedRecurring = correction.recurringTransactionId
      ? plan.recurringTransactions.find((item) => item.id === correction.recurringTransactionId)
      : undefined;
    const updatedTransaction: FinancialTransaction = {
      ...transaction,
      ...correction,
      spentByPersonId: correction.spentByPersonId || undefined,
      recurringTransactionId: correction.recurringTransactionId || undefined,
      ...(linkedRecurring
        ? {
            type: linkedRecurring.type,
            audience: linkedRecurring.audience,
            nature: linkedRecurring.nature,
            category: linkedRecurring.category
          }
        : {}),
      reviewed: true,
      confidence: 1
    };
    const nextRule = createRuleFromCorrection(updatedTransaction, {
      audience: updatedTransaction.audience,
      nature: updatedTransaction.nature,
      category: updatedTransaction.category
    });
    const rules = plan.classificationRules.filter((rule) => rule.id !== nextRule.id);
    const saved = await repository.save({
      ...plan,
      transactions: plan.transactions.map((item) => (item.id === transactionId ? updatedTransaction : item)),
      classificationRules: [...rules, nextRule]
    });

    response.json({
      plan: saved,
      rule: nextRule,
      analysis: analyzePlan(saved)
    });
  })
);

app.use((request, response) => {
  response.status(404).json({ error: `Rota nao encontrada: ${request.method} ${request.path}` });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({
    error: error instanceof Error ? error.message : "Erro interno."
  });
});

app.listen(port, () => {
  console.log(`MyLyfe API running on http://localhost:${port}`);
});
