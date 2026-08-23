import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, Text, View } from "react-native";
import { colors } from "../theme";

export type MascotMood = "idle" | "wave" | "think" | "celebrate" | "worry" | "search" | "work";

const mascotArt = require("../../assets/zelo-mascot.png");

const loop = (value: Animated.Value, toValue: number, duration: number) =>
  Animated.loop(
    Animated.sequence([
      Animated.timing(value, { toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
    ])
  );

export function Mascot({
  size = 92,
  mood = "idle",
  interactive = true
}: {
  size?: number;
  mood?: MascotMood;
  interactive?: boolean;
}) {
  const [tapMood, setTapMood] = useState<MascotMood | null>(null);
  const resolved = tapMood ?? mood;
  const celebrate = resolved === "celebrate";
  const worry = resolved === "worry";
  const think = resolved === "think" || resolved === "search";
  const wave = resolved === "wave";

  const enter = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 6, tension: 68, useNativeDriver: true }).start();
  }, [enter]);

  useEffect(() => {
    bob.setValue(0);
    tilt.setValue(0);
    const motions = [
      loop(bob, 1, celebrate ? 310 : wave ? 350 : worry ? 700 : 1600),
      loop(tilt, 1, celebrate ? 310 : wave ? 350 : think ? 900 : worry ? 700 : 1800)
    ];
    motions.forEach((motion) => motion.start());
    return () => motions.forEach((motion) => motion.stop());
  }, [bob, celebrate, resolved, think, tilt, wave, worry]);

  const translateY = bob.interpolate({
    inputRange: [0, 1],
    outputRange: [0, celebrate ? -10 : wave ? -6 : think ? -3 : worry ? -2 : -4]
  });
  const rotate = tilt.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", celebrate ? "5deg" : wave ? "-8deg" : think ? "5deg" : worry ? "-4deg" : "2deg"]
  });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });
  const enterY = enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  const waveNow = () => {
    if (!interactive) return;
    setTapMood("wave");
    setTimeout(() => setTapMood(null), 1600);
  };

  return (
    <Pressable onPress={waveNow} disabled={!interactive} accessibilityRole="button" accessibilityLabel="Zelo, quem cuida da sua vida">
      <Animated.View
        style={{
          width: size,
          height: size * 1.12,
          opacity: enter,
          transform: [{ translateY: Animated.add(enterY, translateY) }, { scale }, { rotate }]
        }}
      >
        <Image source={mascotArt} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
      </Animated.View>
    </Pressable>
  );
}

export function mascotMoodFromBudget(over: boolean, tight: boolean): MascotMood {
  if (over) return "worry";
  if (tight) return "think";
  return "celebrate";
}

export function MascotEmpty({
  title,
  caption,
  mood = "idle"
}: {
  title: string;
  caption: string;
  mood?: MascotMood;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 28, paddingHorizontal: 16, gap: 8 }}>
      <Mascot size={84} mood={mood} />
      <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text, textAlign: "center" }}>{title}</Text>
      <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20 }}>{caption}</Text>
    </View>
  );
}
