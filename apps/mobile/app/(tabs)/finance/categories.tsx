import { calculateCategoryBudgetProgress } from "@mylyfe/domain";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../../../src/components/Screen";
import { parseMoney, preciseCurrency } from "../../../src/format";
import { usePlan } from "../../../src/plan-context";
import { colors, radius, shadow, spacing } from "../../../src/theme";

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { plan, updatePlan } = usePlan();
  const items = useMemo(() => (plan ? calculateCategoryBudgetProgress(plan) : []), [plan]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const save = async (category: string) => {
    if (!plan) return;
    const value = parseMoney(drafts[category] ?? "");
    await updatePlan((current) => {
      const remaining = (current.budget.categoryTargets ?? []).filter((item) => item.category !== category);
      return {
        ...current,
        budget: {
          ...current.budget,
          categoryTargets: value > 0 ? [...remaining, { category, monthlyTarget: value }] : remaining
        },
        updatedAt: new Date().toISOString()
      };
    });
  };

  return (
    <Screen padded={false}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: spacing.lg, gap: 16 }}>
        <Pressable onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ChevronLeft size={20} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: "700" }}>Voltar</Text>
        </Pressable>
        <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text }}>Gerenciar categorias</Text>
        <Text style={{ color: colors.textMuted }}>Ajuste o teto mensal das categorias mais importantes.</Text>
        {items.map((item) => (
          <View key={item.category} style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: 10, ...shadow.card }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text }}>{item.name}</Text>
            <Text style={{ color: colors.textMuted }}>
              Gasto {preciseCurrency.format(item.spent)} • limite atual {preciseCurrency.format(item.limit)}
            </Text>
            <TextInput
              value={drafts[item.category] ?? (item.limit ? String(item.limit) : "")}
              onChangeText={(value) => setDrafts((current) => ({ ...current, [item.category]: value }))}
              keyboardType="decimal-pad"
              placeholder="Novo teto"
              placeholderTextColor={colors.textSoft}
              style={{ backgroundColor: colors.background, borderRadius: radius.md, padding: 12, color: colors.text }}
            />
            <Pressable onPress={() => void save(item.category)} style={{ alignSelf: "flex-start" }}>
              <Text style={{ color: colors.accent, fontWeight: "800" }}>Salvar teto</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </Screen>
  );
}
