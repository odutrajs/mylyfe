import type { TextStyle } from "react-native";

export const colors = {
  background: "#F7FAFC",
  surface: "#FFFFFF",
  text: "#102A4C",
  textMuted: "#5B6B86",
  textSoft: "#8A97B0",
  accent: "#0878F9",
  accentSoft: "#E7F1FE",
  danger: "#EF5B67",
  dangerSoft: "#FDECEE",
  warning: "#FF9F43",
  warningSoft: "#FFF4E8",
  success: "#37C978",
  successSoft: "#E8F9F0",
  shared: "#7B61FF",
  sharedSoft: "#EEE9FF",
  skyTop: "#E7F1FE",
  skyBottom: "#F7FAFC",
  cloud: "#FFFFFF",
  ringTrack: "#D5E3EC",
  border: "#D5E3EC",
  fab: "#102A4C",
  overlay: "rgba(16, 42, 76, 0.45)",
  leaf: "#37C978"
};

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999
};

export const shadow = {
  card: {
    shadowColor: "#102A4C",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  bar: {
    shadowColor: "#102A4C",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8
  }
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28
};

export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold"
};

export const inputReset = {
  outlineWidth: 0,
  outlineColor: "transparent"
} as unknown as TextStyle;
