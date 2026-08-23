import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Check } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/auth-context";
import { AuthButton, AuthScreen, authStyles } from "../../src/components/auth-ui";
import { colors, fonts } from "../../src/theme";

export default function WhatsAppConfirmedScreen() {
  const router = useRouter();
  const { enterApp } = useAuth();

  return (
    <AuthScreen compact>
      <StatusBar style="light" />
      <View style={styles.check}>
        <Check size={36} color="#FFFFFF" strokeWidth={2.6} />
      </View>
      <View style={styles.badge}>
        <Check size={14} color={colors.success} strokeWidth={2.4} />
        <Text style={styles.badgeText}>Número confirmado</Text>
      </View>
      <Text style={authStyles.title}>WhatsApp confirmado</Text>
      <Text style={authStyles.body}>
        A secretária já te reconhece neste número. Gastos, reuniões e consultas deste WhatsApp vão para a sua conta.
      </Text>
      <AuthButton
        label="Começar"
        onPress={() => {
          enterApp();
          router.replace("/(tabs)/home");
        }}
        style={{ marginTop: "auto" }}
      />
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
