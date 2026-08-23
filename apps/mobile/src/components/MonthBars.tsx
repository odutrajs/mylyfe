import type { MonthlyCashFlow } from "@mylyfe/domain";
import { Pressable, ScrollView, Text, View } from "react-native";
import { monthShort } from "../format";
import { colors, radius } from "../theme";

export function MonthBars({
  series,
  selected,
  onSelect
}: {
  series: MonthlyCashFlow[];
  selected: string;
  onSelect: (month: string) => void;
}) {
  const peak = Math.max(...series.map((item) => Math.max(item.outflow, item.income, 1)), 1);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 4 }}>
      {series.map((item) => {
        const active = item.month === selected;
        const over = item.net < 0;
        const fill = active ? colors.accent : over ? "#FECACA" : "#A8D4EA";
        const height = Math.max(18, (item.outflow / peak) * 88);

        return (
          <Pressable key={item.month} onPress={() => onSelect(item.month)} style={{ alignItems: "center", width: 48 }}>
            <View
              style={{
                height: 100,
                width: 28,
                borderRadius: radius.md,
                backgroundColor: active ? colors.accentSoft : "#EEF2F6",
                justifyContent: "flex-end",
                overflow: "hidden"
              }}
            >
              <View style={{ height, borderRadius: radius.md, backgroundColor: fill }} />
            </View>
            <Text style={{ marginTop: 8, fontSize: 11, fontWeight: active ? "800" : "600", color: active ? colors.text : colors.textMuted }}>
              {monthShort(item.month)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
