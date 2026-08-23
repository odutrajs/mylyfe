import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "../../src/auth-context";
import { AuthButton, AuthScreen, authStyles } from "../../src/components/auth-ui";
import { Text } from "react-native";

export default function SkipWhatsAppScreen() {
  const router = useRouter();
  const { enterApp } = useAuth();

  const enter = () => {
    enterApp();
    router.replace("/(tabs)/home");
  };

  return (
    <AuthScreen compact>
      <StatusBar style="light" />
      <Text style={authStyles.title}>Quer ligar a secretária?</Text>
      <Text style={authStyles.body}>
        Com o WhatsApp confirmado, a secretária junta gastos e reuniões à sua conta. Você pode fazer isso agora ou
        depois.
      </Text>
      <AuthButton label="Adicionar WhatsApp" onPress={() => router.replace("/(auth)/confirm-whatsapp")} />
      <AuthButton label="Agora não" ghost onPress={enter} />
    </AuthScreen>
  );
}
