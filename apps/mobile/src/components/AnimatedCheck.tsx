import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_D = "M20 6 9 17l-5-5";
const CHECK_LEN = 23;
const HOLD_MS = 520;

export function useHeldComplete(delay = HOLD_MS) {
  const [held, setHeld] = useState<Record<string, true>>({});
  const heldRef = useRef<Record<string, true>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(
    () => () => {
      for (const timer of Object.values(timers.current)) clearTimeout(timer);
    },
    []
  );

  const hold = useCallback(
    (id: string, action: () => void | Promise<void>) => {
      if (heldRef.current[id] || timers.current[id]) return;
      heldRef.current = { ...heldRef.current, [id]: true };
      setHeld(heldRef.current);
      timers.current[id] = setTimeout(() => {
        delete timers.current[id];
        void Promise.resolve(action()).finally(() => {
          setTimeout(() => {
            if (!heldRef.current[id]) return;
            const next = { ...heldRef.current };
            delete next[id];
            heldRef.current = next;
            setHeld(next);
          }, 120);
        });
      }, delay);
    },
    [delay]
  );

  return { held, hold };
}

export function FadeOnComplete({ active, children }: { active: boolean; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: active ? 0 : 1,
      duration: active ? 220 : 160,
      delay: active ? 260 : 0,
      useNativeDriver: true
    }).start();
  }, [active, opacity]);

  return (
    <Animated.View style={{ opacity, transform: [{ scale: opacity.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }}>
      {children}
    </Animated.View>
  );
}

export function AnimatedCheck({
  checked,
  onPress,
  size = 24,
  radius,
  accessibilityLabel,
  borderColor = "#D1D5DB"
}: {
  checked: boolean;
  onPress: () => void;
  size?: number;
  radius?: number;
  accessibilityLabel: string;
  borderColor?: string;
}) {
  const boxRadius = radius ?? size / 2;
  const icon = Math.round(size * 0.58);
  const scale = useRef(new Animated.Value(1)).current;
  const fill = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const dash = useRef(new Animated.Value(checked ? 0 : CHECK_LEN)).current;
  const ring = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    if (checked) {
      dash.setValue(CHECK_LEN);
      fill.setValue(0);
      ring.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 0.78, duration: 70, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, friction: 4, tension: 260, useNativeDriver: true })
        ]),
        Animated.spring(fill, { toValue: 1, friction: 6, tension: 180, useNativeDriver: true }),
        Animated.timing(dash, {
          toValue: 0,
          duration: 280,
          delay: 70,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false
        }),
        Animated.timing(ring, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true })
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(fill, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(dash, { toValue: CHECK_LEN, duration: 120, useNativeDriver: false }),
      Animated.timing(ring, { toValue: 1, duration: 0, useNativeDriver: true })
    ]).start();
  }, [checked, dash, fill, ring, scale]);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", transform: [{ scale }] }}>
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: boxRadius,
            borderWidth: 2,
            borderColor: colors.success,
            opacity: ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.4, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }]
          }}
        />
        <View
          style={{
            width: size,
            height: size,
            borderRadius: boxRadius,
            borderWidth: 1.5,
            borderColor: checked ? colors.success : borderColor,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden"
          }}
        >
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              bottom: -2,
              left: -2,
              borderRadius: boxRadius,
              backgroundColor: colors.success,
              transform: [{ scale: fill }]
            }}
          />
          <Svg width={icon} height={icon} viewBox="0 0 24 24">
            <AnimatedPath
              d={CHECK_D}
              stroke="#FFFFFF"
              strokeWidth={2.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray={`${CHECK_LEN}, ${CHECK_LEN}`}
              strokeDashoffset={dash}
            />
          </Svg>
        </View>
      </Animated.View>
    </Pressable>
  );
}
