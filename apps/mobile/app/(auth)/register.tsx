import { isValidWhatsappPhone } from "@mylyfe/domain";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Eye, EyeOff, Lock, Mail, Smartphone, User } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, Text, TextInput } from "react-native";
import { ApiError, sessionHasAccess } from "../../src/api";
import { useAuth } from "../../src/auth-context";
import { AuthButton, AuthFooter, AuthScreen, FloatingField, authPlaceholder, authStyles } from "../../src/components/auth-ui";
import { maskWhatsapp } from "../../src/format";

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) {
      setError("Informe seu nome para criar a conta.");
      return;
    }
    if (!email.includes("@")) {
      setError("Informe um e-mail válido.");
      return;
    }
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (phone.trim() && !isValidWhatsappPhone(phone)) {
      setError("Informe um WhatsApp válido com DDD. Ex: 41 99999-0000.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const next = await register(name, email, password, phone);
      if (!sessionHasAccess(next)) {
        router.replace({ pathname: "/(auth)/paywall", params: phone.trim() ? { phone } : {} });
        return;
      }
      if (phone.trim()) {
        router.replace({ pathname: "/(auth)/confirm-whatsapp", params: { phone } });
        return;
      }
      router.replace("/(auth)/skip-whatsapp");
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Não foi possível criar a conta.";
      if (caught instanceof ApiError && caught.status === 409) {
        setError("Já existe uma conta com este e-mail. Entre com a senha.");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen compact>
      <StatusBar style="light" />
      <FloatingField label="Nome" icon={<User size={20} color={authPlaceholder} strokeWidth={1.8} />}>
        <TextInput
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          textContentType="name"
          placeholder="Seu nome"
          placeholderTextColor={authPlaceholder}
          style={authStyles.input}
        />
      </FloatingField>

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
          textContentType="newPassword"
          placeholder="Digite sua senha"
          placeholderTextColor={authPlaceholder}
          style={authStyles.input}
        />
      </FloatingField>

      <FloatingField label="WhatsApp" icon={<Smartphone size={20} color={authPlaceholder} strokeWidth={1.8} />}>
        <TextInput
          value={phone}
          onChangeText={(value) => setPhone(maskWhatsapp(value))}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder="41 99999-0000"
          placeholderTextColor={authPlaceholder}
          style={authStyles.input}
        />
      </FloatingField>

      <Text style={authStyles.note}>
        Depois a gente confirma este número no WhatsApp. Assim a secretária liga gastos e reuniões a você.
      </Text>

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      <AuthButton label="Criar conta" onPress={() => void submit()} busy={busy} />

      <Text style={authStyles.terms}>
        Ao criar a conta, você aceita os{" "}
        <Text style={authStyles.link} onPress={() => void Linking.openURL("https://feedeo.com.br/termos.html")}>
          Termos
        </Text>{" "}
        e a{" "}
        <Text style={authStyles.link} onPress={() => void Linking.openURL("https://feedeo.com.br/privacidade.html")}>
          Privacidade
        </Text>
        .
      </Text>

      <AuthFooter muted="Já tem uma conta?" action="Entrar" onPress={() => router.replace("/(auth)/login")} />
    </AuthScreen>
  );
}
