import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../theme";
import { Mascot, type MascotMood } from "./Mascot";

const phrases = ["Organizando...", "Olhando o que importa...", "Quase la..."];

function DriftOrb({
  delay,
  size,
  color,
  style
}: {
  delay: number;
  size: number;
  color: string;
  style: { top?: number; bottom?: number; left?: number; right?: number };
}) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const motion = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 3800, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 3800, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
      ])
    );
    motion.start();
    return () => motion.stop();
  }, [delay, drift]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: 0.42,
          transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) }]
        },
        style
      ]}
    />
  );
}

function Dots() {
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const motions = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(value, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true })
        ])
      )
    );
    motions.forEach((motion) => motion.start());
    return () => motions.forEach((motion) => motion.stop());
  }, [values]);

  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.accent,
            opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
            transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }]
          }}
        />
      ))}
    </View>
  );
}

export function BootSplash() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const copy = useRef(new Animated.Value(1)).current;
  const mood = useMemo<MascotMood>(() => {
    if (phraseIndex === 0) return "search";
    if (phraseIndex === 1) return "work";
    return "wave";
  }, [phraseIndex]);

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.timing(copy, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        setPhraseIndex((current) => (current + 1) % phrases.length);
        Animated.timing(copy, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    }, 1400);
    return () => clearInterval(timer);
  }, [copy]);

  return (
    <LinearGradient colors={[colors.skyTop, colors.accentSoft, colors.skyBottom]} style={styles.screen}>
      <DriftOrb delay={0} size={240} color="#B8DFF0" style={{ top: 70, right: -80 }} />
      <DriftOrb delay={600} size={170} color="#E8F1FF" style={{ bottom: 120, left: -50 }} />
      <DriftOrb delay={300} size={100} color="#C5E4F6" style={{ top: 210, left: 28 }} />
      <View style={styles.center}>
        <Mascot size={148} mood={mood} interactive={false} />
        <Text style={styles.brand}>Zelo</Text>
        <Animated.Text style={[styles.phrase, { opacity: copy }]}>{phrases[phraseIndex]}</Animated.Text>
        <Dots />
      </View>
    </LinearGradient>
  );
}

export function SplashOverlay({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [opacity, visible]);

  if (!mounted) return null;

  return (
    <Animated.View pointerEvents={visible ? "auto" : "none"} style={[StyleSheet.absoluteFill, { zIndex: 40, opacity }]}>
      <BootSplash />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  center: {
    alignItems: "center",
    paddingHorizontal: 28
  },
  brand: {
    marginTop: 6,
    fontSize: 34,
    fontFamily: fonts.bold,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.6
  },
  phrase: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "600",
    color: colors.textMuted
  }
});
