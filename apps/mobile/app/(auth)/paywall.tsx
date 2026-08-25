import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ApiError, apiRequest, sessionHasAccess } from "../../src/api";
import { useAuth } from "../../src/auth-context";
import { AuthButton, AuthFooter, AuthScreen, authStyles } from "../../src/components/auth-ui";

export default function PaywallScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const { logout, pendingSession, refreshSession, session } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const firstName = (session ?? pendingSession)?.name.split(" ")[0] ?? "";

  const continueAfterAccess = async () => {
    const next = await refreshSession();
    if (!sessionHasAccess(next)) return false;
    if (phone?.trim()) {
      router.replace({ pathname: "/(auth)/confirm-whatsapp", params: { phone } });
      return true;
    }
    if (pendingSession) {
      router.replace("/(auth)/skip-whatsapp");
      return true;
    }
    router.replace("/(tabs)/home");
    return true;
  };

  const openCheckout = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ source: "mobile" })
      });
      const payload = (await response.json()) as { url?: string };
      if (!payload.url) throw new Error("Nao foi possivel abrir o pagamento.");
      await WebBrowser.openBrowserAsync(payload.url);
      await continueAfterAccess();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível abrir o pagamento no navegador.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (url.includes("billing/success")) {
        void continueAfterAccess();
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <AuthScreen compact>
      <StatusBar style="light" />
      <Text style={authStyles.title}>7 dias para testar</Text>
      <Text style={authStyles.body}>
        {firstName ? `${firstName}, sua` : "Sua"} conta já existe. O cartão entra na nossa tela de checkout — sem
        cobrança agora — e o Zelo destrava quando o trial começar.
      </Text>
      {error ? <Text style={authStyles.error}>{error}</Text> : null}
      <AuthButton label="Liberar meu acesso" busy={busy} onPress={() => void openCheckout()} />
      <AuthFooter muted="Entrou no e-mail errado?" action="Sair" onPress={() => void logout()} />
    </AuthScreen>
  );
}
