import {
  analyzePlan,
  calculateMonthlyCashFlow,
  eventsForDay,
  formatMonthKey,
  normalizeRoutineModuleState,
  normalizeSecretaryModuleState,
  zonedClock,
  zonedDayKey
} from "@mylyfe/domain";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { Animated, Image, Platform, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth-context";
import { AnimatedCheck, FadeOnComplete, useHeldComplete } from "../../src/components/AnimatedCheck";
import { ProfileButton } from "../../src/components/ProfileButton";
import { SpendRing } from "../../src/components/SpendRing";
import { currency, firstName, preciseCurrency, reminderWhen, todayKey } from "../../src/format";
import { usePlan } from "../../src/plan-context";
import { cleanReminderNotes, homeReminderGroups } from "../../src/reminder-groups";
import { colors, fonts, radius } from "../../src/theme";

const mascotLeft = require("../../assets/home/mascot-left.png");
const mascotRight = require("../../assets/home/mascot-right.png");
const mascotCompact = require("../../assets/home/mascot-compact.png");

const agendaTints = [colors.accent, colors.success, colors.shared];
const cardBorder = "rgba(0, 0, 0, 0.05)";
const greetingInk = "#1F1F1F";
const titleInk = "#102A4C";
const linkBlue = "#1A8FE3";
const muted = "#808080";
const heroExtra = 232;
const compactBody = 80;

const sectionTitleStyle = {
  fontFamily: Platform.OS === "ios" ? undefined : fonts.bold,
  fontWeight: "300" as const,
  fontSize: 14,
  lineHeight: 16,
  letterSpacing: 0.2,
  color: titleInk,
  includeFontPadding: false
};

const sectionLinkStyle = {
  fontFamily: Platform.OS === "ios" ? undefined : fonts.semibold,
  fontWeight: "400" as const,
  fontSize: 12,
  lineHeight: 15,
  color: linkBlue,
  includeFontPadding: false
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const { plan, events, loading, refresh, updatePlan, completeAlert } = usePlan();
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );
  const { held, hold } = useHeldComplete();
  const scrollY = useRef(new Animated.Value(0)).current;
  const asOf = useMemo(() => new Date(), []);
  const today = todayKey();
  const timeZone = plan?.routine?.settings.timezone || plan?.secretary?.settings.timezone || "America/Sao_Paulo";
  const name = firstName(plan?.profile.people.find((person) => person.role === "primary")?.name || session?.name);

  const analysis = useMemo(() => (plan ? analyzePlan(plan, asOf) : null), [asOf, plan]);
  const income = useMemo(
    () => (plan ? calculateMonthlyCashFlow(plan, formatMonthKey(asOf)).income : 0),
    [asOf, plan]
  );
  const monthlySpend =
    (analysis?.spending.currentMonthSpend ?? 0) > 0
      ? (analysis?.spending.currentMonthSpend ?? 0)
      : (analysis?.spending.livingCostUsed ?? 0);
  const saved = Math.max(0, income - monthlySpend);
  const saveRate = income > 0 ? saved / income : 0;

  const reminders = useMemo(
    () => homeReminderGroups(normalizeSecretaryModuleState(plan?.secretary).alerts, timeZone, today),
    [plan?.secretary, timeZone, today]
  );

  const agenda = useMemo(
    () => eventsForDay(events.filter((event) => event.status !== "cancelled"), today, timeZone).slice(0, 3),
    [events, timeZone, today]
  );

  const tasks = useMemo(() => {
    const routine = normalizeRoutineModuleState(plan?.routine);
    return routine.tasks
      .filter((task) => task.status !== "inbox" && (task.scheduledDate === today || task.dueDate === today || task.focusToday))
      .sort((left, right) => {
        const leftDone = left.status === "done" ? 1 : 0;
        const rightDone = right.status === "done" ? 1 : 0;
        if (leftDone !== rightDone) return leftDone - rightDone;
        return left.title.localeCompare(right.title, "pt-BR");
      });
  }, [plan?.routine, today]);
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const expanded = insets.top + heroExtra;
  const compact = insets.top + compactBody;
  const collapse = expanded - compact;

  const headerHeight = scrollY.interpolate({
    inputRange: [0, collapse],
    outputRange: [expanded, compact],
    extrapolate: "clamp"
  });
  const headerRadius = scrollY.interpolate({
    inputRange: [0, collapse],
    outputRange: [0, 28],
    extrapolate: "clamp"
  });
  const heroOpacity = scrollY.interpolate({
    inputRange: [0, collapse * 0.7],
    outputRange: [1, 0],
    extrapolate: "clamp"
  });
  const heroScale = scrollY.interpolate({
    inputRange: [0, collapse],
    outputRange: [1, 0.38],
    extrapolate: "clamp"
  });
  const compactOpacity = scrollY.interpolate({
    inputRange: [collapse * 0.45, collapse],
    outputRange: [0, 1],
    extrapolate: "clamp"
  });
  const profileTop = scrollY.interpolate({
    inputRange: [0, collapse],
    outputRange: [insets.top + 8, insets.top + 21],
    extrapolate: "clamp"
  });
  const headerShadow = scrollY.interpolate({
    inputRange: [0, collapse],
    outputRange: [0, 0.15],
    extrapolate: "clamp"
  });

  const persistToggle = (taskId: string) => {
    void updatePlan((current) => {
      const routine = normalizeRoutineModuleState(current.routine);
      const now = new Date().toISOString();
      return {
        ...current,
        routine: {
          ...routine,
          tasks: routine.tasks.map((task) =>
            task.id === taskId ? { ...task, status: task.status === "done" ? "todo" : "done", updatedAt: now } : task
          ),
          updatedAt: now
        }
      };
    });
  };

  const toggleTask = (taskId: string, done: boolean) => {
    if (done) {
      persistToggle(taskId);
      return;
    }
    hold(taskId, () => persistToggle(taskId));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          height: headerHeight,
          shadowColor: colors.accent,
          shadowOpacity: headerShadow,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            flex: 1,
            borderBottomLeftRadius: headerRadius,
            borderBottomRightRadius: headerRadius,
            overflow: "hidden"
          }}
        >
          <LinearGradient colors={[colors.accent, colors.background]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1 }} />
          <Animated.View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: compactOpacity }}>
            <LinearGradient colors={[colors.accent, "#1A8FE3"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </Animated.View>

          <Animated.View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              opacity: heroOpacity,
              transform: [{ scale: heroScale }]
            }}
          >
            <View
              style={{
                position: "absolute",
                left: -40,
                top: insets.top - 20,
                width: 160,
                height: 160,
                borderRadius: 80,
                backgroundColor: "#FFFFFF",
                opacity: 0.15
              }}
            />
            <View
              style={{
                marginTop: insets.top + 18,
                height: 224,
                flexDirection: "row",
                alignItems: "flex-end",
                justifyContent: "center"
              }}
            >
              <Image source={mascotLeft} resizeMode="contain" style={{ width: 219, height: 224, marginRight: -36 }} />
              <Image source={mascotRight} resizeMode="contain" style={{ width: 168, height: 186, marginBottom: 8 }} />
            </View>
          </Animated.View>

          <Animated.View
            style={{
              position: "absolute",
              left: 18,
              right: 70,
              bottom: 11,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              opacity: compactOpacity
            }}
          >
            <Image source={mascotCompact} resizeMode="contain" style={{ width: 59, height: 50 }} />
            <View>
              <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: fonts.regular }}>Olá, {name}!</Text>
              <Text style={{ color: "#FFFFFF", fontSize: 12, marginTop: 2, fontFamily: fonts.regular }}>Aproveite seu dia</Text>
            </View>
          </Animated.View>
        </Animated.View>

        <Animated.View style={{ position: "absolute", top: profileTop, right: 16, zIndex: 4 }}>
          <ProfileButton light />
        </Animated.View>
      </Animated.View>

      <Animated.ScrollView
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        contentContainerStyle={{ paddingTop: compact, paddingBottom: 120 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh({ calendars: true })} progressViewOffset={compact} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ height: collapse }} />

        <View style={{ backgroundColor: colors.surface, paddingHorizontal: 24, paddingVertical: 16, gap: 16 }}>
          <View>
            <Text style={{ fontFamily: fonts.regular, fontSize: 14, lineHeight: 24, color: greetingInk }}>Oi {name},</Text>
            <Text
              style={{
                fontFamily: fonts.semibold,
                fontSize: 22,
                lineHeight: 39,
                letterSpacing: 1.6,
                color: greetingInk
              }}
            >
              Vamos organizar seu dia ?
            </Text>
          </View>

          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: cardBorder,
              borderRadius: radius.xl,
              padding: 16
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: 12, gap: 6 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 21, letterSpacing: 0.2, color: colors.text }}>
                  Você está poupando{" "}
                  <Text style={{ color: colors.success }}>{saved > 0 ? currency.format(saved) : "—"}</Text>
                </Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 11, lineHeight: 18, letterSpacing: -0.1, color: muted }}>
                  {income > 0
                    ? `Isso é ${Math.round(saveRate * 100)}% da sua receita. Continue assim!`
                    : "Quando a renda entrar, eu mostro o ritmo aqui."}
                </Text>
              </View>
              <SpendRing percent={saveRate} size={80} tint={colors.success} label="poupado" />
            </View>
          </View>

          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, minHeight: 15 }}>
              <Text style={sectionTitleStyle}>Lembretes do dia</Text>
              <Pressable onPress={() => router.push("/(tabs)/reminders")} hitSlop={8}>
                <Text style={sectionLinkStyle}>Ver todos</Text>
              </Pressable>
            </View>
            {reminders.length === 0 ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  borderRadius: 20,
                  padding: 16
                }}
              >
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.text }}>Nada vence hoje</Text>
                <Text style={{ marginTop: 2, fontFamily: fonts.regular, fontSize: 12, color: muted }}>Pode seguir o dia tranquilo.</Text>
              </View>
            ) : (
              reminders.map((group) => {
                const alert = group.representative;
                return (
                <FadeOnComplete key={group.id} active={Boolean(held[alert.id])}>
                  <Pressable
                    onPress={() => router.push("/(tabs)/reminders")}
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
                      checked={Boolean(held[alert.id])}
                      onPress={() => hold(alert.id, () => completeAlert(alert.id))}
                      accessibilityLabel={`Concluir ${alert.title}`}
                      borderColor="rgba(16,42,76,0.25)"
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{
                          fontFamily: fonts.medium,
                          fontSize: 14,
                          lineHeight: 20,
                          letterSpacing: 0.1,
                          color: held[alert.id] ? muted : colors.text,
                          textDecorationLine: held[alert.id] ? "line-through" : "none"
                        }}
                      >
                        {alert.title}
                      </Text>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: muted }}>
                        {alert.amount
                          ? preciseCurrency.format(alert.amount)
                          : cleanReminderNotes(alert.notes) || reminderWhen(alert)}
                      </Text>
                    </View>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning }} />
                  </Pressable>
                </FadeOnComplete>
                );
              })
            )}
          </View>

          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, minHeight: 15 }}>
              <Text style={sectionTitleStyle}>Agenda do dia</Text>
              <Pressable onPress={() => router.push("/(tabs)/agenda")} hitSlop={8}>
                <Text style={sectionLinkStyle}>Ver agenda completa</Text>
              </Pressable>
            </View>
            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: cardBorder,
                borderRadius: 20,
                padding: 16
              }}
            >
              {agenda.length === 0 ? (
                <>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.text }}>Nenhuma tarefa para hoje</Text>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: muted }}>Quando você marcar um foco ou agendar algo, aparece aqui.</Text>
                </>) : (
                agenda.map((event, index) => {
                  const clock = zonedClock(event.start, timeZone);
                  const time = event.allDay ? "Dia todo" : `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
                  const tint = agendaTints[index % agendaTints.length] ?? colors.accent;
                  return (
                    <View key={event.id}>
                      {index > 0 ? <View style={{ height: 1, backgroundColor: cardBorder }} /> : null}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingTop: index === 0 ? 0 : 12,
                          paddingBottom: index === agenda.length - 1 ? 0 : 12
                        }}
                      >
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tint }} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, letterSpacing: 0.1, color: tint }}>
                            {time}
                          </Text>
                          <Text style={{ fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, letterSpacing: 0.1, color: colors.text }}>
                            {event.title}
                          </Text>
                          {event.location ? (
                            <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: muted }}>{event.location}</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>

          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, minHeight: 15 }}>
              <Text style={sectionTitleStyle}>Tarefas do dia</Text>
              <Pressable onPress={() => router.push("/(tabs)/tasks")} hitSlop={8}>
                <Text style={sectionLinkStyle}>Ver todas</Text>
              </Pressable>
            </View>
            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: cardBorder,
                borderRadius: 20,
                padding: 16,
                gap: 16
              }}
            >
              {tasks.length === 0 ? (
                <>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: colors.text }}>Nenhuma tarefa para hoje</Text>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: muted }}>Quando você marcar um foco ou agendar algo, aparece aqui.</Text>
                </>
              ) : (
                <>
                  {tasks.map((task) => {
                    const done = task.status === "done" || Boolean(held[task.id]);
                    return (
                      <Pressable key={task.id} onPress={() => toggleTask(task.id, task.status === "done")} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <AnimatedCheck
                          checked={done}
                          onPress={() => toggleTask(task.id, task.status === "done")}
                          size={22}
                          radius={6}
                          accessibilityLabel={`${done ? "Reabrir" : "Concluir"} ${task.title}`}
                          borderColor="rgba(16,42,76,0.25)"
                        />
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 14,
                            fontFamily: done ? fonts.medium : fonts.semibold,
                            color: done ? muted : colors.text,
                            textDecorationLine: done ? "line-through" : "none"
                          }}
                        >
                          {task.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <View style={{ height: 1, backgroundColor: cardBorder }} />
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 12, fontFamily: fonts.semibold, color: colors.text }}>Progresso das tarefas</Text>
                      <Text style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.success }}>
                        {doneCount} de {tasks.length} concluídas
                      </Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: "#E0E8F0", overflow: "hidden" }}>
                      <View
                        style={{
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: colors.success,
                          width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%`
                        }}
                      />
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}
