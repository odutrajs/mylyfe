import { useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { useAuth } from "../auth-context";
import { listenReminderNotification, syncReminderNotifications } from "../reminder-notifications";
import { usePlan } from "../plan-context";

export function ReminderNotifications() {
  const router = useRouter();
  const { session, markPushTokenSaved } = useAuth();
  const { plan } = usePlan();
  const alerts = plan?.secretary?.alerts ?? [];
  const stamp = useMemo(
    () =>
      alerts
        .filter((alert) => alert.status === "active")
        .map((alert) => `${alert.id}:${alert.cycle.remindAt}:${alert.cycle.dueAt}`)
        .join("|"),
    [alerts]
  );

  useEffect(() => {
    if (!session) return;
    void syncReminderNotifications(alerts, {
      loggedIn: true,
      askForPush: session.hasPushToken !== true,
      onPushRegistered: markPushTokenSaved
    });
  }, [alerts, markPushTokenSaved, session?.hasPushToken, session?.userId, stamp]);

  useEffect(() => {
    return listenReminderNotification(() => {
      router.push("/(tabs)/reminders");
    });
  }, [router]);

  return null;
}
