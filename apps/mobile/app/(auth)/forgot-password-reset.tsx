import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Eye, EyeOff, Lock } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput } from "react-native";
import { ApiError, apiRequest } from "../../src/api";
import { AuthButton, AuthFooter, AuthScreen, FloatingField, authPlaceholder, authStyles } from "../../src/components/auth-ui";

export default function ForgotPasswordResetScreen() {
  const router = useRouter();
  const { email = "", resetToken = "" } = useLocalSearchParams<{ email?: string; resetToken?: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const token = String(resetToken).trim();
  const accountEmail = String(email).trim();

  const submit = async () => {
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não são iguais.");
      return;
    }
    if (!token) {
      setError("Este passo expirou. Peça um código novo.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await apiRequest("/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token, password })
      });
      router.replace({
        pathname: "/(auth)/forgot-password-done",
        params: { email: accountEmail }
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não consegui salvar a senha nova.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen>
      <StatusBar style="light" />
      <Text style={authStyles.title}>Nova senha</Text>
      <Text style={authStyles.body}>
        {accountEmail
          ? `Escolha uma senha nova para entrar com ${accountEmail}.`
          : "Escolha uma senha nova para entrar na sua conta."}
      </Text>

      <FloatingField
        label="Senha"
        icon={<Lock size={20} color={authPlaceholder} strokeWidth={1.8} />}
        trailing={
          <Pressable
            onPress={() => setShowPassword((value) => !value)}
            hitSlop={10}
            accessibilityLabel={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? <Eye size={16} color={authPlaceholder} strokeWidth={1.8} /> : <EyeOff size={16} color={authPlaceholder} strokeWidth={1.8} />}
          </Pressable>
        }
      >
        <TextInput
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError("");
          }}
          secureTextEntry={!showPassword}
          textContentType="newPassword"
          autoComplete="new-password"
          placeholder="Digite sua senha"
          placeholderTextColor={authPlaceholder}
          style={authStyles.input}
        />
      </FloatingField>

      <FloatingField
        label="Confirmar senha"
        icon={<Lock size={20} color={authPlaceholder} strokeWidth={1.8} />}
        trailing={
          <Pressable
            onPress={() => setShowConfirm((value) => !value)}
            hitSlop={10}
            accessibilityLabel={showConfirm ? "Ocultar senha" : "Mostrar senha"}
          >
            {showConfirm ? <Eye size={16} color={authPlaceholder} strokeWidth={1.8} /> : <EyeOff size={16} color={authPlaceholder} strokeWidth={1.8} />}
          </Pressable>
        }
      >
        <TextInput
          value={confirm}
          onChangeText={(value) => {
            setConfirm(value);
            setError("");
          }}
          secureTextEntry={!showConfirm}
          textContentType="newPassword"
          placeholder="Repita a senha"
          placeholderTextColor={authPlaceholder}
          style={authStyles.input}
        />
      </FloatingField>

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      <AuthButton
        label="Salvar senha"
        onPress={() => void submit()}
        busy={busy}
        disabled={!password.trim() || !confirm.trim()}
      />

      <AuthFooter muted="Lembrou a senha?" action="Entrar" onPress={() => router.replace("/(auth)/login")} />
    </AuthScreen>
  );
}
