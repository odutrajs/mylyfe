import { Check } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, shadow } from "../theme";

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
};

type Props<T extends string | number> = {
  visible: boolean;
  title: string;
  options: Array<SelectOption<T>>;
  selected?: T | null;
  onSelect: (value: T) => void;
  onClose: () => void;
};

export function SelectSheet<T extends string | number>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose
}: Props<T>) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShown(true);
      Keyboard.dismiss();
      progress.setValue(0);
      const frame = requestAnimationFrame(() => {
        Animated.spring(progress, {
          toValue: 1,
          friction: 8,
          tension: 72,
          useNativeDriver: true
        }).start();
      });
      return () => cancelAnimationFrame(frame);
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) setShown(false);
    });
  }, [visible, progress]);

  if (!shown) return null;

  return (
    <View style={styles.layer} pointerEvents="box-none">
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity: progress }]} />
      </Pressable>
      <Animated.View
        style={[
          styles.sheet,
          shadow.card,
          {
            marginBottom: Math.max(insets.bottom, 12) + 8,
            opacity: progress,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [28, 0]
                })
              }
            ]
          }
        ]}
      >
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>
        <ScrollView
          style={{ maxHeight: 360 }}
          bounces={options.length > 7}
          showsVerticalScrollIndicator={false}
        >
          {options.map((option, index) => {
            const active = option.value === selected;
            return (
              <View key={String(option.value)}>
                <Pressable
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  style={[styles.option, active ? styles.optionActive : null]}
                >
                  <Text style={[styles.optionLabel, active ? styles.optionLabelActive : null]}>{option.label}</Text>
                  {active ? <Check size={18} color={colors.accent} strokeWidth={2.4} /> : null}
                </Pressable>
                {index < options.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    justifyContent: "flex-end"
  },
  overlay: {
    backgroundColor: colors.overlay
  },
  sheet: {
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 10
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.text,
    paddingHorizontal: 16,
    marginBottom: 8
  },
  option: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  optionActive: {
    backgroundColor: colors.accentSoft
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text
  },
  optionLabelActive: {
    color: colors.accent,
    fontFamily: fonts.bold
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    marginHorizontal: 16
  }
});
