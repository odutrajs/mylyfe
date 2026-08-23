import { type ReactNode } from "react";
import { RefreshControl, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";

export function Screen({
  children,
  header,
  refreshing = false,
  onRefresh,
  onScroll,
  padded = true
}: {
  children: ReactNode;
  header?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 120 + insets.bottom,
          paddingHorizontal: padded ? spacing.lg : 0,
          paddingTop: header ? 28 : 0
        }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        {children}
      </ScrollView>
    </View>
  );
}
