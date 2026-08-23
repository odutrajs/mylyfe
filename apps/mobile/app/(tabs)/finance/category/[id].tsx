import {
  calculateCategoryBudgetProgress,
  formatMonthKey,
  listCategoryExpensesInMonth,
  type CategoryExpenseItem,
  type ExpenseCategory
} from "@mylyfe/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MascotEmpty } from "../../../../src/components/Mascot";
import { Screen } from "../../../../src/components/Screen";
import { categoryStatusCopy, currency, monthTitle, preciseCurrency, shortDate } from "../../../../src/format";
import { usePlan } from "../../../../src/plan-context";
import { colors, radius, shadow, spacing } from "../../../../src/theme";

const expenseSubtitle = (item: CategoryExpenseItem) => {
  if (item.installment) return `Parcela ${item.installment.current}/${item.installment.total}`;
  if (item.kind === "recurring") {
    const day = Number(item.date?.slice(8, 10) || 0);
    return day > 0 ? `Todo dia ${day}` : "Todo mes";
  }
  if (item.kind === "forecast") return item.date ? `Previsto • ${shortDate(item.date)}` : "Previsto";
  return shortDate(item.date);
};

export default function CategoryExpensesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plan, loading, refresh } = usePlan();
  const month = formatMonthKey(new Date());
  const category = (id ?? "") as ExpenseCategory;

  const progress = useMemo(
    () => (plan ? calculateCategoryBudgetProgress(plan).find((item) => item.category === category) : undefined),
    [category, plan]
  );
  const items = useMemo(() => (plan && category ? listCategoryExpensesInMonth(plan, month, category) : []), [category, month, plan]);
  const title = progress?.name ?? category;
  const spent = progress?.spent ?? items.reduce((sum, item) => sum + item.amount, 0);
  const limit = progress?.limit ?? 0;

  return (
    <Screen padded={false} refreshing={loading} onRefresh={() => void refresh()}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: spacing.lg, gap: 16 }}>
        <Pressable onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ChevronLeft size={20} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: "700" }}>Orcamentos</Text>
        </Pressable>

        <View>
          <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text }}>{title}</Text>
          <Text style={{ marginTop: 4, color: colors.textMuted }}>Discriminacao de {monthTitle(month)}</Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.card }}>
          <Text style={{ color: colors.textMuted, fontWeight: "700" }}>Gasto no mes</Text>
          <Text style={{ marginTop: 8, fontSize: 28, fontWeight: "800", color: colors.text }}>{currency.format(spent)}</Text>
          {limit > 0 ? <Text style={{ marginTop: 4, color: colors.textMuted }}>de {currency.format(limit)}</Text> : null}
          {progress ? (
            <Text style={{ marginTop: 8, color: progress.status === "over" ? colors.danger : colors.textMuted }}>
              {categoryStatusCopy(progress)}
            </Text>
          ) : null}
        </View>

        {items.length === 0 ? (
          <MascotEmpty title="Nada nesta categoria" caption="Nenhum gasto deste mes caiu aqui." mood="think" />
        ) : (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, paddingHorizontal: spacing.md, ...shadow.card }}>
            {items.map((item, index) => (
              <View
                key={item.id}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 14,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.border
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>{item.name}</Text>
                  <Text style={{ marginTop: 2, color: colors.textMuted }}>{expenseSubtitle(item)}</Text>
                </View>
                <Text style={{ fontWeight: "800", color: colors.text }}>{preciseCurrency.format(item.amount)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
