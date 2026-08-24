import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Mail } from "lucide-react-native";
import { useState } from "react";
import { Text, TextInput } from "react-native";
import { ApiError, apiRequest } from "../../src/api";
import { AuthButton, AuthFooter, AuthScreen, FloatingField, authPlaceholder, authStyles } from "../../src/components/auth-ui";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.includes("@")) {
      setError("Informe o e-mail da sua conta.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      const payload = (await response.json()) as { phoneHint?: string };
      router.push({
        pathname: "/(auth)/forgot-password-code",
        params: { email, phoneHint: payload.phoneHint ?? "" }
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não consegui enviar o código no WhatsApp.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen>
      <StatusBar style="light" />
      <Text style={authStyles.title}>Esqueceu a senha?</Text>
      <Text style={authStyles.body}>
        Informe o e-mail da sua conta. O código de 6 dígitos vai para o WhatsApp cadastrado.
      </Text>

      <FloatingField label="E-mail" icon={<Mail size={20} color={authPlaceholder} strokeWidth={1.8} />}>
        <TextInput
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError("");
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          placeholder="email@gmail.com"
          placeholderTextColor={authPlaceholder}
          style={authStyles.input}
        />
      </FloatingField>

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      <AuthButton label="Continuar" onPress={() => void submit()} busy={busy} disabled={!email.trim()} />

      <AuthFooter muted="Lembrou a senha?" action="Entrar" onPress={() => router.replace("/(auth)/login")} />
    </AuthScreen>
  );
}
