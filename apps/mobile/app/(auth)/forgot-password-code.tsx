import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text } from "react-native";
import { ApiError, apiRequest } from "../../src/api";
import { AuthButton, AuthFooter, AuthScreen, authStyles } from "../../src/components/auth-ui";
import { CodeBoxes } from "../../src/components/CodeBoxes";

const RESEND_SECONDS = 45;

export default function ForgotPasswordCodeScreen() {
  const router = useRouter();
  const { email = "", phoneHint = "" } = useLocalSearchParams<{ email?: string; phoneHint?: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"verify" | "resend" | "">("");
  const [resendSeconds, setResendSeconds] = useState(RESEND_SECONDS);
  const verifyingRef = useRef(false);

  const hint = String(phoneHint).trim();
  const accountEmail = String(email).trim();

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const resend = async () => {
    if (!accountEmail.includes("@") || resendSeconds > 0 || busy) return;
    setBusy("resend");
    setError("");
    try {
      await apiRequest("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email: accountEmail })
      });
      setCode("");
      setResendSeconds(RESEND_SECONDS);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não consegui reenviar o código no WhatsApp.");
    } finally {
      setBusy("");
    }
  };

  const verify = async (nextCode = code) => {
    if (nextCode.length !== 6 || verifyingRef.current) return;
    verifyingRef.current = true;
    setBusy("verify");
    setError("");
    try {
      const response = await apiRequest("/auth/password/verify", {
        method: "POST",
        body: JSON.stringify({ email: accountEmail, code: nextCode })
      });
      const payload = (await response.json()) as { resetToken?: string };
      if (!payload.resetToken) {
        setError("Não consegui abrir o próximo passo. Tente de novo.");
        return;
      }
      router.replace({
        pathname: "/(auth)/forgot-password-reset",
        params: { email: accountEmail, resetToken: payload.resetToken }
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Código inválido ou vencido.");
      setCode("");
    } finally {
      verifyingRef.current = false;
      setBusy("");
    }
  };

  return (
    <AuthScreen>
      <StatusBar style="light" />
      <Text style={authStyles.title}>Digite o código</Text>
      <Text style={authStyles.body}>
        {hint
          ? `Mandei um código de 6 dígitos no WhatsApp ${hint}.`
          : "Mandei um código de 6 dígitos no WhatsApp cadastrado nesta conta."}
      </Text>

      <CodeBoxes
        value={code}
        onChange={(next) => {
          setCode(next);
          setError("");
        }}
        onComplete={(next) => void verify(next)}
        invalid={Boolean(error)}
      />

      {error ? <Text style={[authStyles.error, { textAlign: "center" }]}>{error}</Text> : null}

      <Pressable onPress={() => void resend()} disabled={resendSeconds > 0 || Boolean(busy)}>
        <Text style={[authStyles.linkCenter, resendSeconds > 0 ? { opacity: 0.45 } : null]}>
          {resendSeconds > 0 ? `Reenviar código em ${resendSeconds}s` : "Reenviar código"}
        </Text>
      </Pressable>

      <AuthButton
        label="Confirmar"
        onPress={() => void verify()}
        busy={busy === "verify"}
        disabled={code.length !== 6}
      />

      <AuthFooter muted="Lembrou a senha?" action="Entrar" onPress={() => router.replace("/(auth)/login")} />
    </AuthScreen>
  );
}
