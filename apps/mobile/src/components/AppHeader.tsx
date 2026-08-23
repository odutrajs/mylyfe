import { LinearGradient } from "expo-linear-gradient";
import { Settings, type LucideIcon } from "lucide-react-native";
import { Image, Pressable, Text, View, type ImageSourcePropType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme";
import { useUI } from "../ui-context";

const defaultMascot = require("../../assets/finance/mascot-header.png");

export function AppHeader({
  title,
  action,
  mascot = defaultMascot,
  wideMascot = false
}: {
  title: string;
  action?: {
    label: string;
    icon: LucideIcon;
    onPress: () => void;
  };
  mascot?: ImageSourcePropType;
  wideMascot?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { openSheet } = useUI();
  const ActionIcon = action?.icon;

  return (
    <View style={{ zIndex: 2 }}>
      <LinearGradient
        colors={[colors.accent, "#1A8FE3"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{
          height: insets.top + 68,
          paddingTop: insets.top,
          paddingLeft: wideMascot ? 118 : 100,
          paddingRight: 16,
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          shadowColor: colors.accent,
          shadowOpacity: 0.15,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6
        }}
      >
        <Text style={{ flex: 1, color: "#FFFFFF", fontSize: 16, fontFamily: fonts.regular }}>{title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          {action && ActionIcon ? (
            <Pressable onPress={action.onPress} hitSlop={10} accessibilityLabel={action.label}>
              <ActionIcon size={22} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <Pressable onPress={() => openSheet("account")} hitSlop={10} accessibilityLabel="Conta">
            <Settings size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </LinearGradient>
      <Image
        source={mascot}
        resizeMode="contain"
        style={{
          position: "absolute",
          left: wideMascot ? 0 : 8,
          bottom: -18,
          width: wideMascot ? 112 : 85,
          height: 88
        }}
      />
    </View>
  );
}
