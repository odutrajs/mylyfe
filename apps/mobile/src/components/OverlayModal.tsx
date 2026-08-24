import { type ReactNode, useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, View } from "react-native";
import { colors } from "../theme";

type Props = {
  children: ReactNode;
  onClose: () => void;
  visible?: boolean;
};

export function OverlayModal({ children, onClose, visible = true }: Props) {
  const slide = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    slide.setValue(1);
    const frame = requestAnimationFrame(() => {
      Animated.spring(slide, {
        toValue: 0,
        friction: 9,
        tension: 68,
        useNativeDriver: true
      }).start();
    });
    return () => cancelAnimationFrame(frame);
  }, [slide, visible]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable onPress={onClose} style={styles.backdrop} />
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [
                {
                  translateY: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 36]
                  })
                }
              ]
            }
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end"
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay
  },
  sheet: {
    width: "100%"
  }
});
