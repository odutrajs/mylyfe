import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../theme";

export function SpendRing({
  percent,
  size = 86,
  over = false,
  tint,
  label = "do limite",
  showLabel = true
}: {
  percent: number;
  size?: number;
  over?: boolean;
  tint?: string;
  label?: string;
  showLabel?: boolean;
}) {
  const stroke = size <= 36 ? 3.5 : 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percent, 0), 1.2);
  const offset = circumference * (1 - Math.min(clamped, 1));
  const color = tint ?? (over ? colors.danger : colors.accent);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.ringTrack} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {showLabel ? (
        <View style={{ position: "absolute", alignItems: "center" }}>
          <Text style={{ fontSize: label === "poupado" ? 18 : 16, fontWeight: "800", color: label === "poupado" ? colors.success : colors.text }}>
            {Math.round(percent * 100)}%
          </Text>
          <Text style={{ fontSize: label === "poupado" ? 11 : 10, color: colors.textMuted }}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}
