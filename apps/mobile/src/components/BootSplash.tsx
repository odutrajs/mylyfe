import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../theme";

const loginMascot = require("../../assets/finance/mascote-login.png");

const phrases = ["Organizando sua vida...", "Olhando o que importa...", "Quase lá..."];

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
    <View style={styles.dots}>
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            {
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.28, 1] }),
              transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }]
            }
          ]}
        />
      ))}
    </View>
  );
}

export function BootSplash() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const copy = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const motion = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
      ])
    );
    motion.start();
    return () => motion.stop();
  }, [bob]);

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
    <LinearGradient colors={["#0878F9", "#1A8FE3"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.screen}>
      <View style={styles.center}>
        <Animated.View
          style={{
            transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }]
          }}
        >
          <Image source={loginMascot} resizeMode="contain" style={styles.mascot} />
        </Animated.View>
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
    paddingHorizontal: 32
  },
  mascot: {
    width: 220,
    height: 236
  },
  brand: {
    marginTop: 4,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 0.2,
    fontFamily: fonts.bold,
    color: "#FFFFFF"
  },
  phrase: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: "rgba(255, 255, 255, 0.88)"
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF"
  }
});
