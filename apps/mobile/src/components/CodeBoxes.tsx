import { useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuthChrome } from "./auth-ui";
import { colors, fonts, inputReset } from "../theme";

export function CodeBoxes({
  value,
  onChange,
  invalid,
  onComplete
}: {
  value: string;
  onChange: (next: string) => void;
  invalid: boolean;
  onComplete?: (code: string) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const chrome = useAuthChrome();

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.row}>
      {Array.from({ length: 6 }, (_, index) => (
        <View
          key={index}
          style={[styles.box, value.length === index ? styles.boxActive : null, invalid ? styles.boxInvalid : null]}
        >
          <Text style={styles.digit}>{value[index] ?? ""}</Text>
        </View>
      ))}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(next) => {
          const digits = next.replace(/\D/g, "").slice(0, 6);
          onChange(digits);
          if (digits.length === 6 && digits !== value) onComplete?.(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        showSoftInputOnFocus
        caretHidden
        underlineColorAndroid="transparent"
        selectionColor={colors.accent}
        onFocus={chrome.collapse}
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  box: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center"
  },
  boxActive: {
    borderColor: colors.accent,
    borderWidth: 1.5
  },
  boxInvalid: {
    borderColor: colors.danger
  },
  digit: {
    fontSize: 22,
    lineHeight: 28,
    color: colors.text,
    fontFamily: fonts.semibold
  },
  hidden: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.02,
    ...inputReset
  }
});
