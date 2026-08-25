import { listUsers, type StoredPushToken, type StoredUser } from "./auth-store.js";

const expoPushUrl = "https://exp.host/--/api/v2/push/send";

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default";
  channelId?: string;
};

export const usersForPlan = (users: StoredUser[], planId: string) =>
  users.filter((user) => user.personalPlanId === planId || user.activePlanId === planId);

export const pushTokensForPlan = (users: StoredUser[], planId: string): StoredPushToken[] => {
  const seen = new Set<string>();
  const tokens: StoredPushToken[] = [];
  for (const user of usersForPlan(users, planId)) {
    for (const item of user.pushTokens ?? []) {
      if (!item.token || seen.has(item.token)) continue;
      seen.add(item.token);
      tokens.push(item);
    }
  }
  return tokens;
};

export const stripSecretaryMarkup = (text: string) =>
  text
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const expoPushMessagesForJob = (
  tokens: StoredPushToken[],
  input: { title: string; text: string; alertId?: string }
): ExpoPushMessage[] => {
  const body = stripSecretaryMarkup(input.text);
  if (!body) return [];
  return tokens.map((item) => ({
    to: item.token,
    title: input.title.trim() || "Lembrete",
    body,
    sound: "default" as const,
    channelId: item.platform === "android" ? "reminders" : undefined,
    data: {
      screen: "reminders",
      ...(input.alertId ? { alertId: input.alertId } : {})
    }
  }));
};

export const sendExpoPush = async (messages: ExpoPushMessage[]) => {
  if (!messages.length) return { sent: 0 };
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json"
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(expoPushUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(messages)
  });
  if (!response.ok) {
    throw new Error(`Falha ao enviar push (${response.status}).`);
  }
  return { sent: messages.length };
};

export const notifyPlanDevices = async (
  planId: string,
  input: { title: string; text: string; alertId?: string }
) => {
  const messages = expoPushMessagesForJob(pushTokensForPlan(await listUsers(), planId), input);
  if (!messages.length) return { sent: 0 };
  try {
    return await sendExpoPush(messages);
  } catch {
    return { sent: 0 };
  }
};
