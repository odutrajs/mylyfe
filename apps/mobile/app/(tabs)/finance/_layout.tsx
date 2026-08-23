import { Stack } from "expo-router";

export default function FinanceLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="future" options={{ href: null, animation: "none" }} />
      <Stack.Screen name="categories" />
      <Stack.Screen name="category/[id]" />
      <Stack.Screen name="statement" />
    </Stack>
  );
}
