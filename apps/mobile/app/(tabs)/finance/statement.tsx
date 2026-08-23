import type { CategoryExpenseItem, ExpenseCategory } from "@mylyfe/domain";
import { addDaysToKey, analyzePlan, dateFromMonthKey, formatMonthKey, listCategoryExpensesInMonth } from "@mylyfe/domain";
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
import { MascotEmpty } from "../../../src/components/Mascot";
import { currency, frequencyLabel, monthTitle, preciseCurrency, todayKey } from "../../../src/format";
import { usePlan } from "../../../src/plan-context";
import { colors, fonts } from "../../../src/theme";

type StatementRow = CategoryExpenseItem & { category: ExpenseCategory };

const muted = "#808080";
const cardBorder = "rgba(0, 0, 0, 0.05)";
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

const dayKey = (value?: string) => (value ? value.slice(0, 10) : "");

const formatDayMonth = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const mon = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
  return `${String(day).padStart(2, "0")} ${mon.slice(0, 1).toUpperCase()}${mon.slice(1, 3)}`;
};

const groupLabel = (key: string, today: string) => {
  if (key === today) return `Hoje, ${formatDayMonth(key)}`;
  if (key === addDaysToKey(today, -1)) return `Ontem, ${formatDayMonth(key)}`;
  return formatDayMonth(key);
};

const prettyMonthName = (month: string) => {
  const name = monthTitle(month).split(" ")[0] ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1);
};

export default function StatementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { month: monthParam } = useLocalSearchParams<{ month?: string }>();
  const { plan, loading, refresh } = usePlan();
  const [filter, setFilter] = useState<ExpenseCategory | "all">("all");
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : formatMonthKey(new Date());
  const currentMonth = formatMonthKey(new Date());
  const asOf = month === currentMonth ? new Date() : dateFromMonthKey(month);
  const today = todayKey();
  const categories = plan?.expenseCategories?.filter((item) => item.isActive) ?? [];
  const categoryName = (id: string) => categories.find((item) => item.id === id)?.name ?? id;

  const analysis = useMemo(() => (plan ? analyzePlan(plan, asOf) : null), [asOf, plan]);
  const limit =
    plan?.budget.monthlyExpenseTarget ||
    analysis?.categoryBudgetPlan.expenseEnvelope ||
    analysis?.budgetSuggestion.monthlyExpenseTarget ||
    0;

  const rows = useMemo(() => {
    if (!plan) return [];
    const seen = new Set<string>();
    const next: StatementRow[] = [];
    const categoryIds = new Set<ExpenseCategory>([
      ...categories.map((item) => item.id),
      ...plan.transactions.map((item) => item.category),
      ...(plan.recurringTransactions ?? []).map((item) => item.category)
    ]);
    for (const category of categoryIds) {
      for (const item of listCategoryExpensesInMonth(plan, month, category)) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        next.push({ ...item, category });
      }
    }
    return next;
  }, [categories, month, plan]);

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of rows) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || categoryName(left[0]).localeCompare(categoryName(right[0]), "pt-BR"))
      .map(([id]) => ({ id, label: categoryName(id) }));
  }, [categories, rows]);

  const visible = filter === "all" ? rows : rows.filter((item) => item.category === filter);
  const fixedItems = visible.filter((item) => item.kind === "recurring");
  const dailyItems = visible.filter((item) => item.kind !== "recurring");
  const spent = rows.reduce((sum, item) => sum + item.amount, 0);
  const percent = limit > 0 ? Math.min(spent / limit, 1) : 0;
  const percentLabel = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  const over = limit > 0 && spent > limit;

  const groups = useMemo(() => {
    const buckets = new Map<string, StatementRow[]>();
    for (const item of dailyItems) {
      const key = dayKey(item.date);
      if (!key) continue;
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    return [...buckets.entries()].sort((left, right) => right[0].localeCompare(left[0]));
  }, [dailyItems]);

  const subtitleFor = (item: StatementRow) => {
    const parts = [categoryName(item.category)];
    if (item.kind === "recurring") {
      const recurring = plan?.recurringTransactions?.find((entry) => `rec-${entry.id}` === item.id);
      parts.push(recurring ? frequencyLabel[recurring.frequency] : "Fixo");
    } else if (item.installment) {
      parts.push(`${item.installment.current}/${item.installment.total}x`);
    } else if (item.kind === "forecast") {
      parts.push("Previsto");
    }
    return parts.join(" • ");
  };

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
          <Text style={{ fontSize: 16, fontFamily: fonts.regular, color: "#FFFFFF" }}>
            Gastos de {prettyMonthName(month)}
          </Text>
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
            gap: 16
          }}
        >
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: muted }}>Total gasto</Text>
            <Text style={{ fontSize: 32, fontFamily: fonts.regular, color: colors.text }}>{preciseCurrency.format(spent)}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: muted }}>
              Orçamento: {currency.format(limit)}
            </Text>
            <View style={{ width: 1, height: 12, backgroundColor: cardBorder }} />
            <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: over ? colors.danger : colors.accent }}>
              {percentLabel}% do limite
            </Text>
          </View>
          <View style={{ height: 8, borderRadius: 100, backgroundColor: "#F3F4F6", overflow: "hidden" }}>
            <View
              style={{
                height: "100%",
                width: `${Math.round(percent * 100)}%`,
                borderRadius: 100,
                backgroundColor: over ? colors.danger : colors.success
              }}
            />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <FilterChip label="Todos" active={filter === "all"} onPress={() => setFilter("all")} />
          {chips.map((item) => (
            <FilterChip
              key={item.id}
              label={item.label}
              active={filter === item.id}
              onPress={() => setFilter(item.id)}
            />
          ))}
        </ScrollView>

        {visible.length === 0 ? (
          <MascotEmpty title="Nenhum gasto neste mês" caption="Quando lançar uma despesa, ela aparece aqui." mood="think" />
        ) : (
          <View style={{ gap: 20 }}>
            {fixedItems.length > 0 ? (
              <ExpenseGroup title="Gastos fixos" items={fixedItems} subtitleFor={subtitleFor} />
            ) : null}
            {groups.map(([key, items]) => (
              <ExpenseGroup key={key} title={groupLabel(key, today)} items={items} subtitleFor={subtitleFor} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ExpenseGroup({
  title,
  items,
  subtitleFor
}: {
  title: string;
  items: StatementRow[];
  subtitleFor: (item: StatementRow) => string;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: colors.text, paddingLeft: 4 }}>{title}</Text>
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
          const Icon = categoryIcon(item.category, item.name);
          return (
            <View key={item.id}>
              <View
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
                      backgroundColor: badgeTint[item.category] ?? "#F3F4F6",
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
                    <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: muted }}>{subtitleFor(item)}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 15, fontFamily: fonts.regular, color: colors.danger }}>
                  {preciseCurrency.format(item.amount)}
                </Text>
              </View>
              {index < items.length - 1 ? <View style={{ height: 1, backgroundColor: cardBorder }} /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
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
        {label}
      </Text>
    </Pressable>
  );
}
