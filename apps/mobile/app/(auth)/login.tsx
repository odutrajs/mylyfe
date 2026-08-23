import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, Text, TextInput } from "react-native";
import { ApiError } from "../../src/api";
import { useAuth } from "../../src/auth-context";
import { AuthButton, AuthFooter, AuthScreen, FloatingField, authPlaceholder, authStyles } from "../../src/components/auth-ui";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await login(email, password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen>
      <StatusBar style="light" />
      <FloatingField label="E-mail" icon={<Mail size={20} color={authPlaceholder} strokeWidth={1.8} />}>
        <TextInput
          value={email}
          onChangeText={setEmail}
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

      <FloatingField
        label="Senha"
        icon={<Lock size={20} color={authPlaceholder} strokeWidth={1.8} />}
        trailing={
          <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={10} accessibilityLabel={showPassword ? "Ocultar senha" : "Mostrar senha"}>
            {showPassword ? <Eye size={16} color={authPlaceholder} strokeWidth={1.8} /> : <EyeOff size={16} color={authPlaceholder} strokeWidth={1.8} />}
          </Pressable>
        }
      >
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          textContentType="password"
          autoComplete="password"
          placeholder="Digite sua senha"
          placeholderTextColor={authPlaceholder}
          style={authStyles.input}
        />
      </FloatingField>

      <Pressable onPress={() => void Linking.openURL("https://feedeo.com.br")} style={{ alignSelf: "flex-end", marginTop: -4 }}>
        <Text style={{ color: "#0878F9", fontSize: 14, lineHeight: 20 }}>Esqueci a senha</Text>
      </Pressable>

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      <AuthButton label="Entrar" onPress={() => void submit()} busy={busy} />

      <AuthFooter muted="Não tem uma conta?" action="Criar conta" onPress={() => router.push("/(auth)/register")} />
    </AuthScreen>
  );
}
