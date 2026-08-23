import { calculateMonthlyCashFlowSeries, formatMonthKey, withGoalAssetProgress } from "@mylyfe/domain";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { currency } from "../format";
import { usePlan } from "../plan-context";
import { colors, fonts } from "../theme";

const cardBorder = "rgba(0, 0, 0, 0.05)";
const barIdle = "#E8EEF4";
const labelIdle = "#9CA3AF";
const maxBar = 168;

const monthShortPt = (month: string, showYear = false) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year ?? 1970, (monthNumber ?? 1) - 1, 1);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "").trim();
  const short = label.slice(0, 1).toUpperCase() + label.slice(1, 3);
  return showYear ? `${short} ${String(year).slice(2)}` : short;
};

export function FinanceFuturePanel({
  month,
  onSelectMonth
}: {
  month: string;
  onSelectMonth: (month: string) => void;
}) {
  const { plan } = usePlan();
  const todayMonth = formatMonthKey(new Date());
  const series = useMemo(
    () => (plan ? calculateMonthlyCashFlowSeries(plan, new Date(), 0, 5) : []),
    [plan]
  );
  const highlighted = series.some((item) => item.month === month) ? month : todayMonth;
  const peak = Math.max(...series.map((item) => item.outflow), 1);
  const crossesYear = series.some((item) => item.month.slice(0, 4) !== todayMonth.slice(0, 4));
  const goals = useMemo(() => {
    if (!plan) return [];
    return [...plan.goals]
      .map((goal) => withGoalAssetProgress(goal, plan.assets))
      .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || right.priority - left.priority)
      .slice(0, 4);
  }, [plan]);

  return (
    <>
      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: cardBorder,
          borderRadius: 24,
          padding: 20,
          gap: 16
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: colors.text }}>Gastos por mês</Text>
          <Text style={{ fontSize: 14, fontFamily: fonts.semibold, color: colors.accent }}>Ver detalhes</Text>
        </View>

        <View style={{ gap: 12 }}>
          <View style={{ height: 220, justifyContent: "flex-end" }}>
            <View style={{ position: "absolute", left: 0, right: 0, top: 56, height: 1, backgroundColor: "#E5E7EB", opacity: 0.6 }} />
            <View style={{ position: "absolute", left: 0, right: 0, top: 112, height: 1, backgroundColor: "#E5E7EB", opacity: 0.6 }} />
            <View style={{ position: "absolute", left: 0, right: 0, top: 168, height: 1, backgroundColor: "#E5E7EB", opacity: 0.6 }} />
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              {series.map((item) => {
                const active = item.month === highlighted;
                const height = Math.max(8, (item.outflow / peak) * maxBar);
                return (
                  <Pressable key={item.month} onPress={() => onSelectMonth(item.month)} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={{
                        fontSize: active ? 12 : 10,
                        fontFamily: active ? fonts.bold : fonts.medium,
                        color: active ? colors.text : labelIdle,
                        textAlign: "center"
                      }}
                    >
                      {currency.format(item.outflow)}
                    </Text>
                    <View
                      style={{
                        width: "100%",
                        maxWidth: 40,
                        height,
                        backgroundColor: active ? colors.accent : barIdle,
                        borderTopLeftRadius: 8,
                        borderTopRightRadius: 8
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {series.map((item) => {
              const active = item.month === highlighted;
              return (
                <Pressable key={`label-${item.month}`} onPress={() => onSelectMonth(item.month)} style={{ flex: 1, alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: active ? fonts.bold : fonts.regular,
                      color: active ? colors.accent : labelIdle
                    }}
                  >
                    {monthShortPt(item.month, crossesYear && item.month.slice(0, 4) !== todayMonth.slice(0, 4))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: cardBorder,
          borderRadius: 24,
          padding: 16,
          gap: 12
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: colors.text }}>Metas</Text>
          <Text style={{ fontSize: 14, fontFamily: fonts.semibold, color: colors.accent }}>Gerenciar</Text>
        </View>

        {goals.length === 0 ? (
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: "#808080" }}>
            Nenhuma meta cadastrada ainda.
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            {goals.map((goal) => {
              const target = Math.max(goal.targetValue, 0);
              const current = Math.max(goal.currentValue, 0);
              const remaining = Math.max(target - current, 0);
              const ratio = target > 0 ? Math.min(current / target, 1) : 0;
              const tint = remaining <= 0 || ratio >= 0.6 ? colors.success : colors.accent;
              return (
                <View key={goal.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontFamily: fonts.bold, color: colors.text }}>{goal.name}</Text>
                    <Text style={{ fontSize: 12, fontFamily: fonts.semibold, color: "#808080" }}>
                      {currency.format(current)} / {currency.format(target)}
                    </Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: "#F3F4F6", overflow: "hidden" }}>
                    <View style={{ height: 8, borderRadius: 4, width: `${ratio * 100}%`, backgroundColor: tint }} />
                  </View>
                  <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: tint }}>
                    {remaining <= 0 ? "Meta concluída" : `Faltam ${currency.format(remaining)}`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </>
  );
}
