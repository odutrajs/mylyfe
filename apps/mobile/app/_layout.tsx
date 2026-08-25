import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts
} from "@expo-google-fonts/plus-jakarta-sans";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import { sessionHasAccess } from "../src/api";
import { AuthProvider, useAuth } from "../src/auth-context";
import { SplashOverlay } from "../src/components/BootSplash";
import { ReminderNotifications } from "../src/components/ReminderNotifications";
import { useOnboardingSeen } from "../src/onboarding";
import { PlanProvider, usePlan } from "../src/plan-context";
import { colors, fonts, inputReset } from "../src/theme";
import { UIProvider } from "../src/ui-context";

void SplashScreen.preventAutoHideAsync();

const minSplashMs = 1600;

const whatsappAuthScreens = new Set(["confirm-whatsapp", "skip-whatsapp", "whatsapp-confirmed"]);

function Gate({ children }: { children: ReactNode }) {
  const { ready, session, pendingSession } = useAuth();
  const { ready: onboardingReady, seen: onboardingSeen } = useOnboardingSeen();
  const { plan, loading } = usePlan();
  const segments = useSegments();
  const router = useRouter();
  const openedAt = useRef(Date.now());
  const [hold, setHold] = useState(true);

  const waitingPlan = Boolean(ready && session && !plan && loading);
  const bootReady = ready && onboardingReady && !waitingPlan;

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (!ready || !onboardingReady) return;
    const inAuth = segments[0] === "(auth)";
    const authScreen = String(segments.at(1) ?? "");
    const stayingForWhatsApp = inAuth && whatsappAuthScreens.has(authScreen);
    const accessSession = session ?? pendingSession;
    const hasAccess = sessionHasAccess(accessSession);
    if (accessSession && !hasAccess) {
      if (authScreen !== "paywall") router.replace("/(auth)/paywall");
      return;
    }
    if (!session && !pendingSession && !inAuth) {
      router.replace(onboardingSeen ? "/(auth)/login" : "/(auth)/onboarding");
    }
    if (session && inAuth && hasAccess && !stayingForWhatsApp) router.replace("/(tabs)/home");
  }, [onboardingReady, onboardingSeen, pendingSession, ready, router, segments, session]);

  useEffect(() => {
    if (!bootReady) {
      setHold(true);
      return;
    }
    const remaining = Math.max(0, minSplashMs - (Date.now() - openedAt.current));
    const timer = setTimeout(() => setHold(false), remaining);
    return () => clearTimeout(timer);
  }, [bootReady]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.skyTop }}>
      {ready ? children : null}
      <SplashOverlay visible={hold} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold
  });

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (document.getElementById("tf-input-focus-reset")) return;
    const style = document.createElement("style");
    style.id = "tf-input-focus-reset";
    style.textContent =
      "input,textarea,select,input:focus,input:focus-visible,textarea:focus,textarea:focus-visible,select:focus,select:focus-visible{outline:none!important;-webkit-tap-highlight-color:transparent;}";
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!fontsLoaded) return;
    const textStyle = { fontFamily: fonts.regular, ...inputReset };
    Object.assign(Text, { defaultProps: { ...(Text.defaultProps ?? {}), style: { fontFamily: fonts.regular } } });
    Object.assign(TextInput, {
      defaultProps: {
        ...(TextInput.defaultProps ?? {}),
        style: textStyle,
        underlineColorAndroid: "transparent",
        selectionColor: colors.accent
      }
    });
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.skyTop }} />;
  }

  return (
    <AuthProvider>
      <PlanProvider>
        <UIProvider>
          <ReminderNotifications />
          <StatusBar style="dark" />
          <Gate>
            <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: colors.skyTop } }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </Gate>
        </UIProvider>
      </PlanProvider>
    </AuthProvider>
  );
}
