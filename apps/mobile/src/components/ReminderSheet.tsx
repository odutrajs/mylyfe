import type { AlertFrequency, AlertKind, ExpenseCategory } from "@mylyfe/domain";
import { addDaysToKey, weekdayFromKey } from "@mylyfe/domain";
import { StatusBar } from "expo-status-bar";
import {
  Briefcase,
  Calendar,
  ChevronLeft,
  Clock,
  CreditCard,
  FileText,
  Flag,
  Heart,
  Pencil,
  Pill,
  RefreshCcw,
  ShoppingCart,
  Tag,
  User,
  Wallet,
  Zap
} from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { todayKey } from "../format";
import { usePlan } from "../plan-context";
import { colors, fonts } from "../theme";
import { useUI } from "../ui-context";
import { SelectSheet } from "./SelectSheet";

type Priority = "normal" | "high" | "low";
type CategoryOption = {
  id: string;
  label: string;
  kind: AlertKind;
  category?: ExpenseCategory;
};

const muted = "#808080";
const placeholder = "#ACACAC";
const cardBorder = "rgba(0, 0, 0, 0.05)";
const iconAction = colors.accent;
const chipBg = "#FFF3E0";

const frequencies: Array<{ id: AlertFrequency; label: string }> = [
  { id: "once", label: "Não repetir" },
  { id: "daily", label: "Todo dia" },
  { id: "weekly", label: "Semanal" },
  { id: "monthly", label: "Mensal" }
];

const hours = [8, 9, 10, 12, 14, 16, 18, 20, 21];

const priorities: Array<{ id: Priority; label: string; remindDays: number }> = [
  { id: "low", label: "Baixa", remindDays: 0 },
  { id: "normal", label: "Normal", remindDays: 1 },
  { id: "high", label: "Alta", remindDays: 3 }
];

const categoryOptions: CategoryOption[] = [
  { id: "bills", label: "Contas", kind: "bill" },
  { id: "health", label: "Saúde", kind: "habit", category: "health" },
  { id: "shopping", label: "Compras", kind: "one_off", category: "shopping" },
  { id: "work", label: "Trabalho", kind: "one_off", category: "company" },
  { id: "personal", label: "Pessoal", kind: "one_off" },
  { id: "docs", label: "Documentos", kind: "document" }
];

const categoryIcon: Record<string, ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  bills: Wallet,
  health: Heart,
  shopping: ShoppingCart,
  work: Briefcase,
  personal: User,
  docs: FileText
};

const templates = [
  { title: "Conta de luz", kind: "bill" as const, frequency: "monthly" as const, categoryId: "bills", Icon: Zap },
  { title: "Remédio", kind: "habit" as const, frequency: "daily" as const, categoryId: "health", Icon: Pill },
  { title: "Consulta médica", kind: "one_off" as const, frequency: "once" as const, categoryId: "health", Icon: Heart },
  { title: "Mercado", kind: "one_off" as const, frequency: "once" as const, categoryId: "shopping", Icon: ShoppingCart },
  { title: "Reunião", kind: "one_off" as const, frequency: "once" as const, categoryId: "work", Icon: Briefcase }
];

const formatDate = (dayKey: string) => {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const mon = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
  const monthLabel = mon.slice(0, 1).toUpperCase() + mon.slice(1, 3);
  return `${String(day).padStart(2, "0")} ${monthLabel} ${year}`;
};

const formatHour = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

const formatCents = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dayFromKey = (dayKey: string) => Number(dayKey.slice(8));

export function ReminderSheet() {
  const insets = useSafeAreaInsets();
  const { closeSheet } = useUI();
  const { upsertAlert } = usePlan();
  const titleRef = useRef<TextInput>(null);
  const [step, setStep] = useState<"form" | "category">("form");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayKey());
  const [hour, setHour] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<AlertFrequency>("once");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cents, setCents] = useState(0);
  const [priority, setPriority] = useState<Priority>("normal");
  const [notes, setNotes] = useState("");
  const [picker, setPicker] = useState<"date" | "hour" | "frequency" | "priority" | null>(null);
  const selectedCategory = categoryOptions.find((item) => item.id === categoryId);
  const canSave = Boolean(title.trim());
  const today = todayKey();

  useEffect(() => {
    if (step !== "form") return;
    const timer = setTimeout(() => titleRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [step]);

  const applyTemplate = (template: (typeof templates)[number]) => {
    setTitle(template.title);
    setFrequency(template.frequency);
    setCategoryId(template.categoryId);
  };

  const submit = async () => {
    if (!canSave) return;
    const option = selectedCategory ?? { kind: "one_off" as const, category: undefined };
    const remind = priorities.find((item) => item.id === priority)?.remindDays;
    await upsertAlert({
      title: title.trim(),
      kind: option.kind,
      category: option.category,
      amount: cents > 0 ? cents / 100 : undefined,
      notes: notes.trim() || undefined,
      frequency,
      dueDay: frequency === "monthly" ? dayFromKey(date) : undefined,
      dueDate: frequency === "once" ? date : undefined,
      weekday: frequency === "weekly" ? weekdayFromKey(date) : undefined,
      preferredHour: hour ?? 9,
      remindDaysBefore: remind,
      askIfPaid: option.kind === "bill" || option.kind === "tax"
    });
    closeSheet();
  };

  const goBack = () => {
    if (picker) {
      setPicker(null);
      return;
    }
    if (step === "category") {
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
                <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: muted }}>Lembretes</Text>
                <Text style={{ fontSize: 18, fontFamily: fonts.bold, color: colors.text }}>Adicionar lembrete</Text>
              </View>
            ) : (
              <Text style={{ flex: 1, fontSize: 18, fontFamily: fonts.bold, color: colors.text }}>Categoria</Text>
            )}
          </View>
        </View>

        {step === "form" ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 20 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: cardBorder,
                borderRadius: 24,
                paddingHorizontal: 20,
                paddingVertical: 8
              }}
            >
              <FormRow label="Título" icon={Pencil}>
                <TextInput
                  ref={titleRef}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Ex: Pagar conta de luz, Renovar receita..."
                  placeholderTextColor={placeholder}
                  style={{ fontSize: 16, fontFamily: fonts.semibold, color: colors.text, padding: 0 }}
                />
              </FormRow>
              <FormRow label="Data" value={formatDate(date)} icon={Calendar} onPress={() => setPicker("date")} />
              <FormRow
                label="Horário"
                value={hour === null ? "Definir horário" : formatHour(hour)}
                valueColor={hour === null ? placeholder : colors.text}
                icon={Clock}
                onPress={() => setPicker("hour")}
              />
              <FormRow
                label="Repetir"
                value={frequencies.find((item) => item.id === frequency)?.label ?? "Não repetir"}
                icon={RefreshCcw}
                onPress={() => setPicker("frequency")}
              />
              <FormRow
                label="Categoria"
                value={selectedCategory?.label ?? "Selecionar categoria"}
                valueColor={selectedCategory ? colors.text : placeholder}
                icon={Tag}
                onPress={() => setStep("category")}
              />
              <FormRow label="Valor (opcional)" icon={CreditCard}>
                <TextInput
                  value={`R$ ${formatCents(cents)}`}
                  onChangeText={(value) => setCents(Number(value.replace(/\D/g, "").slice(0, 9) || 0))}
                  keyboardType="number-pad"
                  style={{ fontSize: 16, fontFamily: fonts.semibold, color: cents > 0 ? colors.text : placeholder, padding: 0 }}
                />
              </FormRow>
              <FormRow
                label="Prioridade"
                value={priorities.find((item) => item.id === priority)?.label ?? "Normal"}
                icon={Flag}
                onPress={() => setPicker("priority")}
              />
              <FormRow label="Observação" icon={Pencil} last>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Adicionar nota..."
                  placeholderTextColor={placeholder}
                  style={{ fontSize: 16, fontFamily: fonts.semibold, color: colors.text, padding: 0 }}
                />
              </FormRow>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ height: 1, backgroundColor: cardBorder }} />
              <Text style={{ fontSize: 15, fontFamily: fonts.bold, color: colors.text }}>Modelos rápidos</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {templates.map((item) => (
                  <Pressable
                    key={item.title}
                    onPress={() => applyTemplate(item)}
                    style={{
                      backgroundColor: chipBg,
                      borderRadius: 100,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    <item.Icon size={14} color={colors.warning} strokeWidth={2} />
                    <Text style={{ fontSize: 14, fontFamily: fonts.semibold, color: colors.text }}>{item.title}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8 }}>
            {categoryOptions.map((item, index) => {
              const Icon = categoryIcon[item.id] ?? Tag;
              const active = categoryId === item.id;
              return (
                <View key={item.id}>
                  <Pressable
                    onPress={() => {
                      setCategoryId(item.id);
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
                      <Icon size={18} color="#000000" strokeWidth={2} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 16, fontFamily: fonts.semibold, color: colors.text }}>{item.label}</Text>
                    {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} /> : null}
                  </Pressable>
                  {index < categoryOptions.length - 1 ? <View style={{ height: 1, backgroundColor: cardBorder }} /> : null}
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
              <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: "#FFFFFF" }}>Salvar lembrete</Text>
            </Pressable>
          </View>
        ) : null}

      </KeyboardAvoidingView>
      <SelectSheet
        visible={picker === "date"}
        title="Data"
        options={[
          { value: today, label: `Hoje (${formatDate(today)})` },
          { value: addDaysToKey(today, 1), label: `Amanhã (${formatDate(addDaysToKey(today, 1))})` },
          { value: addDaysToKey(today, 7), label: `Em 7 dias (${formatDate(addDaysToKey(today, 7))})` }
        ]}
        selected={date}
        onSelect={setDate}
        onClose={() => setPicker(null)}
      />
      <SelectSheet
        visible={picker === "hour"}
        title="Horário"
        options={hours.map((value) => ({ value, label: formatHour(value) }))}
        selected={hour}
        onSelect={setHour}
        onClose={() => setPicker(null)}
      />
      <SelectSheet
        visible={picker === "frequency"}
        title="Repetir"
        options={frequencies.map((item) => ({ value: item.id, label: item.label }))}
        selected={frequency}
        onSelect={setFrequency}
        onClose={() => setPicker(null)}
      />
      <SelectSheet
        visible={picker === "priority"}
        title="Prioridade"
        options={priorities.map((item) => ({ value: item.id, label: item.label }))}
        selected={priority}
        onSelect={setPriority}
        onClose={() => setPicker(null)}
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
