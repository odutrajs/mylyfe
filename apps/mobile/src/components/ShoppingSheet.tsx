import type { ShoppingSector } from "@mylyfe/domain";
import {
  applyShoppingInboxToPlan,
  canAccessSharedHome,
  DEFAULT_SHOPPING_LIST_ID,
  normalizeHomeModuleState,
  setShoppingItemSector,
  shoppingSectorLabels,
  shoppingSectors
} from "@mylyfe/domain";
import { StatusBar } from "expo-status-bar";
import {
  Apple,
  Bath,
  Beef,
  ChevronLeft,
  Croissant,
  CupSoda,
  Milk,
  Package,
  PawPrint,
  Pencil,
  ShoppingBag,
  Snowflake,
  SprayCan,
  Tag,
  Wheat
} from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth-context";
import { usePlan } from "../plan-context";
import { colors, fonts } from "../theme";
import { useUI } from "../ui-context";
import { SelectSheet } from "./SelectSheet";

const muted = "#808080";
const placeholder = "#ACACAC";
const cardBorder = "rgba(0, 0, 0, 0.05)";
const iconAction = colors.accent;
const iconBlack = "#000000";

const quantities = [1, 2, 3, 4, 5, 6, 8, 10, 12];

const sectorIcon: Record<ShoppingSector, ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  hortifruti: Apple,
  padaria: Croissant,
  acougue: Beef,
  frios: Milk,
  congelados: Snowflake,
  mercearia: Wheat,
  bebidas: CupSoda,
  higiene: Bath,
  limpeza: SprayCan,
  pets: PawPrint,
  bazar: Package,
  outros: ShoppingBag
};

export function ShoppingSheet() {
  const insets = useSafeAreaInsets();
  const { closeSheet } = useUI();
  const { session } = useAuth();
  const { plan, updatePlan } = usePlan();
  const nameRef = useRef<TextInput>(null);
  const [step, setStep] = useState<"form" | "sector">("form");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [sector, setSector] = useState<ShoppingSector | null>(null);
  const [pickingQuantity, setPickingQuantity] = useState(false);
  const canSave = Boolean(plan && name.trim() && canAccessSharedHome(plan, session?.email));

  useEffect(() => {
    if (step !== "form") return;
    const timer = setTimeout(() => nameRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [step]);

  const submit = async () => {
    if (!canSave || !plan) return;
    const person = plan.profile.people.find(
      (entry) => entry.email?.trim().toLowerCase() === session?.email?.trim().toLowerCase()
    );
    const draft = quantity > 1 ? `${quantity} ${name.trim()}` : name.trim();
    await updatePlan((current) => {
      const normalized = { ...current, home: normalizeHomeModuleState(current.home) };
      const added = applyShoppingInboxToPlan(normalized, DEFAULT_SHOPPING_LIST_ID, draft, {
        personId: person?.id,
        name: person?.name || session?.name
      });
      if (sector && added.addedItemId) {
        return setShoppingItemSector(added.plan, DEFAULT_SHOPPING_LIST_ID, added.addedItemId, sector);
      }
      return added.plan;
    });
    closeSheet();
  };

  const goBack = () => {
    if (pickingQuantity) {
      setPickingQuantity(false);
      return;
    }
    if (step === "sector") {
      setStep("form");
      return;
    }
    closeSheet();
  };

  return (
    <Modal animationType="slide" onRequestClose={goBack} statusBarTranslucent>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 24,
            paddingBottom: 12,
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: cardBorder
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Pressable onPress={goBack} hitSlop={12} accessibilityLabel="Voltar" style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={20} color={colors.text} />
            </Pressable>
            {step === "form" ? (
              <View style={{ flex: 1, alignItems: "center", paddingRight: 32 }}>
                <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: muted }}>Mercado</Text>
                <Text style={{ fontSize: 18, fontFamily: fonts.bold, color: colors.text }}>Adicionar item</Text>
              </View>
            ) : (
              <Text style={{ flex: 1, fontSize: 18, fontFamily: fonts.bold, color: colors.text }}>Setor do mercado</Text>
            )}
          </View>
        </View>

        {step === "form" ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: cardBorder,
                borderRadius: 24,
                paddingHorizontal: 24,
                paddingVertical: 8
              }}
            >
              <FormRow label="Nome do item" icon={Pencil}>
                <TextInput
                  ref={nameRef}
                  value={name}
                  onChangeText={setName}
                  placeholder="Ex: Banana, Arroz, Detergente..."
                  placeholderTextColor={placeholder}
                  style={{ fontSize: 16, fontFamily: fonts.semibold, color: colors.text, padding: 0 }}
                />
              </FormRow>
              <FormRow label="Quantidade" value={`${quantity} un`} icon={Pencil} onPress={() => setPickingQuantity(true)} />
              <FormRow
                label="Setor do mercado"
                value={sector ? shoppingSectorLabels[sector] : "Selecionar setor"}
                valueColor={sector ? colors.text : placeholder}
                icon={Tag}
                onPress={() => setStep("sector")}
                last
              />
            </View>
          </ScrollView>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8 }}>
            {shoppingSectors.map((item, index) => {
              const Icon = sectorIcon[item];
              const active = sector === item;
              return (
                <View key={item}>
                  <Pressable
                    onPress={() => {
                      setSector(item);
                      setStep("form");
                    }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16 }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: "#F3F4F6",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Icon size={18} color={iconBlack} strokeWidth={2} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 16, fontFamily: fonts.semibold, color: colors.text }}>
                      {shoppingSectorLabels[item]}
                    </Text>
                    {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} /> : null}
                  </Pressable>
                  {index < shoppingSectors.length - 1 ? <View style={{ height: 1, backgroundColor: cardBorder }} /> : null}
                </View>
              );
            })}
          </ScrollView>
        )}

        {step === "form" ? (
          <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 8 }}>
            <Pressable
              onPress={() => void submit()}
              disabled={!canSave}
              style={{
                height: 54,
                borderRadius: 100,
                backgroundColor: colors.accent,
                alignItems: "center",
                justifyContent: "center",
                opacity: canSave ? 1 : 0.45
              }}
            >
              <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: "#FFFFFF" }}>Adicionar</Text>
            </Pressable>
          </View>
        ) : null}

      </KeyboardAvoidingView>
      <SelectSheet
        visible={pickingQuantity}
        title="Quantidade"
        options={quantities.map((value) => ({ value, label: `${value} un` }))}
        selected={quantity}
        onSelect={setQuantity}
        onClose={() => setPickingQuantity(false)}
      />
      </View>
    </Modal>
  );
}

function FormRow({
  label,
  value,
  valueColor = colors.text,
  icon: Icon,
  onPress,
  last = false,
  children
}: {
  label: string;
  value?: string;
  valueColor?: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress?: () => void;
  last?: boolean;
  children?: ReactNode;
}) {
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: muted }}>{label}</Text>
        {children ?? (
          <Text style={{ fontSize: 16, fontFamily: fonts.semibold, color: valueColor }} numberOfLines={1}>
            {value}
          </Text>
        )}
      </View>
      <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
        <Icon size={18} color={iconAction} strokeWidth={2} />
      </View>
    </View>
  );

  return (
    <View>
      {onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content}
      {last ? null : <View style={{ height: 1, backgroundColor: cardBorder }} />}
    </View>
  );
}
