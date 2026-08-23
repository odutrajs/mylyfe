import { findPersonByEmail } from "@mylyfe/domain";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useMemo, type ReactNode } from "react";
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth-context";
import { formatWhatsappDisplay } from "../format";
import { usePlan } from "../plan-context";
import { colors, radius, spacing } from "../theme";
import { useUI } from "../ui-context";
import { ReminderSheet } from "./ReminderSheet";
import { ShoppingSheet } from "./ShoppingSheet";
import { TransactionSheet } from "./TransactionSheet";

function SheetFrame({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: colors.overlay }} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: Math.max(insets.bottom, 12) + 12,
            maxHeight: "88%"
          }}
        >
          <View style={{ alignSelf: "center", width: 42, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 16 }} />
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 16 }}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AccountSheet() {
  const router = useRouter();
  const { closeSheet } = useUI();
  const { session, logout, deleteAccount } = useAuth();
  const { plan } = usePlan();
  const privacyUrl = "https://feedeo.com.br/privacidade.html";
  const termsUrl = "https://feedeo.com.br/termos.html";
  const person =
    (plan && session ? findPersonByEmail(plan, session.email) : undefined) ??
    plan?.profile.people.find((item) => item.role === "primary");
  const verified = Boolean(person?.whatsappVerifiedAt);
  const phoneLabel = formatWhatsappDisplay(person?.phone);

  const openWhatsAppConfirm = () => {
    closeSheet();
    router.push({
      pathname: "/(auth)/confirm-whatsapp",
      params: person?.phone ? { phone: person.phone } : {}
    });
  };

  const confirmDelete = () => {
    Alert.alert(
      "Excluir conta",
      "Isso apaga sua conta e os dados financeiros ligados a ela. Nao da para desfazer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void deleteAccount()
              .then(closeSheet)
              .catch((error) => {
                Alert.alert("Nao foi possivel excluir", error instanceof Error ? error.message : "Tente de novo.");
              });
          }
        }
      ]
    );
  };

  return (
    <SheetFrame title="Conta" onClose={closeSheet}>
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>{session?.name}</Text>
        <Text style={{ color: colors.textMuted }}>{session?.email}</Text>
        <View
          style={{
            backgroundColor: colors.background,
            borderRadius: radius.lg,
            padding: 14,
            gap: 8
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>WhatsApp</Text>
          {verified ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: colors.success,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Check size={14} color="#FFFFFF" strokeWidth={2.6} />
              </View>
              <View>
                <Text style={{ color: colors.text }}>{phoneLabel}</Text>
                <Text style={{ color: colors.success, fontWeight: "700" }}>Número confirmado</Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
                {phoneLabel
                  ? `Número ${phoneLabel} ainda não confirmado. Sem isso, a secretária não reconhece gastos e reuniões.`
                  : "Sem confirmar, a secretária não reconhece gastos e reuniões deste número."}
              </Text>
              <Pressable onPress={openWhatsAppConfirm}>
                <Text style={{ color: colors.accent, fontWeight: "700" }}>
                  {phoneLabel ? "Confirmar WhatsApp" : "Adicionar WhatsApp"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
        <Pressable onPress={() => void Linking.openURL(privacyUrl)}>
          <Text style={{ color: colors.accent, fontWeight: "700" }}>Politica de privacidade</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(termsUrl)}>
          <Text style={{ color: colors.accent, fontWeight: "700" }}>Termos de uso</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await logout();
            closeSheet();
          }}
          style={{ backgroundColor: colors.background, borderRadius: radius.lg, paddingVertical: 14, alignItems: "center", marginTop: 8 }}
        >
          <Text style={{ color: colors.text, fontWeight: "800" }}>Sair</Text>
        </Pressable>
        <Pressable
          onPress={confirmDelete}
          style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.lg, paddingVertical: 14, alignItems: "center" }}
        >
          <Text style={{ color: colors.danger, fontWeight: "800" }}>Excluir conta</Text>
        </Pressable>
      </View>
    </SheetFrame>
  );
}

export function AppSheets() {
  const { sheet } = useUI();
  const content = useMemo(() => {
    if (sheet === "transaction") return <TransactionSheet />;
    if (sheet === "shopping") return <ShoppingSheet />;
    if (sheet === "reminder") return <ReminderSheet />;
    if (sheet === "account") return <AccountSheet />;
    return null;
  }, [sheet]);
  return content;
}
