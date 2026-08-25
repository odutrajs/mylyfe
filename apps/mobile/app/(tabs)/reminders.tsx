import type { LifeAlert } from "@mylyfe/domain";
import { isRecurringAlert, normalizeSecretaryModuleState, weekDayKeys, zonedClock, zonedDayKey } from "@mylyfe/domain";
import {
  Activity,
  Bell,
  Cake,
  FileText,
  Landmark,
  Lightbulb,
  Pill,
  Receipt,
  Repeat,
  ShoppingBag,
  Smartphone,
  Wallet
} from "lucide-react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { AnimatedCheck, FadeOnComplete, useHeldComplete } from "../../src/components/AnimatedCheck";
import { AppHeader } from "../../src/components/AppHeader";
import { Screen } from "../../src/components/Screen";
import { frequencyLabel, preciseCurrency, todayKey } from "../../src/format";
import { usePlan } from "../../src/plan-context";
import { cleanReminderNotes, groupReminderAlerts, type ReminderGroup } from "../../src/reminder-groups";
import { colors, fonts } from "../../src/theme";
import { useUI } from "../../src/ui-context";

const mascotLembretes = require("../../assets/finance/mascote-header-lembretes.png");

type Filter = "all" | "today" | "week" | "pending";

const iconBlack = "#000000";
const cardBorder = "rgba(0, 0, 0, 0.05)";
const muted = "#808080";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const iconFor = (alert: LifeAlert) => {
  const key = normalize(`${alert.title} ${alert.notes ?? ""} ${alert.kind}`);
  if (/\bluz\b|\benergia\b|\bconta (de|da|do|das)\b/.test(key)) return Lightbulb;
  if (/fisio|consulta|exame|vacina/.test(key)) return Activity;
  if (/receita|remedio|medico|dentista|saude|farmacia/.test(key)) return Pill;
  if (/mercado|compra|feira/.test(key)) return ShoppingBag;
  if (/celular|internet|plano|wifi/.test(key)) return Smartphone;
  if (/aniversario|birthday/.test(key)) return Cake;
  if (alert.kind === "tax") return Landmark;
  if (alert.kind === "subscription") return Receipt;
  if (alert.kind === "income") return Wallet;
  if (alert.kind === "document") return FileText;
  if (alert.kind === "habit") return Repeat;
  if (alert.kind === "bill") return Receipt;
  return Bell;
};

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "today", label: "Hoje" },
  { id: "week", label: "Esta semana" },
  { id: "pending", label: "Pendentes" }
];

const monthLabel = (dayKey: string) => {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const mon = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
  return `${mon.slice(0, 1).toUpperCase()}${mon.slice(1, 3)}`;
};

const todayHeading = (dayKey: string) => {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "");
  const weekdayLabel = weekday.slice(0, 1).toUpperCase() + weekday.slice(1, 3);
  return `${weekdayLabel}, ${String(day).padStart(2, "0")} ${monthLabel(dayKey)}`;
};

const formatShortDate = (iso: string, timeZone: string) => {
  const key = zonedDayKey(new Date(iso), timeZone);
  const [, , day] = key.split("-");
  return `${day} ${monthLabel(key)}`;
};

const pad = (value: number) => String(value).padStart(2, "0");

const subtitleFor = (group: ReminderGroup, timeZone: string) => {
  const alert = group.representative;
  const clock = zonedClock(alert.cycle.dueAt, timeZone);
  const parts = [formatShortDate(alert.cycle.dueAt, timeZone)];
  if (clock.hour || clock.minute) parts.push(`${pad(clock.hour)}:${pad(clock.minute)}`);
  if (isRecurringAlert(alert) || group.alerts.length > 1) {
    parts.push(isRecurringAlert(alert) ? frequencyLabel[alert.frequency] : "Próxima ocorrência");
  }
  if (alert.amount) parts.push(preciseCurrency.format(alert.amount));
  const notes = cleanReminderNotes(alert.notes);
  if (notes) parts.push(notes);
  return parts.join(" · ");
};

export default function RemindersScreen() {
  const { plan, loading, refresh, completeAlert, setAlertStatus, deleteAlert } = usePlan();
  const { openSheet } = useUI();
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );
  const { held, hold } = useHeldComplete();
  const [filter, setFilter] = useState<Filter>("all");
  const timeZone = plan?.secretary?.settings.timezone || plan?.routine?.settings.timezone || "America/Sao_Paulo";
  const today = todayKey();
  const currentMonth = today.slice(0, 7);
  const week = useMemo(() => weekDayKeys(today), [today]);
  const dueKey = (alert: LifeAlert) => zonedDayKey(new Date(alert.cycle.dueAt), timeZone);
  const inCurrentMonth = (alert: LifeAlert) => dueKey(alert).startsWith(currentMonth);

  const groups = useMemo(() => {
    const items = normalizeSecretaryModuleState(plan?.secretary).alerts.filter((alert) => {
      if (alert.status === "cancelled" || alert.status === "completed") return false;
      const key = zonedDayKey(new Date(alert.cycle.dueAt), timeZone);
      const overdue = key < today && alert.status === "active";
      return key.startsWith(currentMonth) || overdue;
    });
    return groupReminderAlerts(items, timeZone, today);
  }, [currentMonth, plan?.secretary, timeZone, today]);

  const alertMatches = (alert: LifeAlert) => {
    const key = dueKey(alert);
    const overdue = key < today && alert.status === "active";
    if (!inCurrentMonth(alert) && !overdue) return false;
    if (filter === "today") return key === today || overdue;
    if (filter === "week") return week.includes(key) || overdue;
    if (filter === "pending") {
      return alert.status === "active" && (key <= today || alert.cycle.status === "awaiting_confirmation");
    }
    return true;
  };

  const visible = groups.filter((group) => group.alerts.some(alertMatches));
  const isTodayGroup = (group: ReminderGroup) =>
    group.alerts.some((alert) => {
      const key = dueKey(alert);
      return key === today || (key < today && alert.status === "active");
    });
  const todayItems = visible.filter(isTodayGroup);
  const upcomingItems = visible.filter((group) => !isTodayGroup(group));

  const applyStatus = async (alerts: LifeAlert[], status: LifeAlert["status"]) => {
    for (const alert of alerts) await setAlertStatus(alert.id, status);
  };

  const confirmDelete = (group: ReminderGroup) => {
    const count = group.alerts.length;
    const message =
      count > 1
        ? `Remover as ${count} ocorrências de "${group.representative.title}"?`
        : `Remover "${group.representative.title}"?`;
    Alert.alert("Excluir lembrete", message, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () =>
          void (async () => {
            for (const alert of group.alerts) await deleteAlert(alert.id);
          })()
      }
    ]);
  };

  const openActions = (group: ReminderGroup) => {
    const next = group.representative;
    const series = isRecurringAlert(next) || group.alerts.length > 1;
    const buttons: Array<{ text: string; style?: "cancel" | "destructive"; onPress?: () => void }> = [];
    if (next.status === "active") {
      buttons.push({
        text: series ? "Concluir esta ocorrência" : "Concluir",
        onPress: () => hold(next.id, () => completeAlert(next.id))
      });
      buttons.push({ text: "Pausar", onPress: () => void applyStatus(group.alerts, "paused") });
      if (series) {
        buttons.push({
          text: "Encerrar série",
          onPress: () => hold(next.id, () => applyStatus(group.alerts, "completed"))
        });
      }
    } else {
      buttons.push({ text: "Reativar", onPress: () => void applyStatus(group.alerts, "active") });
    }
    buttons.push({ text: "Excluir", style: "destructive", onPress: () => confirmDelete(group) });
    buttons.push({ text: "Cancelar", style: "cancel" });
    Alert.alert(next.title, subtitleFor(group, timeZone), buttons);
  };

  return (
    <Screen
      header={
        <AppHeader
          title="Lembretes"
          mascot={mascotLembretes}
          wideMascot
          action={{
            label: "Criar lembrete",
            icon: Bell,
            onPress: () => openSheet("reminder")
          }}
        />
      }
      refreshing={loading}
      onRefresh={() => void refresh()}
      padded={false}
    >
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {filters.map((item) => {
              const active = filter === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setFilter(item.id)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 100,
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderWidth: active ? 0 : 1,
                    borderColor: cardBorder
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: active ? fonts.regular : fonts.medium,
                      color: active ? "#FFFFFF" : colors.text
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {visible.length === 0 ? (
            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: cardBorder,
                borderRadius: 20,
                padding: 16,
                gap: 4
              }}
            >
              <Text style={{ fontSize: 15, fontFamily: fonts.regular, color: colors.text }}>Nada por aqui</Text>
              <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: muted }}>
                Quando quiser, cria um lembrete e eu fico de olho.
              </Text>
            </View>
          ) : (
            <>
              {todayItems.length > 0 ? (
                <View style={{ gap: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 16, fontFamily: fonts.semibold, color: colors.text }}>Hoje</Text>
                    <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: muted }}>{todayHeading(today)}</Text>
                  </View>
                  <View style={{ gap: 8 }}>
                    {todayItems.map((group) => (
                      <ReminderCard
                        key={group.id}
                        group={group}
                        timeZone={timeZone}
                        urgent
                        completing={Boolean(held[group.representative.id])}
                        onPress={() => openActions(group)}
                        onComplete={() => hold(group.representative.id, () => completeAlert(group.representative.id))}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {upcomingItems.length > 0 && filter !== "today" ? (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: 16, fontFamily: fonts.semibold, color: colors.text }}>Próximos dias</Text>
                  <View style={{ gap: 8 }}>
                    {upcomingItems.map((group) => (
                      <ReminderCard
                        key={group.id}
                        group={group}
                        timeZone={timeZone}
                        urgent={false}
                        completing={Boolean(held[group.representative.id])}
                        onPress={() => openActions(group)}
                        onComplete={() => hold(group.representative.id, () => completeAlert(group.representative.id))}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
      </View>
    </Screen>
  );
}

function ReminderCard({
  group,
  timeZone,
  urgent,
  completing,
  onPress,
  onComplete
}: {
  group: ReminderGroup;
  timeZone: string;
  urgent: boolean;
  completing: boolean;
  onPress: () => void;
  onComplete: () => void;
}) {
  const Icon = iconFor(group.representative);
  const done =
    completing || group.representative.status === "completed" || group.representative.cycle.status === "paid";
  return (
    <FadeOnComplete active={completing}>
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: cardBorder,
          borderRadius: 20,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 12
        }}
      >
        <AnimatedCheck
          checked={done}
          onPress={onComplete}
          accessibilityLabel={`Concluir ${group.representative.title}`}
        />
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: "#F3F4F6",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Icon size={18} color={iconBlack} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontSize: 14,
              fontFamily: fonts.regular,
              color: done ? muted : colors.text,
              textDecorationLine: done ? "line-through" : "none"
            }}
          >
            {group.representative.title}
          </Text>
          <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: muted }}>{subtitleFor(group, timeZone)}</Text>
        </View>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: urgent ? colors.warning : muted,
            opacity: urgent ? 1 : 0.3
          }}
        />
      </Pressable>
    </FadeOnComplete>
  );
}
