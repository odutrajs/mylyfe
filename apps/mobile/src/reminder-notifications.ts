import type { LifeAlert } from "@mylyfe/domain";
import { isRecurringAlert } from "@mylyfe/domain";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiRequest } from "./api";
import { upcomingNotificationTriggers } from "./reminder-schedule";

export { fireAtFor, upcomingNotificationTriggers } from "./reminder-schedule";

const channelId = "reminders";

type NotificationsModule = typeof import("expo-notifications");

let notifications: NotificationsModule | null = null;
let syncGeneration = 0;

const loadNotifications = async () => {
  if (Platform.OS === "web") return null;
  if (notifications) return notifications;
  notifications = await import("expo-notifications");
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  });
  return notifications;
};

const bodyFor = (alert: LifeAlert) => {
  if (isRecurringAlert(alert)) return "Marque esta ocorrência quando terminar. A próxima aparece depois.";
  if (alert.amount) return `Valor: R$ ${alert.amount.toFixed(2).replace(".", ",")}`;
  return alert.notes?.replace(/^slot:(vespera|3h|1h|15m|checkin)(?: · )*/i, "").trim() || "Toque para abrir os lembretes.";
};

export const syncReminderNotifications = async (
  alerts: LifeAlert[],
  options?: {
    loggedIn?: boolean;
    askForPush?: boolean;
    onPushRegistered?: () => void;
  }
) => {
  const generation = ++syncGeneration;
  const module = await loadNotifications();
  if (!module || !options?.loggedIn || generation !== syncGeneration) return;

  const current = await module.getPermissionsAsync();
  const granted =
    current.granted ||
    current.ios?.status === module.IosAuthorizationStatus.AUTHORIZED ||
    current.ios?.status === module.IosAuthorizationStatus.PROVISIONAL;
  if (!granted) {
    if (!options.askForPush) return;
    const permission = await module.requestPermissionsAsync();
    if (permission.status !== "granted") return;
  }
  if (generation !== syncGeneration) return;

  const saved = await registerExpoPushToken(module);
  if (saved) options.onPushRegistered?.();
  if (generation !== syncGeneration) return;

  if (Platform.OS === "android") {
    await module.setNotificationChannelAsync(channelId, {
      name: "Lembretes",
      importance: module.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180]
    });
  }

  await module.cancelAllScheduledNotificationsAsync();
  if (generation !== syncGeneration) return;

  const now = Date.now();
  for (const { alert, date } of upcomingNotificationTriggers(alerts, now)) {
    if (generation !== syncGeneration) return;
    await module.scheduleNotificationAsync({
      identifier: `reminder-${alert.id}`,
      content: {
        title: alert.title,
        body: bodyFor(alert),
        data: { alertId: alert.id, screen: "reminders" },
        sound: true
      },
      trigger: {
        type: module.SchedulableTriggerInputTypes.DATE,
        date,
        channelId
      }
    });
  }
};

const registerExpoPushToken = async (module: NotificationsModule) => {
  try {
    const projectId =
      Constants.easConfig?.projectId ??
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const push = await module.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = push.data?.trim() ?? "";
    if (!token) return false;
    await apiRequest("/auth/push-token", {
      method: "POST",
      body: JSON.stringify({ token, platform: Platform.OS })
    });
    return true;
  } catch {
    return false;
  }
};

export const listenReminderNotification = (
  onOpen: (alertId?: string) => void
) => {
  let cancelled = false;
  let remove: (() => void) | undefined;
  void loadNotifications().then((module) => {
    if (!module || cancelled) return;
    const sub = module.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { alertId?: string };
      onOpen(typeof data.alertId === "string" ? data.alertId : undefined);
    });
    remove = () => sub.remove();
  });
  return () => {
    cancelled = true;
    remove?.();
  };
};
