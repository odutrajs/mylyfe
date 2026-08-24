import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Check } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { AuthButton, AuthScreen, authStyles } from "../../src/components/auth-ui";
import { colors, fonts } from "../../src/theme";

export default function ForgotPasswordDoneScreen() {
  const router = useRouter();
  const { email = "" } = useLocalSearchParams<{ email?: string }>();
  const accountEmail = String(email).trim();

  return (
    <AuthScreen compact>
      <StatusBar style="light" />
      <View style={styles.check}>
        <Check size={36} color="#FFFFFF" strokeWidth={2.6} />
      </View>
      <View style={styles.badge}>
        <Check size={14} color={colors.success} strokeWidth={2.4} />
        <Text style={styles.badgeText}>Senha redefinida</Text>
      </View>
      <Text style={authStyles.title}>Tudo certo</Text>
      <Text style={authStyles.body}>
        {accountEmail
          ? `Sua senha nova já está valendo. Entre de novo com ${accountEmail}.`
          : "Sua senha nova já está valendo. Entre de novo para continuar."}
      </Text>
      <AuthButton label="Entrar" onPress={() => router.replace("/(auth)/login")} style={{ marginTop: "auto" }} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 8
  },
  badge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.successSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  badgeText: {
    color: colors.success,
    fontSize: 13,
    fontFamily: fonts.semibold
  }
});
