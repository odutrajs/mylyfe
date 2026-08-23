import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { monthTitle } from "../format";
import { colors, fonts } from "../theme";
import { AppHeader } from "./AppHeader";

const iconBlack = "#000000";

export function FinanceChrome({
  tab,
  onTabChange,
  month,
  onShiftMonth,
  children,
  refreshing = false,
  onRefresh
}: {
  tab: "budgets" | "future";
  onTabChange: (tab: "budgets" | "future") => void;
  month?: string;
  onShiftMonth?: (delta: -1 | 1) => void;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const monthLabel = month ? monthTitle(month) : "";
  const prettyMonth = monthLabel ? monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1) : "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Financeiro" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom, paddingHorizontal: 20, paddingTop: 16, gap: 16 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {month && onShiftMonth ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 4, gap: 18 }}>
            <Pressable onPress={() => onShiftMonth(-1)} hitSlop={12} accessibilityLabel="Mês anterior">
              <ChevronLeft size={14} color={iconBlack} />
            </Pressable>
            <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: colors.text, minWidth: 160, textAlign: "center" }}>
              {prettyMonth}
            </Text>
            <Pressable onPress={() => onShiftMonth(1)} hitSlop={12} accessibilityLabel="Próximo mês">
              <ChevronRight size={14} color={iconBlack} />
            </Pressable>
          </View>
        ) : null}

        <View style={{ backgroundColor: "#F3F4F6", borderRadius: 14, padding: 4, flexDirection: "row" }}>
          <Pressable
            onPress={() => onTabChange("budgets")}
            style={{
              flex: 1,
              paddingVertical: 8,
              alignItems: "center",
              borderRadius: 10,
              backgroundColor: tab === "budgets" ? colors.surface : "transparent",
              shadowColor: "#000000",
              shadowOpacity: tab === "budgets" ? 0.04 : 0,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 2 }
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontFamily: tab === "budgets" ? fonts.regular : fonts.regular,
                color: tab === "budgets" ? colors.text : "#808080"
              }}
            >
              Orçamentos
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onTabChange("future")}
            style={{
              flex: 1,
              paddingVertical: 8,
              alignItems: "center",
              borderRadius: 10,
              backgroundColor: tab === "future" ? colors.surface : "transparent",
              shadowColor: "#000000",
              shadowOpacity: tab === "future" ? 0.04 : 0,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 2 }
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontFamily: tab === "future" ? fonts.regular : fonts.regular,
                color: tab === "future" ? colors.text : "#808080"
              }}
            >
              Futuro
            </Text>
          </Pressable>
        </View>

        {children}
      </ScrollView>
    </View>
  );
}
