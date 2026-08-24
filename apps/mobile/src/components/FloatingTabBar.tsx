import { canAccessSharedHome } from "@mylyfe/domain";
import { Bell, CalendarClock, House, ListTodo, PieChart, Plus, ShoppingBag } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth-context";
import { usePlan } from "../plan-context";
import { colors, fonts, radius, shadow } from "../theme";
import { useUI } from "../ui-context";

const tabs = [
  { name: "home", label: "Inicio", Icon: House, sheet: null },
  { name: "finance", label: "Financeiro", Icon: PieChart, sheet: "transaction" as const },
  { name: "market", label: "Mercado", Icon: ShoppingBag, sheet: "shopping" as const },
  { name: "reminders", label: "Lembretes", Icon: Bell, sheet: "reminder" as const },
  { name: "tasks", label: "Tarefas", Icon: ListTodo, sheet: "task" as const },
  { name: "agenda", label: "Agenda", Icon: CalendarClock, sheet: null }
];

export function FloatingTabBar({
  state,
  navigation
}: {
  state: { index: number; routes: Array<{ name: string }> };
  navigation: { navigate: (name: string) => void };
}) {
  const insets = useSafeAreaInsets();
  const { openSheet } = useUI();
  const { session } = useAuth();
  const { plan } = usePlan();
  const canSeeMarket = !plan || canAccessSharedHome(plan, session?.email);
  const visibleTabs = tabs.filter((tab) => tab.name !== "market" || canSeeMarket);
  const routeName = state.routes[state.index]?.name;
  const current = visibleTabs.find((tab) => tab.name === routeName) ?? visibleTabs[0];

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: Math.max(insets.bottom, 12),
        alignItems: "stretch",
        gap: 10
      }}
    >
      {current?.sheet ? (
        <Pressable
          onPress={() => openSheet(current.sheet)}
          accessibilityLabel="Adicionar"
          style={{
            alignSelf: "flex-end",
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.fab,
            alignItems: "center",
            justifyContent: "center",
            ...shadow.bar
          }}
        >
          <Plus size={20} color="#FFFFFF" />
        </Pressable>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.surface,
          borderRadius: radius.pill,
          paddingVertical: 10,
          paddingHorizontal: 4,
          ...shadow.bar
        }}
      >
        {visibleTabs.map((tab) => {
          const active = tab.name === routeName;
          const color = active ? colors.accent : colors.textSoft;
          return (
            <Pressable
              key={tab.name}
              onPress={() => navigation.navigate(tab.name)}
              style={{ flex: 1, alignItems: "center", gap: 4 }}
            >
              <tab.Icon size={18} color={color} />
              <Text numberOfLines={1} style={{ fontSize: 9, fontFamily: active ? fonts.semibold : fonts.regular, color }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
