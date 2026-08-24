import { addDaysToKey, normalizeRoutineModuleState, type RoutineTask } from "@mylyfe/domain";
import { StatusBar } from "expo-status-bar";
import { Calendar, ChevronLeft, Flag, Pencil } from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { todayKey } from "../format";
import { usePlan } from "../plan-context";
import { colors, fonts, inputReset } from "../theme";
import { useUI } from "../ui-context";
import { SelectSheet } from "./SelectSheet";

type When = "today" | "tomorrow" | "inbox";

const muted = colors.textMuted;
const cardBorder = colors.border;
const iconAction = colors.accent;

const whenOptions: Array<{ id: When; label: string }> = [
  { id: "today", label: "Hoje" },
  { id: "tomorrow", label: "Amanhã" },
  { id: "inbox", label: "Sem data" }
];

const priorities = [
  { id: "none" as const, label: "Normal" },
  { id: "low" as const, label: "Baixa" },
  { id: "medium" as const, label: "Média" },
  { id: "high" as const, label: "Alta" }
];

const newTaskId = () => `task-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`;

export function TaskSheet() {
  const insets = useSafeAreaInsets();
  const { closeSheet } = useUI();
  const { updatePlan } = usePlan();
  const titleRef = useRef<TextInput>(null);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState<When>("today");
  const [priority, setPriority] = useState<(typeof priorities)[number]["id"]>("none");
  const [notes, setNotes] = useState("");
  const [picker, setPicker] = useState<"when" | "priority" | null>(null);
  const canSave = Boolean(title.trim());
  const today = todayKey();

  useEffect(() => {
    const timer = setTimeout(() => titleRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);

  const submit = async () => {
    if (!canSave) return;
    const createdAt = new Date().toISOString();
    const scheduledDate = when === "today" ? today : when === "tomorrow" ? addDaysToKey(today, 1) : undefined;
    const task: RoutineTask = {
      id: newTaskId(),
      title: title.trim(),
      notes: notes.trim() || undefined,
      status: when === "inbox" ? "inbox" : "todo",
      priority,
      scheduledDate,
      dueDate: scheduledDate,
      focusToday: when === "today",
      subtasks: [],
      createdAt,
      updatedAt: createdAt
    };

    await updatePlan((current) => {
      const routine = normalizeRoutineModuleState(current.routine);
      return {
        ...current,
        routine: {
          ...routine,
          tasks: [task, ...routine.tasks],
          updatedAt: createdAt
        }
      };
    });
    closeSheet();
  };

  return (
    <Modal animationType="slide" onRequestClose={closeSheet} statusBarTranslucent>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 24, paddingBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Pressable
                onPress={closeSheet}
                hitSlop={12}
                accessibilityLabel="Voltar"
                style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
              >
                <ChevronLeft size={20} color={colors.text} />
              </Pressable>
              <View style={{ flex: 1, alignItems: "center", paddingRight: 32 }}>
                <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: muted }}>Tarefas</Text>
                <Text style={{ fontSize: 22, fontFamily: fonts.regular, color: colors.text }}>Adicionar tarefa</Text>
              </View>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 20 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View>
              <FormRow label="Título" icon={Pencil}>
                <TextInput
                  ref={titleRef}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Ex: Ligar para o dentista, Enviar proposta..."
                  placeholderTextColor={muted}
                  selectionColor={colors.accent}
                  style={{ fontSize: 16, fontFamily: fonts.regular, color: colors.text, padding: 0, ...inputReset }}
                />
              </FormRow>
              <FormRow
                label="Quando"
                value={whenOptions.find((item) => item.id === when)?.label ?? "Hoje"}
                icon={Calendar}
                onPress={() => setPicker("when")}
              />
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
                  placeholderTextColor={muted}
                  selectionColor={colors.accent}
                  style={{ fontSize: 16, fontFamily: fonts.regular, color: colors.text, padding: 0, ...inputReset }}
                />
              </FormRow>
            </View>
          </ScrollView>

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
              <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: "#FFFFFF" }}>Salvar tarefa</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>

        <SelectSheet
          visible={picker === "when"}
          title="Quando"
          options={whenOptions.map((item) => ({ value: item.id, label: item.label }))}
          selected={when}
          onSelect={setWhen}
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
  icon: Icon,
  onPress,
  last = false,
  children
}: {
  label: string;
  value?: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress?: () => void;
  last?: boolean;
  children?: ReactNode;
}) {
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16, gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: muted }}>{label}</Text>
        {children ?? (
          <Text style={{ fontSize: 16, fontFamily: fonts.regular, color: colors.text }} numberOfLines={1}>
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
