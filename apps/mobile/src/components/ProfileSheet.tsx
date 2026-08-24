import { findPersonByEmail } from "@mylyfe/domain";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Check, ChevronRight, FileText, LogOut, MessageCircle, Shield, X } from "lucide-react-native";
import { type ReactNode } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth-context";
import { formatWhatsappDisplay, initialsFrom, shortDate } from "../format";
import { usePlan } from "../plan-context";
import { colors, fonts, radius } from "../theme";
import { useUI } from "../ui-context";
import { OverlayModal } from "./OverlayModal";

const cardBorder = "rgba(16, 42, 76, 0.06)";
const muted = "#808080";
const privacyUrl = "https://feedeo.com.br/privacidade.html";
const termsUrl = "https://feedeo.com.br/termos.html";

const roleLabel = (role?: "primary" | "partner" | "dependent") => {
  if (role === "partner") return "Conta vinculada";
  if (role === "dependent") return "Dependente";
  return "Titular";
};

function Row({
  icon,
  label,
  onPress
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={styles.rowLabel}>{label}</Text>
      <ChevronRight size={16} color={colors.textSoft} />
    </Pressable>
  );
}

export function ProfileSheet() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { closeSheet } = useUI();
  const { session, logout, deleteAccount } = useAuth();
  const { plan } = usePlan();
  const person =
    (plan && session ? findPersonByEmail(plan, session.email) : undefined) ??
    plan?.profile.people.find((item) => item.role === "primary");
  const name = person?.name || session?.name || "Sua conta";
  const email = session?.email ?? person?.email ?? "";
  const verified = Boolean(person?.whatsappVerifiedAt);
  const phoneLabel = formatWhatsappDisplay(person?.phone);
  const birthday = shortDate(person?.birthDate);
  const workspace = plan?.workspace.name?.trim();

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
    <OverlayModal onClose={closeSheet}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <LinearGradient
            colors={[colors.accentSoft, colors.surface]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.heroWash}
          />
          <View style={styles.handle} />
          <Pressable onPress={closeSheet} hitSlop={12} style={styles.close} accessibilityLabel="Fechar">
            <X size={16} color={colors.text} />
          </Pressable>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.identity}>
              <LinearGradient colors={[colors.accent, "#1A8FE3"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                <Text style={styles.avatarText}>{initialsFrom(name)}</Text>
              </LinearGradient>
              <Text style={styles.name}>{name}</Text>
              {email ? <Text style={styles.email}>{email}</Text> : null}
              <View style={styles.metaRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{roleLabel(person?.role)}</Text>
                </View>
                {workspace ? (
                  <View style={[styles.badge, styles.badgeQuiet]}>
                    <Text style={styles.badgeQuietText}>{workspace}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {(birthday || person?.age) && (
              <View style={[styles.card, styles.facts]}>
                {birthday ? (
                  <View style={styles.fact}>
                    <Text style={styles.factLabel}>Nascimento</Text>
                    <Text style={styles.factValue}>{birthday}</Text>
                  </View>
                ) : null}
                {birthday && person?.age ? <View style={styles.factSplit} /> : null}
                {person?.age ? (
                  <View style={styles.fact}>
                    <Text style={styles.factLabel}>Idade</Text>
                    <Text style={styles.factValue}>{person.age} anos</Text>
                  </View>
                ) : null}
              </View>
            )}

            <View style={[styles.card, verified ? styles.whatsappOk : styles.whatsappPending]}>
              <View style={styles.whatsappHead}>
                <View style={[styles.whatsappIcon, verified ? styles.whatsappIconOk : styles.whatsappIconPending]}>
                  <MessageCircle size={16} color={verified ? colors.success : colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>WhatsApp</Text>
                  <Text style={styles.cardHint}>
                    {phoneLabel || "Nenhum número cadastrado"}
                  </Text>
                </View>
                {verified ? (
                  <View style={styles.statusPill}>
                    <Check size={12} color="#FFFFFF" strokeWidth={2.8} />
                    <Text style={styles.statusPillText}>Confirmado</Text>
                  </View>
                ) : (
                  <View style={styles.statusWarn}>
                    <Text style={styles.statusWarnText}>Pendente</Text>
                  </View>
                )}
              </View>
              {verified ? (
                <Text style={styles.whatsappNote}>A secretária já reconhece gastos e reuniões deste número.</Text>
              ) : (
                <>
                  <Text style={styles.whatsappNote}>
                    {phoneLabel
                      ? "Sem confirmar, a secretária não reconhece gastos e reuniões."
                      : "Cadastre e confirme o número para a secretária te reconhecer."}
                  </Text>
                  <Pressable onPress={openWhatsAppConfirm} style={({ pressed }) => [styles.whatsappCta, pressed && styles.pressed]}>
                    <Text style={styles.whatsappCtaText}>{phoneLabel ? "Confirmar WhatsApp" : "Adicionar WhatsApp"}</Text>
                    <ChevronRight size={16} color={colors.accent} />
                  </Pressable>
                </>
              )}
            </View>

            <View style={styles.card}>
              <Row
                icon={<Shield size={16} color={colors.accent} />}
                label="Política de privacidade"
                onPress={() => void Linking.openURL(privacyUrl)}
              />
              <View style={styles.rowDivider} />
              <Row
                icon={<FileText size={16} color={colors.accent} />}
                label="Termos de uso"
                onPress={() => void Linking.openURL(termsUrl)}
              />
            </View>

            <Pressable
              onPress={async () => {
                await logout();
                closeSheet();
              }}
              style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
            >
              <LogOut size={16} color={colors.text} />
              <Text style={styles.logoutText}>Sair da conta</Text>
            </Pressable>

            <Pressable onPress={confirmDelete} style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
              <Text style={styles.deleteText}>Excluir conta</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "92%",
    overflow: "hidden"
  },
  heroWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 168
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 12
  },
  close: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.86)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 14
  },
  identity: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    marginBottom: 6
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 34,
    fontFamily: fonts.bold
  },
  name: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: fonts.bold,
    textAlign: "center"
  },
  email: {
    color: muted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 6
  },
  badge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  badgeText: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: fonts.semibold
  },
  badgeQuiet: {
    backgroundColor: "#F3F4F6"
  },
  badgeQuietText: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.medium
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: cardBorder,
    borderRadius: 20,
    padding: 14
  },
  facts: {
    flexDirection: "row",
    alignItems: "center"
  },
  fact: {
    flex: 1,
    gap: 2,
    paddingHorizontal: 4
  },
  factLabel: {
    color: muted,
    fontSize: 11,
    fontFamily: fonts.medium
  },
  factValue: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.semibold
  },
  factSplit: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: cardBorder,
    marginVertical: 2
  },
  whatsappOk: {
    backgroundColor: colors.successSoft,
    borderColor: "rgba(55, 201, 120, 0.18)"
  },
  whatsappPending: {
    backgroundColor: colors.warningSoft,
    borderColor: "rgba(255, 159, 67, 0.2)"
  },
  whatsappHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  whatsappIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  whatsappIconOk: {
    backgroundColor: "rgba(55, 201, 120, 0.16)"
  },
  whatsappIconPending: {
    backgroundColor: "rgba(255, 159, 67, 0.16)"
  },
  cardTitle: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.bold
  },
  cardHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.regular,
    marginTop: 2
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusPillText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: fonts.bold
  },
  statusWarn: {
    backgroundColor: "rgba(255, 159, 67, 0.16)",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusWarnText: {
    color: "#C56A12",
    fontSize: 11,
    fontFamily: fonts.bold
  },
  whatsappNote: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular
  },
  whatsappCta: {
    marginTop: 12,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  whatsappCtaText: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: fonts.semibold
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  rowLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.medium
  },
  rowDivider: {
    height: 1,
    backgroundColor: cardBorder,
    marginLeft: 44
  },
  logout: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  logoutText: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.semibold
  },
  delete: {
    alignItems: "center",
    paddingVertical: 6
  },
  deleteText: {
    color: colors.danger,
    fontSize: 13,
    fontFamily: fonts.medium
  },
  pressed: {
    opacity: 0.72
  }
});
