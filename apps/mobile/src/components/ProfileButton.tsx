import { User } from "lucide-react-native";
import { Pressable } from "react-native";
import { useUI } from "../ui-context";
import { colors } from "../theme";

export function ProfileButton({ light = false }: { light?: boolean }) {
  const { openSheet } = useUI();
  return (
    <Pressable
      onPress={() => openSheet("account")}
      accessibilityLabel="Conta"
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: light ? "#F6F6F6" : colors.surface,
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <User size={18} color={colors.text} />
    </Pressable>
  );
}
