import { findPersonByEmail } from "@mylyfe/domain";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text } from "react-native";
import { useAuth } from "../auth-context";
import { initialsFrom } from "../format";
import { usePlan } from "../plan-context";
import { colors, fonts } from "../theme";
import { useUI } from "../ui-context";

export function ProfileButton({ light = false }: { light?: boolean }) {
  const { openSheet } = useUI();
  const { session } = useAuth();
  const { plan } = usePlan();
  const person =
    (plan && session ? findPersonByEmail(plan, session.email) : undefined) ??
    plan?.profile.people.find((item) => item.role === "primary");
  const name = person?.name || session?.name;

  return (
    <Pressable
      onPress={() => openSheet("account")}
      accessibilityLabel="Conta"
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        overflow: "hidden",
        borderWidth: light ? 2 : 0,
        borderColor: "#FFFFFF"
      }}
    >
      <LinearGradient
        colors={[colors.accent, "#1A8FE3"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: 13, fontFamily: fonts.bold }}>{initialsFrom(name)}</Text>
      </LinearGradient>
    </Pressable>
  );
}
