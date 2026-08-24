import {
  calculateCategoryBudgetProgress,
  dateFromMonthKey,
  formatMonthKey,
  listCategoryExpensesInMonth,
  type CategoryExpenseItem,
  type ExpenseCategory
} from "@mylyfe/domain";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Briefcase,
  Bus,
  ChevronLeft,
  GraduationCap,
  Heart,
  Home,
  Landmark,
  Repeat,
  ShoppingBag,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MascotEmpty } from "../../../../src/components/Mascot";
import { StatementEntrySheet, type StatementEntryRef } from "../../../../src/components/StatementEntrySheet";
import { categoryStatusCopy, monthTitle, preciseCurrency, shortDate } from "../../../../src/format";
import { usePlan } from "../../../../src/plan-context";
import { colors, fonts } from "../../../../src/theme";

const muted = colors.textMuted;
const cardBorder = colors.border;
const iconBlack = "#000000";

const badgeTint: Record<string, string> = {
  health: "#FFE8E8",
  food: "#FFF2E5",
  shopping: "#E5F0FF",
  transport: "#EDE5FF",
  housing: "#E5FFED",
  travel: "#E8F4FC",
  education: "#EEE9FF",
  subscriptions: "#F3F4F6",
  taxes: "#FFF4E8",
  debt: "#FDECEE",
  company: "#E8F9F0",
  investments: "#E8F9F0",
  thirdParty: "#F3F4F6",
  other: "#F3F4F6"
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const categoryIcon = (category: string, name: string) => {
  const key = normalize(`${category} ${name}`);
  if (category === "housing") return Home;
  if (category === "shopping") return ShoppingBag;
  if (category === "food" || /comida|aliment|restaurante|ifood|mercado|padaria|lanche/.test(key)) return UtensilsCrossed;
  if (category === "transport") return Bus;
  if (category === "health") return Heart;
  if (category === "education") return GraduationCap;
  if (category === "travel") return Ticket;
  if (category === "taxes") return Landmark;
  if (category === "subscriptions") return Repeat;
  if (category === "debt") return Wallet;
  if (category === "company") return Briefcase;
  if (category === "thirdParty") return Users;
  if (category === "investments") return TrendingUp;
  return Sparkles;
};

const expenseSubtitle = (item: CategoryExpenseItem) => {
  if (item.installment) return `Parcela ${item.installment.current}/${item.installment.total}`;
  if (item.kind === "recurring") {
    const day = Number(item.date?.slice(8, 10) || 0);
    return day > 0 ? `Todo dia ${day}` : "Todo mês";
  }
  if (item.kind === "forecast") return item.date ? `Previsto • ${shortDate(item.date)}` : "Previsto";
  return shortDate(item.date);
};

const prettyMonthName = (month: string) => {
  const name = monthTitle(month).split(" ")[0] ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1);
};

export default function CategoryExpensesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, month: monthParam } = useLocalSearchParams<{ id: string; month?: string }>();
  const { plan, loading, refresh } = usePlan();
  const [selected, setSelected] = useState<StatementEntryRef | null>(null);
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : formatMonthKey(new Date());
  const category = (id ?? "") as ExpenseCategory;

  const asOf = useMemo(() => dateFromMonthKey(month), [month]);
  const progress = useMemo(
    () => (plan ? calculateCategoryBudgetProgress(plan, asOf).find((item) => item.category === category) : undefined),
    [asOf, category, plan]
  );
  const items = useMemo(() => (plan && category ? listCategoryExpensesInMonth(plan, month, category) : []), [category, month, plan]);
  const title = progress?.name ?? category;
  const spent = progress?.spent ?? items.reduce((sum, item) => sum + item.amount, 0);
  const limit = progress?.limit ?? 0;
  const used = limit > 0 ? Math.min(spent / limit, 1) : 0;
  const over = limit > 0 && spent > limit;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ zIndex: 3, backgroundColor: colors.background }}>
        <LinearGradient
          colors={[colors.accent, "#1A8FE3"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{
            paddingTop: insets.top,
            paddingHorizontal: 24,
            paddingBottom: 16,
            minHeight: insets.top + 56,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityLabel="Voltar"
            style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
          >
            <ChevronLeft size={20} color="#FFFFFF" />
          </Pressable>
          <Text style={{ fontSize: 16, fontFamily: fonts.regular, color: "#FFFFFF" }}>{title}</Text>
          <View style={{ width: 32 }} />
        </LinearGradient>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 120 + insets.bottom, gap: 20 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: cardBorder,
            borderRadius: 24,
            padding: 20,
            gap: 8
          }}
        >
          <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: muted }}>
            Gasto em {prettyMonthName(month)}
          </Text>
          <Text style={{ fontSize: 32, fontFamily: fonts.semibold, color: colors.text }}>{preciseCurrency.format(spent)}</Text>
          {limit > 0 ? (
            <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: muted }}>de {preciseCurrency.format(limit)}</Text>
          ) : null}
          {progress ? (
            <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: over ? colors.danger : colors.success }}>
              {categoryStatusCopy(progress)}
            </Text>
          ) : null}
          {limit > 0 ? (
            <View style={{ height: 8, borderRadius: 100, backgroundColor: colors.accentSoft, overflow: "hidden", marginTop: 8 }}>
              <View
                style={{
                  height: "100%",
                  width: `${Math.round(used * 100)}%`,
                  borderRadius: 100,
                  backgroundColor: over ? colors.danger : colors.success
                }}
              />
            </View>
          ) : null}
        </View>

        {items.length === 0 ? (
          <MascotEmpty title="Nada nesta categoria" caption="Nenhum gasto deste mês caiu aqui." mood="think" />
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: colors.text, paddingLeft: 4 }}>Lançamentos</Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: cardBorder,
                borderRadius: 24,
                paddingHorizontal: 16,
                paddingVertical: 8
              }}
            >
              {items.map((item, index) => {
                const Icon = categoryIcon(category, item.name);
                return (
                  <View key={item.id}>
                    <Pressable
                      onPress={() =>
                        setSelected({
                          id: item.id,
                          name: item.name,
                          amount: item.amount,
                          date: item.date,
                          direction: "out",
                          category,
                          kind: item.kind
                        })
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 12,
                        gap: 12
                      }}
                    >
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            backgroundColor: badgeTint[category] ?? colors.accentSoft,
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          <Icon size={18} color={iconBlack} strokeWidth={2} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: colors.text }} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: muted }}>{expenseSubtitle(item)}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 15, fontFamily: fonts.regular, color: colors.danger }}>
                        {preciseCurrency.format(item.amount)}
                      </Text>
                    </Pressable>
                    {index < items.length - 1 ? <View style={{ height: 1, backgroundColor: cardBorder }} /> : null}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
      <StatementEntrySheet entry={selected} onClose={() => setSelected(null)} />
    </View>
  );
}
