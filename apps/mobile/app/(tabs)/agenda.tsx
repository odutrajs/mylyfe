import { addDaysToKey, eventsForDay, monthGridKeys, shiftWeekKey, weekDayKeys, zonedClock, zonedDayKey } from "@mylyfe/domain";
import { useFocusEffect } from "expo-router";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AppHeader } from "../../src/components/AppHeader";
import { Screen } from "../../src/components/Screen";
import { todayKey } from "../../src/format";
import { usePlan } from "../../src/plan-context";
import { colors, fonts } from "../../src/theme";

const mascotAgenda = require("../../assets/finance/mascote-header-agenda.png");

const weekLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const tints = [colors.accent, colors.success, colors.warning, colors.shared];
const cardBorder = "rgba(0, 0, 0, 0.05)";
const muted = "#808080";
const iconBlack = "#000000";

const pad = (value: number) => String(value).padStart(2, "0");

const formatMonthTitle = (dayKey: string) => {
  const [year = 1970, month = 1] = dayKey.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const eventTime = (start: string, end: string, allDay: boolean, timeZone: string) => {
  if (allDay) return "Dia inteiro";
  const startClock = zonedClock(start, timeZone);
  const startLabel = `${pad(startClock.hour)}:${pad(startClock.minute)}`;
  if (!end || end === start) return startLabel;
  const endClock = zonedClock(end, timeZone);
  const endLabel = `${pad(endClock.hour)}:${pad(endClock.minute)}`;
  return endLabel === startLabel ? startLabel : `${startLabel} - ${endLabel}`;
};

export default function AgendaScreen() {
  const { plan, events, loading, error, refresh } = usePlan();
  useFocusEffect(
    useCallback(() => {
      void refresh({ calendars: true });
    }, [refresh])
  );
  const timeZone = plan?.routine?.settings.timezone || "America/Sao_Paulo";
  const [selected, setSelected] = useState(todayKey());
  const [monthView, setMonthView] = useState(false);
  const week = useMemo(() => weekDayKeys(selected), [selected]);
  const monthDays = useMemo(() => monthGridKeys(selected), [selected]);
  const selectedEvents = useMemo(
    () => eventsForDay(events.filter((event) => event.status !== "cancelled"), selected, timeZone),
    [events, selected, timeZone]
  );
  const eventDays = useMemo(() => {
    const set = new Set<string>();
    for (const event of events) {
      if (event.status === "cancelled") continue;
      set.add(event.allDay && /^\d{4}-\d{2}-\d{2}$/.test(event.start) ? event.start : zonedDayKey(new Date(event.start), timeZone));
    }
    return set;
  }, [events, timeZone]);

  return (
    <Screen
      header={
        <AppHeader
          title="Agenda"
          mascot={mascotAgenda}
          wideMascot
          action={{
            label: monthView ? "Ver semana" : "Ver mês",
            icon: Calendar,
            onPress: () => setMonthView((current) => !current)
          }}
        />
      }
      refreshing={loading}
      onRefresh={() => void refresh({ calendars: true })}
      padded={false}
    >
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
          {error ? (
            <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: colors.danger, paddingHorizontal: 4 }}>{error}</Text>
          ) : null}
          <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
              <Pressable
                onPress={() => setSelected((current) => (monthView ? addDaysToKey(current, -30) : shiftWeekKey(current, -1)))}
                hitSlop={12}
                accessibilityLabel={monthView ? "Mês anterior" : "Semana anterior"}
              >
                <ChevronLeft size={14} color={iconBlack} />
              </Pressable>
              <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: colors.text, minWidth: 160, textAlign: "center" }}>
                {formatMonthTitle(selected)}
              </Text>
              <Pressable
                onPress={() => setSelected((current) => (monthView ? addDaysToKey(current, 30) : shiftWeekKey(current, 1)))}
                hitSlop={12}
                accessibilityLabel={monthView ? "Próximo mês" : "Próxima semana"}
              >
                <ChevronRight size={14} color={iconBlack} />
              </Pressable>
            </View>
            {selected !== todayKey() ? (
              <Pressable
                onPress={() => setSelected(todayKey())}
                hitSlop={8}
                style={{ position: "absolute", right: 4 }}
                accessibilityLabel="Ir para hoje"
              >
                <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: colors.accent }}>Hoje</Text>
              </Pressable>
            ) : null}
          </View>

          {monthView ? (
            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: cardBorder,
                borderRadius: 20,
                padding: 12
              }}
            >
              <View style={{ flexDirection: "row", marginBottom: 8 }}>
                {weekLabels.map((label) => (
                  <Text key={label} style={{ flex: 1, textAlign: "center", fontSize: 11, fontFamily: fonts.semibold, color: muted }}>
                    {label}
                  </Text>
                ))}
              </View>
              {Array.from({ length: monthDays.length / 7 }, (_, weekIndex) => (
                <View key={weekIndex} style={{ flexDirection: "row" }}>
                  {monthDays.slice(weekIndex * 7, weekIndex * 7 + 7).map((day) => {
                    const inMonth = day.slice(0, 7) === selected.slice(0, 7);
                    const active = day === selected;
                    const marked = eventDays.has(day);
                    return (
                      <Pressable key={day} onPress={() => setSelected(day)} style={{ flex: 1, alignItems: "center", paddingVertical: 6 }}>
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: active ? colors.accent : "transparent"
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: fonts.regular,
                              fontSize: 14,
                              color: active ? "#FFFFFF" : inMonth ? colors.text : colors.textSoft
                            }}
                          >
                            {Number(day.slice(8))}
                          </Text>
                        </View>
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 3,
                            marginTop: 3,
                            backgroundColor: marked ? (active ? colors.accentSoft : colors.accent) : "transparent"
                          }}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              {week.map((day, index) => {
                const active = day === selected;
                return (
                  <Pressable
                    key={day}
                    onPress={() => setSelected(day)}
                    style={{
                      width: 44,
                      paddingVertical: 8,
                      borderRadius: 14,
                      alignItems: "center",
                      gap: 4,
                      backgroundColor: active ? colors.accent : colors.surface,
                      borderWidth: active ? 0 : 1,
                      borderColor: cardBorder
                    }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: fonts.regular, color: active ? "#FFFFFF" : muted }}>
                      {weekLabels[index]}
                    </Text>
                    <Text style={{ fontSize: 16, fontFamily: fonts.regular, color: active ? "#FFFFFF" : colors.text }}>
                      {Number(day.slice(8))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={{ fontSize: 16, fontFamily: fonts.regular, color: colors.text, paddingLeft: 4 }}>Compromissos</Text>

          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: cardBorder,
              borderRadius: 20,
              padding: 16
            }}
          >
            {selectedEvents.length === 0 ? (
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 15, fontFamily: fonts.regular, color: colors.text }}>Nada marcado neste dia</Text>
                <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: muted }}>Quando entrar um compromisso, ele aparece aqui.</Text>
              </View>
            ) : (
              selectedEvents.map((event, index) => {
                const tint = tints[index % tints.length] ?? colors.accent;
                const time = eventTime(event.start, event.end, event.allDay, timeZone);
                return (
                  <View key={event.id}>
                    {index > 0 ? <View style={{ height: 1, backgroundColor: cardBorder }} /> : null}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        gap: 12,
                        paddingTop: index === 0 ? 0 : 12,
                        paddingBottom: index === selectedEvents.length - 1 ? 0 : 12
                      }}
                    >
                      <View style={{ paddingTop: 6 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tint }} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: tint, letterSpacing: 0.1 }}>{time}</Text>
                        <Text style={{ fontSize: 15, fontFamily: fonts.regular, color: colors.text }}>{event.title}</Text>
                        {event.location ? (
                          <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: muted }}>{event.location}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
      </View>
    </Screen>
  );
}
