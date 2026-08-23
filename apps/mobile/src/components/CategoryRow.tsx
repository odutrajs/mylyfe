import type { CategoryBudgetProgress } from "@mylyfe/domain";
import {
  Bus,
  ChevronRight,
  GraduationCap,
  Heart,
  Home,
  Landmark,
  Receipt,
  ShoppingBag,
  Sparkles,
  Ticket,
  UtensilsCrossed,
  Wallet
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { categoryStatusCopy } from "../format";
import { colors, fonts } from "../theme";
import { SpendRing } from "./SpendRing";

const iconBlack = "#000000";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const iconFor = (category: string, name: string) => {
  const key = normalize(`${category} ${name}`);
  if (category === "housing") return Home;
  if (category === "shopping") return ShoppingBag;
  if (category === "food" || /comida|aliment|restaurante|ifood|mercado|padaria|lanche/.test(key)) return UtensilsCrossed;
  if (category === "transport") return Bus;
  if (category === "health") return Heart;
  if (category === "education") return GraduationCap;
  if (category === "travel") return Ticket;
  if (category === "taxes") return Landmark;
  if (category === "subscriptions") return Receipt;
  if (category === "debt") return Wallet;
  return Sparkles;
};

const ringColor = (status: CategoryBudgetProgress["status"]) => {
  if (status === "over") return colors.danger;
  if (status === "tight" || status === "watch") return colors.warning;
  if (status === "comfortable") return colors.success;
  return colors.accent;
};

export function CategoryRow({
  item,
  onPress,
  showDivider = false
}: {
  item: CategoryBudgetProgress;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  const Icon = iconFor(item.category, item.name);
  const tint = ringColor(item.status);
  const used = item.usedPercent ?? (item.limit > 0 ? item.spent / item.limit : 0);

  return (
    <View>
      <Pressable
        onPress={onPress}
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
              backgroundColor: "#F3F4F6",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Icon size={18} color={iconBlack} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: colors.text }}>{item.name}</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: item.status === "over" ? colors.danger : "#808080" }}>
              {categoryStatusCopy(item)}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <SpendRing percent={used} size={32} over={item.status === "over"} tint={tint} showLabel={false} />
          {onPress ? <ChevronRight size={16} color={iconBlack} /> : null}
        </View>
      </Pressable>
      {showDivider ? <View style={{ height: 1, backgroundColor: "rgba(0, 0, 0, 0.05)" }} /> : null}
    </View>
  );
}
