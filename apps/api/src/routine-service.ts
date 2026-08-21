import {
  mergeRoutineLocalEvents,
  normalizeRoutineModuleState,
  type RoutineCalendarEvent,
  type RoutineCalendarLink,
  type RoutineModuleState
} from "@mylyfe/domain";
import { randomUUID } from "node:crypto";
import type { PlanRepository } from "./repository.js";
import {
  consumeOAuthState,
  decryptSecret,
  deleteConnection,
  encryptSecret,
  getConnection,
  listConnections,
  publicConnection,
  readEventCache,
  saveOAuthState,
  upsertConnection,
  writeEventCache,
  type GoogleCalendarSummary,
  type RoutineCalendarConnection
} from "./routine-calendar-store.js";

const googleAuthUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const googleScopes = ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/userinfo.email"];
const microsoftAuthUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const microsoftTokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const microsoftScopes = ["offline_access", "User.Read", "Calendars.Read"];

export class RoutineError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const nowIso = () => new Date().toISOString();

const parseWebOrigins = (value = process.env.WEB_ORIGIN ?? "http://localhost:5173") =>
  value
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => /^https?:\/\/[^,\s/]+$/i.test(origin));

const resolveWebOrigin = (preferred?: string) => {
  const origins = parseWebOrigins();
  const normalized = preferred?.trim().replace(/\/$/, "");
  if (normalized && origins.includes(normalized)) return normalized;
  return origins[0] ?? "http://localhost:5173";
};

const calendarReturnUrl = (query: Record<string, string>, returnOrigin?: string) => {
  const redirect = new URL(resolveWebOrigin(returnOrigin));
  for (const [key, value] of Object.entries(query)) {
    redirect.searchParams.set(key, value);
  }
  return redirect.toString();
};

const googleConfig = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3333/api/routine/google/callback";
  const webOrigin = resolveWebOrigin();
  return { clientId, clientSecret, redirectUri, webOrigin, configured: Boolean(clientId && clientSecret) };
};

const microsoftConfig = () => {
  const clientId = process.env.MICROSOFT_CLIENT_ID ?? "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET ?? "";
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI ?? "http://localhost:3333/api/routine/microsoft/callback";
  const webOrigin = resolveWebOrigin();
  return { clientId, clientSecret, redirectUri, webOrigin, configured: Boolean(clientId && clientSecret) };
};

export const routineSnapshot = async (repository: PlanRepository, planId: string) => {
  const plan = await repository.get(planId);
  return normalizeRoutineModuleState(plan.routine);
};

export const saveRoutineState = async (
  repository: PlanRepository,
  planId: string,
  incoming: Partial<RoutineModuleState>
) => {
  const plan = await repository.get(planId);
  const next = normalizeRoutineModuleState({
    ...plan.routine,
    ...incoming,
    localEvents: mergeRoutineLocalEvents(incoming.localEvents ?? plan.routine.localEvents, plan.routine.localEvents),
    updatedAt: nowIso()
  });
  await repository.save({
    ...plan,
    routine: next
  });
  return next;
};

const googleHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`
});

const readGoogleJson = async (response: Response) => {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = typeof payload.error === "string" ? payload.error : "Falha ao falar com o Google.";
    const description = typeof payload.error_description === "string" ? ` ${payload.error_description}` : "";
    throw new RoutineError(`${error}${description}`.trim(), response.status === 401 ? 401 : 502);
  }
  return payload;
};

const exchangeGoogleCode = async (code: string) => {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });
  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  return readGoogleJson(response) as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>;
};

const refreshGoogleAccessToken = async (refreshToken: string) => {
  const { clientId, clientSecret } = googleConfig();
  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token"
    })
  });
  return readGoogleJson(response) as Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>;
};

const readMicrosoftJson = async (response: Response) => {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = typeof payload.error === "string" ? payload.error : "Falha ao falar com a Microsoft.";
    const description = typeof payload.error_description === "string" ? ` ${payload.error_description}` : "";
    throw new RoutineError(`${error}${description}`.trim(), response.status === 401 ? 401 : 502);
  }
  return payload;
};

const exchangeMicrosoftCode = async (code: string) => {
  const { clientId, clientSecret, redirectUri } = microsoftConfig();
  const response = await fetch(microsoftTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: microsoftScopes.join(" ")
    })
  });
  return readMicrosoftJson(response) as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>;
};

const refreshMicrosoftAccessToken = async (refreshToken: string) => {
  const { clientId, clientSecret } = microsoftConfig();
  const response = await fetch(microsoftTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      scope: microsoftScopes.join(" ")
    })
  });
  return readMicrosoftJson(response) as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>;
};

const microsoftEmail = async (accessToken: string) => {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await readMicrosoftJson(response);
  const email =
    (typeof payload.mail === "string" && payload.mail) ||
    (typeof payload.userPrincipalName === "string" && payload.userPrincipalName) ||
    "";
  if (!email) throw new RoutineError("A Microsoft nao devolveu o e-mail da conta.");
  return email;
};

const microsoftCalendarColor = (calendar: Record<string, unknown>) => {
  const hex = typeof calendar.hexColor === "string" ? calendar.hexColor.replace(/^#/, "") : "";
  if (hex.length === 6) return `#${hex}`;
  return "#6264A7";
};

const listMicrosoftCalendars = async (accessToken: string): Promise<GoogleCalendarSummary[]> => {
  const calendars: GoogleCalendarSummary[] = [];
  let next = "https://graph.microsoft.com/v1.0/me/calendars?$top=50&$select=id,name,hexColor,isDefaultCalendar";
  while (next) {
    const response = await fetch(next, { headers: { Authorization: `Bearer ${accessToken}` } });
    const payload = await readMicrosoftJson(response);
    const items = Array.isArray(payload.value) ? payload.value : [];
    for (const item of items) {
      const calendar = item as Record<string, unknown>;
      const externalId = typeof calendar.id === "string" ? calendar.id : "";
      if (!externalId) continue;
      calendars.push({
        externalId,
        name: typeof calendar.name === "string" ? calendar.name : "Calendario",
        color: microsoftCalendarColor(calendar),
        primary: calendar.isDefaultCalendar === true
      });
    }
    next = typeof payload["@odata.nextLink"] === "string" ? payload["@odata.nextLink"] : "";
  }
  return calendars;
};

const microsoftDateToIso = (value: { dateTime?: string; timeZone?: string } | undefined, allDay?: boolean) => {
  if (!value?.dateTime) return "";
  if (allDay) return value.dateTime.slice(0, 10);
  const raw = value.dateTime.replace(/\.\d+$/, "");
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) return raw;
  return `${raw}Z`;
};

const microsoftMeetingUrl = (event: Record<string, unknown>) => {
  if (typeof event.onlineMeetingUrl === "string" && event.onlineMeetingUrl) return event.onlineMeetingUrl;
  const meeting = event.onlineMeeting as { joinUrl?: string } | undefined;
  return meeting?.joinUrl;
};

const fetchMicrosoftEvents = async (
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<Array<Record<string, unknown>>> => {
  const items: Array<Record<string, unknown>> = [];
  const params = new URLSearchParams({
    startDateTime: timeMin,
    endDateTime: timeMax,
    $top: "100",
    $select: "id,subject,start,end,isAllDay,isCancelled,location,onlineMeeting,onlineMeetingUrl,showAs"
  });
  let next = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params}`;
  while (next) {
    const response = await fetch(next, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"'
      }
    });
    const payload = await readMicrosoftJson(response);
    items.push(...((payload.value as Array<Record<string, unknown>> | undefined) ?? []));
    next = typeof payload["@odata.nextLink"] === "string" ? payload["@odata.nextLink"] : "";
  }
  return items;
};

const googleEmail = async (accessToken: string) => {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: googleHeaders(accessToken)
  });
  const payload = await readGoogleJson(response);
  const email = typeof payload.email === "string" ? payload.email : "";
  if (!email) throw new RoutineError("O Google nao devolveu o e-mail da conta.");
  return email;
};

const listGoogleCalendars = async (accessToken: string): Promise<GoogleCalendarSummary[]> => {
  const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: googleHeaders(accessToken)
  });
  const payload = await readGoogleJson(response);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const calendars: GoogleCalendarSummary[] = [];
  for (const item of items) {
    const calendar = item as Record<string, unknown>;
    const externalId = typeof calendar.id === "string" ? calendar.id : "";
    if (!externalId) continue;
    calendars.push({
      externalId,
      name: typeof calendar.summary === "string" ? calendar.summary : "Calendario",
      color: typeof calendar.backgroundColor === "string" ? calendar.backgroundColor : "#64748b",
      primary: calendar.primary === true
    });
  }
  return calendars;
};

const meetingUrlFromEvent = (event: Record<string, unknown>) => {
  if (typeof event.hangoutLink === "string" && event.hangoutLink) return event.hangoutLink;
  const conference = event.conferenceData as { entryPoints?: Array<{ entryPointType?: string; uri?: string }> } | undefined;
  const video = conference?.entryPoints?.find((entry) => entry.entryPointType === "video" && entry.uri);
  return video?.uri;
};

const fetchGoogleEvents = async (
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<Array<Record<string, unknown>>> => {
  const items: Array<Record<string, unknown>> = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin,
      timeMax,
      maxResults: "250"
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: googleHeaders(accessToken) }
    );
    const payload = await readGoogleJson(response);
    items.push(...((payload.items as Array<Record<string, unknown>> | undefined) ?? []));
    pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : "";
  } while (pageToken);
  return items;
};

const ensureAccessToken = async (connection: RoutineCalendarConnection) => {
  const expiresAt = connection.accessTokenExpiresAt ? Date.parse(connection.accessTokenExpiresAt) : 0;
  if (connection.accessToken && expiresAt - 60_000 > Date.now()) {
    return { connection, accessToken: connection.accessToken };
  }

  const refreshToken = decryptSecret(connection.refreshToken);
  const refreshed =
    connection.provider === "microsoft"
      ? await refreshMicrosoftAccessToken(refreshToken)
      : await refreshGoogleAccessToken(refreshToken);
  const next: RoutineCalendarConnection = {
    ...connection,
    refreshToken: refreshed.refresh_token ? encryptSecret(refreshed.refresh_token) : connection.refreshToken,
    accessToken: refreshed.access_token,
    accessTokenExpiresAt: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString(),
    updatedAt: nowIso()
  };
  await upsertConnection(next);
  return { connection: next, accessToken: next.accessToken ?? refreshed.access_token };
};

export const startGoogleConnect = async (planId: string, returnOrigin?: string) => {
  const config = googleConfig();
  if (!config.configured) {
    throw new RoutineError("Google Calendar nao esta configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.", 503);
  }
  if (!planId.trim()) throw new RoutineError("Informe o plano.");

  const state = await saveOAuthState({
    id: randomUUID(),
    planId: planId.trim(),
    returnOrigin: resolveWebOrigin(returnOrigin),
    createdAt: nowIso()
  });
  const url = new URL(googleAuthUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleScopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state.id);
  return { url: url.toString() };
};

export const finishGoogleConnect = async (repository: PlanRepository, code: string, stateId: string) => {
  const config = googleConfig();
  const state = await consumeOAuthState(stateId);
  if (!state) throw new RoutineError("Estado OAuth invalido ou expirado.", 400);
  const tokens = await exchangeGoogleCode(code);
  if (!tokens.refresh_token) {
    throw new RoutineError("O Google nao devolveu refresh token. Revogue o acesso do MyLyfe e vincule de novo.", 400);
  }

  const email = await googleEmail(tokens.access_token);
  const calendars = await listGoogleCalendars(tokens.access_token);
  const existing = (await listConnections(state.planId)).find((item) => item.provider === "google" && item.accountEmail === email);
  const connection = await upsertConnection({
    id: existing?.id ?? `google-${randomUUID()}`,
    planId: state.planId,
    provider: "google",
    accountEmail: email,
    refreshToken: encryptSecret(tokens.refresh_token),
    accessToken: tokens.access_token,
    accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    calendars,
    lastSyncAt: existing?.lastSyncAt,
    lastSyncError: undefined,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso()
  });

  const plan = await repository.get(state.planId);
  const existingLinks = new Set(plan.routine.calendarLinks.map((link) => `${link.connectionId}:${link.externalCalendarId}`));
  const nextLinks: RoutineCalendarLink[] = [
    ...plan.routine.calendarLinks,
    ...calendars
      .filter((calendar) => !existingLinks.has(`${connection.id}:${calendar.externalId}`))
      .map((calendar) => ({
        id: `link-${randomUUID()}`,
        connectionId: connection.id,
        externalCalendarId: calendar.externalId,
        name: calendar.name,
        color: calendar.color,
        enabled: false
      }))
  ];
  await saveRoutineState(repository, state.planId, { ...plan.routine, calendarLinks: nextLinks });

  return {
    redirect: calendarReturnUrl({ routine: "calendars", google: "connected" }, state.returnOrigin),
    connection: publicConnection(connection)
  };
};

export const googleCallbackErrorRedirect = (message: string, returnOrigin?: string) =>
  calendarReturnUrl({ routine: "calendars", google: "error", message }, returnOrigin);

export const startMicrosoftConnect = async (planId: string, returnOrigin?: string) => {
  const config = microsoftConfig();
  if (!config.configured) {
    throw new RoutineError("Teams/Outlook nao esta configurado. Defina MICROSOFT_CLIENT_ID e MICROSOFT_CLIENT_SECRET.", 503);
  }
  if (!planId.trim()) throw new RoutineError("Informe o plano.");

  const state = await saveOAuthState({
    id: randomUUID(),
    planId: planId.trim(),
    returnOrigin: resolveWebOrigin(returnOrigin),
    createdAt: nowIso()
  });
  const url = new URL(microsoftAuthUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", microsoftScopes.join(" "));
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state.id);
  return { url: url.toString() };
};

export const finishMicrosoftConnect = async (repository: PlanRepository, code: string, stateId: string) => {
  const config = microsoftConfig();
  const state = await consumeOAuthState(stateId);
  if (!state) throw new RoutineError("Estado OAuth invalido ou expirado.", 400);
  const tokens = await exchangeMicrosoftCode(code);
  if (!tokens.refresh_token) {
    throw new RoutineError("A Microsoft nao devolveu refresh token. Confira o escopo offline_access e tente de novo.", 400);
  }

  const email = await microsoftEmail(tokens.access_token);
  const calendars = await listMicrosoftCalendars(tokens.access_token);
  const existing = (await listConnections(state.planId)).find(
    (item) => item.provider === "microsoft" && item.accountEmail === email
  );
  const connection = await upsertConnection({
    id: existing?.id ?? `microsoft-${randomUUID()}`,
    planId: state.planId,
    provider: "microsoft",
    accountEmail: email,
    refreshToken: encryptSecret(tokens.refresh_token),
    accessToken: tokens.access_token,
    accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    calendars,
    lastSyncAt: existing?.lastSyncAt,
    lastSyncError: undefined,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso()
  });

  const plan = await repository.get(state.planId);
  const existingLinks = new Set(plan.routine.calendarLinks.map((link) => `${link.connectionId}:${link.externalCalendarId}`));
  const nextLinks: RoutineCalendarLink[] = [
    ...plan.routine.calendarLinks,
    ...calendars
      .filter((calendar) => !existingLinks.has(`${connection.id}:${calendar.externalId}`))
      .map((calendar) => ({
        id: `link-${randomUUID()}`,
        connectionId: connection.id,
        externalCalendarId: calendar.externalId,
        name: calendar.name,
        color: calendar.color,
        enabled: false
      }))
  ];
  await saveRoutineState(repository, state.planId, { ...plan.routine, calendarLinks: nextLinks });

  return {
    redirect: calendarReturnUrl({ routine: "calendars", microsoft: "connected" }, state.returnOrigin),
    connection: publicConnection(connection)
  };
};

export const microsoftCallbackErrorRedirect = (message: string, returnOrigin?: string) =>
  calendarReturnUrl({ routine: "calendars", microsoft: "error", message }, returnOrigin);

export const listPublicConnections = async (planId: string) => (await listConnections(planId)).map(publicConnection);

export const removeGoogleConnection = async (repository: PlanRepository, connectionId: string, planId?: string) => {
  const connection = await getConnection(connectionId);
  if (!connection || (planId && connection.planId !== planId)) {
    throw new RoutineError("Conta de calendario nao encontrada.", 404);
  }
  await deleteConnection(connectionId);
  const plan = await repository.get(connection.planId);
  await saveRoutineState(repository, connection.planId, {
    ...plan.routine,
    calendarLinks: plan.routine.calendarLinks.filter((link) => link.connectionId !== connectionId)
  });
  return { ok: true };
};

export const refreshConnectionCalendars = async (connectionId: string, planId?: string) => {
  const connection = await getConnection(connectionId);
  if (!connection || (planId && connection.planId !== planId)) {
    throw new RoutineError("Conta de calendario nao encontrada.", 404);
  }
  const { connection: fresh, accessToken } = await ensureAccessToken(connection);
  const calendars =
    connection.provider === "microsoft" ? await listMicrosoftCalendars(accessToken) : await listGoogleCalendars(accessToken);
  const next = await upsertConnection({
    ...fresh,
    calendars,
    updatedAt: nowIso()
  });
  return publicConnection(next);
};

const enabledLinks = (state: RoutineModuleState) => state.calendarLinks.filter((link) => link.enabled);

export const syncRoutineCalendars = async (repository: PlanRepository, planId: string) => {
  const plan = await repository.get(planId);
  const state = normalizeRoutineModuleState(plan.routine);
  const links = enabledLinks(state);
  const connections = await listConnections(planId);
  if (!links.length) {
    const empty = await writeEventCache(planId, []);
    return { events: empty.events, syncedAt: empty.syncedAt, connections: connections.map(publicConnection) };
  }

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 7);
  const to = new Date();
  to.setUTCDate(to.getUTCDate() + 55);
  const timeMin = from.toISOString();
  const timeMax = to.toISOString();
  const events: RoutineCalendarEvent[] = [];
  const errors: string[] = [];

  for (const connection of connections) {
    const connectionLinks = links.filter((link) => link.connectionId === connection.id);
    if (!connectionLinks.length) continue;

    try {
      const { connection: fresh, accessToken } = await ensureAccessToken(connection);
      for (const link of connectionLinks) {
        if (connection.provider === "microsoft") {
          const items = await fetchMicrosoftEvents(accessToken, link.externalCalendarId, timeMin, timeMax);
          for (const item of items) {
            if (item.isCancelled === true || typeof item.id !== "string") continue;
            const allDay = item.isAllDay === true;
            const startValue = microsoftDateToIso(item.start as { dateTime?: string; timeZone?: string }, allDay);
            const endValue = microsoftDateToIso(item.end as { dateTime?: string; timeZone?: string }, allDay);
            if (!startValue || !endValue) continue;
            const location = item.location as { displayName?: string } | undefined;
            events.push({
              id: `${connection.id}:${link.externalCalendarId}:${item.id}`,
              connectionId: connection.id,
              calendarId: link.externalCalendarId,
              contextId: link.contextId,
              title: typeof item.subject === "string" && item.subject ? item.subject : "(Sem titulo)",
              start: startValue,
              end: endValue,
              allDay,
              location: location?.displayName,
              meetingUrl: microsoftMeetingUrl(item),
              status: "confirmed"
            });
          }
          continue;
        }

        const items = await fetchGoogleEvents(accessToken, link.externalCalendarId, timeMin, timeMax);
        for (const item of items) {
          const start = (item.start as { dateTime?: string; date?: string } | undefined) ?? {};
          const end = (item.end as { dateTime?: string; date?: string } | undefined) ?? {};
          const startValue = start.dateTime || start.date;
          const endValue = end.dateTime || end.date;
          if (!startValue || !endValue || typeof item.id !== "string") continue;
          events.push({
            id: `${connection.id}:${link.externalCalendarId}:${item.id}`,
            connectionId: connection.id,
            calendarId: link.externalCalendarId,
            contextId: link.contextId,
            title: typeof item.summary === "string" && item.summary ? item.summary : "(Sem titulo)",
            start: start.dateTime ?? startValue,
            end: end.dateTime ?? endValue,
            allDay: Boolean(start.date && !start.dateTime),
            location: typeof item.location === "string" ? item.location : undefined,
            meetingUrl: meetingUrlFromEvent(item),
            status: typeof item.status === "string" ? item.status : undefined
          });
        }
      }
      await upsertConnection({
        ...fresh,
        lastSyncAt: nowIso(),
        lastSyncError: undefined,
        updatedAt: nowIso()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no sync.";
      errors.push(`${connection.accountEmail}: ${message}`);
      await upsertConnection({
        ...connection,
        lastSyncError: message,
        updatedAt: nowIso()
      });
    }
  }

  const cache = await writeEventCache(planId, events);
  return {
    events: cache.events,
    syncedAt: cache.syncedAt,
    connections: (await listConnections(planId)).map(publicConnection),
    errors
  };
};

export const listRoutineEvents = async (planId: string, from?: string, to?: string) => {
  const cache = await readEventCache(planId);
  const fromTime = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
  const toTime = to ? Date.parse(to) : Number.POSITIVE_INFINITY;
  const events = cache.events.filter((event) => {
    const start = Date.parse(event.start) || 0;
    return start >= fromTime && start <= toTime;
  });
  return {
    events,
    syncedAt: cache.syncedAt
  };
};

export const googleConfigured = () => googleConfig().configured;
export const microsoftConfigured = () => microsoftConfig().configured;
