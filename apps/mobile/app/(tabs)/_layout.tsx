import { canAccessSharedHome } from "@mylyfe/domain";
import { Tabs } from "expo-router";
import { FloatingTabBar } from "../../src/components/FloatingTabBar";
import { AppSheets } from "../../src/components/Sheets";
import { useAuth } from "../../src/auth-context";
import { usePlan } from "../../src/plan-context";

export default function TabsLayout() {
  const { session } = useAuth();
  const { plan } = usePlan();
  const canSeeMarket = !plan || canAccessSharedHome(plan, session?.email);

  return (
    <>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }}
      >
        <Tabs.Screen name="home" options={{ title: "Inicio" }} />
        <Tabs.Screen name="finance" options={{ title: "Financeiro" }} />
        <Tabs.Screen name="market" options={{ title: "Mercado", href: canSeeMarket ? undefined : null }} />
        <Tabs.Screen name="reminders" options={{ title: "Lembretes" }} />
        <Tabs.Screen name="agenda" options={{ title: "Agenda" }} />
      </Tabs>
      <AppSheets />
    </>
  );
}
