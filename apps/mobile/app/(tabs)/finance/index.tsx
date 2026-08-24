import {
  analyzePlan,
  calculateMonthExpenseLimit,
  calculateMonthlyCashFlow,
  dateFromMonthKey,
  formatMonthKey,
  selectDashboardCategoryBudgets
} from "@mylyfe/domain";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CategoryRow } from "../../../src/components/CategoryRow";
import { FinanceChrome } from "../../../src/components/FinanceChrome";
import { FinanceFuturePanel } from "../../../src/components/FinanceFuturePanel";
import { SpendRing } from "../../../src/components/SpendRing";
import { currency, monthTitle } from "../../../src/format";
import { usePlan } from "../../../src/plan-context";
import { colors, fonts } from "../../../src/theme";

const shiftMonth = (month: string, delta: number) => {
  const asOf = dateFromMonthKey(month);
  return formatMonthKey(new Date(asOf.getFullYear(), asOf.getMonth() + delta, 15));
};

export default function BudgetsScreen() {
  const router = useRouter();
  const { plan, loading, refresh } = usePlan();
  const [tab, setTab] = useState<"budgets" | "future">("budgets");
  const [month, setMonth] = useState(() => formatMonthKey(new Date()));
  const currentMonth = formatMonthKey(new Date());
  const asOf = useMemo(() => (month === currentMonth ? new Date() : dateFromMonthKey(month)), [currentMonth, month]);
  const monthName = monthTitle(month).split(" ")[0] ?? "";

  const analysis = useMemo(() => (plan ? analyzePlan(plan, asOf) : null), [asOf, plan]);
  const income = useMemo(() => (plan ? calculateMonthlyCashFlow(plan, month).income : 0), [month, plan]);
  const spent = analysis?.spending.currentMonthSpend ?? 0;
  const limit = useMemo(() => {
    if (!plan) return 0;
    return calculateMonthExpenseLimit(plan, month) || analysis?.budgetSuggestion.monthlyExpenseTarget || 0;
  }, [analysis?.budgetSuggestion.monthlyExpenseTarget, month, plan]);
  const percent = limit > 0 ? spent / limit : 0;
  const over = limit > 0 && spent > limit;
  const categories = analysis ? selectDashboardCategoryBudgets(analysis.categoryBudgets) : [];

  return (
    <FinanceChrome
      tab={tab}
      onTabChange={setTab}
      month={month}
      onShiftMonth={(delta) => setMonth((current) => shiftMonth(current, delta))}
      refreshing={loading}
      onRefresh={() => void refresh()}
    >
      {tab === "future" ? (
        <FinanceFuturePanel month={month} onSelectMonth={setMonth} />
      ) : (
        <>
          <Pressable
            onPress={() => router.push({ pathname: "/(tabs)/finance/statement", params: { month } })}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: "rgba(0, 0, 0, 0.05)",
              borderRadius: 24,
              padding: 20,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <View style={{ flex: 1, paddingRight: 12, gap: 4 }}>
              <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: "#808080" }}>Gastos de {monthName}</Text>
              <Text style={{ fontSize: 32, fontFamily: fonts.semibold, color: colors.text }}>{currency.format(spent)}</Text>
              <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: colors.success }}>
                Ganhos {currency.format(income)}
              </Text>
              <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: colors.accent, marginTop: 4 }}>Ver extrato</Text>
            </View>
            <SpendRing percent={percent} size={76} over={over} />
          </Pressable>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: colors.text }}>Categorias</Text>
            <Pressable onPress={() => router.push("/(tabs)/finance/categories")} hitSlop={8}>
              <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: colors.accent }}>Gerenciar</Text>
            </Pressable>
          </View>

          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: "rgba(0, 0, 0, 0.05)",
              borderRadius: 24,
              paddingHorizontal: 16,
              paddingVertical: 8
            }}
          >
            {categories.length === 0 ? (
              <Text style={{ paddingVertical: 16, fontFamily: fonts.regular, color: "#808080" }}>
                Nenhuma categoria com movimento neste mês.
              </Text>
            ) : (
              categories.map((item, index) => (
                <CategoryRow
                  key={item.category}
                  item={item}
                  showDivider={index < categories.length - 1}
                  onPress={() =>
                    router.push({ pathname: "/(tabs)/finance/category/[id]", params: { id: item.category, month } })
                  }
                />
              ))
            )}
          </View>
        </>
      )}
    </FinanceChrome>
  );
}
