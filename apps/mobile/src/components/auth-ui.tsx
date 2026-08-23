import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme";

const loginMascot = require("../../assets/finance/mascote-login.png");

export const authPageBg = "#F7FAFC";
export const authPlaceholder = "#808080";
export const authFieldBorder = "rgba(0,0,0,0.05)";

export function AuthScreen({
  compact = false,
  children
}: {
  compact?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={compact ? styles.heroCompact : styles.hero}>
        <LinearGradient colors={["#0878F9", "#599EEB"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.heroFill} />
        <Image source={loginMascot} resizeMode="contain" style={compact ? styles.mascotCompact : styles.mascot} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.form}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function FloatingField({
  label,
  icon,
  trailing,
  children
}: {
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.field}>
        {icon}
        {children}
        {trailing}
      </View>
      <View style={styles.fieldLabel}>
        <Text style={styles.fieldLabelText}>{label}</Text>
      </View>
    </View>
  );
}

export function AuthButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  ghost = false,
  style
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  ghost?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        ghost ? styles.ghost : styles.submit,
        busy && !ghost ? styles.submitLoading : null,
        disabled && !busy ? styles.submitBusy : null,
        style
      ]}
    >
      <Text style={ghost ? styles.ghostText : styles.submitText}>{busy ? "Aguarde..." : label}</Text>
    </Pressable>
  );
}

export function AuthFooter({ muted, action, onPress }: { muted: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerMuted}>{muted}</Text>
      <Pressable onPress={onPress}>
        <Text style={styles.link}>{action}</Text>
      </Pressable>
    </View>
  );
}

export const authStyles = StyleSheet.create({
  input: {
    flex: 1,
    padding: 0,
    margin: 0,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.2,
    color: colors.text,
    fontFamily: fonts.regular
  },
  title: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: 0.2,
    fontFamily: fonts.bold,
    textAlign: "center"
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    fontFamily: fonts.regular
  },
  note: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular
  },
  link: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.2,
    fontFamily: fonts.regular
  },
  linkCenter: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    fontFamily: fonts.regular
  },
  terms: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular
  }
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: authPageBg
  },
  flex: {
    flex: 1
  },
  hero: {
    height: 300,
    marginBottom: 28
  },
  heroCompact: {
    height: 188,
    marginBottom: 20
  },
  heroFill: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderBottomLeftRadius: 200,
    borderBottomRightRadius: 200
  },
  mascot: {
    position: "absolute",
    alignSelf: "center",
    left: 0,
    right: 0,
    bottom: -6,
    height: 318,
    width: "100%"
  },
  mascotCompact: {
    position: "absolute",
    alignSelf: "center",
    left: 0,
    right: 0,
    bottom: -4,
    height: 188,
    width: "100%"
  },
  form: {
    flexGrow: 1,
    paddingHorizontal: 25,
    gap: 16
  },
  fieldWrap: {
    position: "relative"
  },
  field: {
    minHeight: 54,
    backgroundColor: colors.surface,
    borderColor: authFieldBorder,
    borderWidth: 1,
    borderRadius: 63,
    paddingHorizontal: 32,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  fieldLabel: {
    position: "absolute",
    left: 37,
    top: -12,
    backgroundColor: authPageBg,
    paddingHorizontal: 12
  },
  fieldLabelText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.2,
    fontFamily: fonts.regular
  },
  submit: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 128,
    paddingVertical: 14,
    alignItems: "center"
  },
  ghost: {
    backgroundColor: authPageBg,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 128,
    paddingVertical: 14,
    alignItems: "center"
  },
  submitBusy: {
    opacity: 0.4
  },
  submitLoading: {
    opacity: 0.7
  },
  submitText: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: 0.2,
    fontFamily: fonts.regular
  },
  ghostText: {
    color: colors.accent,
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: 0.2,
    fontFamily: fonts.regular
  },
  footer: {
    marginTop: "auto",
    paddingTop: 36,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4
  },
  footerMuted: {
    color: authPlaceholder,
    opacity: 0.7,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.2,
    fontFamily: fonts.regular
  },
  link: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.2,
    fontFamily: fonts.regular
  }
});
