import {
  addRoutineStepChild,
  createRoutineSubtask,
  removeRoutineStepChild,
  stepLeafProgress,
  toggleRoutineStepChild,
  toggleRoutineStepDone,
  type RoutineSubtask,
  type RoutineTask
} from "@mylyfe/domain";
import { Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { colors, fonts, inputReset } from "../theme";
import { AnimatedCheck } from "./AnimatedCheck";

const muted = "#808080";
const cardBorder = "rgba(0, 0, 0, 0.05)";

const newId = () => `sub-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`;

const replaceStep = (subtasks: RoutineSubtask[], stepId: string, next: RoutineSubtask) =>
  subtasks.map((item) => (item.id === stepId ? next : item));

export function TaskStepTree({
  task,
  onChange
}: {
  task: RoutineTask;
  onChange: (task: RoutineTask) => void;
}) {
  const [stepTitle, setStepTitle] = useState("");
  const [childDrafts, setChildDrafts] = useState<Record<string, string>>({});
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(task.subtasks.filter((step) => (step.children?.length ?? 0) > 0).map((step) => [step.id, true]))
  );

  const commit = (subtasks: RoutineSubtask[]) => onChange({ ...task, subtasks, updatedAt: new Date().toISOString() });

  const addStep = () => {
    const title = stepTitle.trim();
    if (!title) return;
    commit([...task.subtasks, createRoutineSubtask(newId(), title)]);
    setStepTitle("");
  };

  const addChild = (step: RoutineSubtask) => {
    const title = (childDrafts[step.id] ?? "").trim();
    if (!title) return;
    commit(replaceStep(task.subtasks, step.id, addRoutineStepChild(step, title, newId())));
    setChildDrafts((current) => ({ ...current, [step.id]: "" }));
    setOpenSteps((current) => ({ ...current, [step.id]: true }));
  };

  return (
    <View
      style={{
        marginLeft: 12,
        paddingLeft: 16,
        borderLeftWidth: 2,
        borderLeftColor: "#D7E6F6",
        gap: 8
      }}
    >
      {task.subtasks.map((step) => {
        const progress = stepLeafProgress(step);
        const hasChildren = (step.children?.length ?? 0) > 0;
        const open = openSteps[step.id] ?? hasChildren;
        return (
          <View
            key={step.id}
            style={{
              backgroundColor: colors.background,
              borderRadius: 16,
              padding: 10,
              gap: 8
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AnimatedCheck
                checked={step.done}
                size={20}
                onPress={() => commit(replaceStep(task.subtasks, step.id, toggleRoutineStepDone(step)))}
                accessibilityLabel={`${step.done ? "Reabrir" : "Concluir"} ${step.title}`}
              />
              <Pressable onPress={() => setOpenSteps((current) => ({ ...current, [step.id]: !open }))} style={{ flex: 1, gap: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: fonts.regular,
                    color: step.done ? muted : colors.text,
                    textDecorationLine: step.done ? "line-through" : "none"
                  }}
                >
                  {step.title}
                </Text>
                <Text style={{ fontSize: 11, fontFamily: fonts.regular, color: muted }}>
                  {hasChildren ? `${progress.done}/${progress.total} tarefinhas` : "Passo"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setOpenSteps((current) => ({ ...current, [step.id]: !open }))}
                hitSlop={8}
                accessibilityLabel={open ? "Ocultar tarefinhas" : "Mostrar tarefinhas"}
              >
                <Plus size={16} color={colors.accent} style={{ transform: [{ rotate: open ? "45deg" : "0deg" }] }} />
              </Pressable>
              <Pressable
                onPress={() => commit(task.subtasks.filter((item) => item.id !== step.id))}
                hitSlop={8}
                accessibilityLabel={`Remover ${step.title}`}
              >
                <Trash2 size={15} color={muted} />
              </Pressable>
            </View>

            {open ? (
              <View
                style={{
                  marginLeft: 10,
                  paddingLeft: 12,
                  borderLeftWidth: 2,
                  borderLeftColor: "#E7F1FE",
                  gap: 8
                }}
              >
                {(step.children ?? []).map((child) => (
                  <View key={child.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AnimatedCheck
                      checked={child.done}
                      size={18}
                      onPress={() => commit(replaceStep(task.subtasks, step.id, toggleRoutineStepChild(step, child.id)))}
                      accessibilityLabel={`${child.done ? "Reabrir" : "Concluir"} ${child.title}`}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 12,
                        lineHeight: 16,
                        fontFamily: fonts.regular,
                        color: child.done ? muted : colors.textMuted,
                        textDecorationLine: child.done ? "line-through" : "none"
                      }}
                    >
                      {child.title}
                    </Text>
                    <Pressable
                      onPress={() => commit(replaceStep(task.subtasks, step.id, removeRoutineStepChild(step, child.id)))}
                      hitSlop={8}
                      accessibilityLabel={`Remover ${child.title}`}
                    >
                      <Trash2 size={14} color={muted} />
                    </Pressable>
                  </View>
                ))}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 36,
                    paddingHorizontal: 10,
                    borderWidth: 1,
                    borderColor: cardBorder,
                    borderRadius: 12,
                    backgroundColor: colors.surface
                  }}
                >
                  <TextInput
                    value={childDrafts[step.id] ?? ""}
                    onChangeText={(value) => setChildDrafts((current) => ({ ...current, [step.id]: value }))}
                    onSubmitEditing={() => addChild(step)}
                    placeholder="Tarefinha deste passo..."
                    placeholderTextColor={muted}
                    returnKeyType="done"
                    style={{ flex: 1, fontSize: 12, fontFamily: fonts.regular, color: colors.text, paddingVertical: 6, ...inputReset }}
                  />
                  <Pressable onPress={() => addChild(step)} hitSlop={8} accessibilityLabel="Adicionar tarefinha">
                    <Plus size={15} color={colors.accent} />
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          minHeight: 40,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: cardBorder,
          borderRadius: 14,
          backgroundColor: colors.background
        }}
      >
        <TextInput
          value={stepTitle}
          onChangeText={setStepTitle}
          onSubmitEditing={addStep}
          placeholder="Novo passo desta tarefa..."
          placeholderTextColor={muted}
          returnKeyType="done"
          style={{ flex: 1, fontSize: 13, fontFamily: fonts.regular, color: colors.text, paddingVertical: 8, ...inputReset }}
        />
        <Pressable onPress={addStep} hitSlop={8} accessibilityLabel="Adicionar passo">
          <Plus size={16} color={colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}
