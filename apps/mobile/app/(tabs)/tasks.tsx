import {
  isTaskForDay,
  normalizeRoutineModuleState,
  taskSubtaskProgress,
  upcomingTasks,
  type RoutineTask
} from "@mylyfe/domain";
import { ListTodo } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { AnimatedCheck, FadeOnComplete, useHeldComplete } from "../../src/components/AnimatedCheck";
import { AppHeader } from "../../src/components/AppHeader";
import { Screen } from "../../src/components/Screen";
import { TaskStepTree } from "../../src/components/TaskStepTree";
import { todayKey } from "../../src/format";
import { usePlan } from "../../src/plan-context";
import { colors, fonts } from "../../src/theme";
import { useUI } from "../../src/ui-context";

type Filter = "today" | "upcoming" | "inbox" | "done" | "all";

const cardBorder = "rgba(0, 0, 0, 0.05)";
const muted = "#808080";

const filters: Array<{ id: Filter; label: string }> = [
  { id: "today", label: "Hoje" },
  { id: "upcoming", label: "Próximas" },
  { id: "inbox", label: "Inbox" },
  { id: "done", label: "Feitas" },
  { id: "all", label: "Todas" }
];

const monthLabel = (dayKey: string) => {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const mon = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
  return `${mon.slice(0, 1).toUpperCase()}${mon.slice(1, 3)} ${String(day).padStart(2, "0")}`;
};

const subtitleFor = (task: RoutineTask) => {
  const progress = taskSubtaskProgress(task);
  const parts: string[] = [];
  if (task.status === "done") parts.push("Concluída");
  else if (task.status === "inbox") parts.push("Sem data");
  else if (task.dueDate) parts.push(`Prazo ${monthLabel(task.dueDate)}`);
  else if (task.scheduledDate) parts.push(monthLabel(task.scheduledDate));
  else if (task.focusToday) parts.push("Foco de hoje");
  if (progress.total) parts.push(`${progress.done}/${progress.total} ${progress.nested ? "itens" : "passos"}`);
  return parts.join(" · ") || task.notes || "Tarefa";
};

export default function TasksScreen() {
  const { plan, loading, refresh, updatePlan } = usePlan();
  const { openSheet } = useUI();
  const { held, hold } = useHeldComplete();
  const [filter, setFilter] = useState<Filter>("today");
  const today = todayKey();
  const routine = useMemo(() => normalizeRoutineModuleState(plan?.routine), [plan?.routine]);

  const visible = useMemo(() => {
    const tasks = routine.tasks;
    if (filter === "today") {
      return tasks
        .filter((task) => task.status !== "done" && task.status !== "inbox" && (isTaskForDay(task, today) || task.scheduledDate === today || task.dueDate === today))
        .sort(sortVisible);
    }
    if (filter === "upcoming") return upcomingTasks(tasks, today);
    if (filter === "inbox") return tasks.filter((task) => task.status === "inbox").sort(sortVisible);
    if (filter === "done") return tasks.filter((task) => task.status === "done").sort(sortVisible);
    return [...tasks].sort(sortVisible);
  }, [filter, routine.tasks, today]);

  const persistTask = (task: RoutineTask) => {
    void updatePlan((current) => {
      const next = normalizeRoutineModuleState(current.routine);
      const now = new Date().toISOString();
      return {
        ...current,
        routine: {
          ...next,
          tasks: next.tasks.map((item) => (item.id === task.id ? { ...task, updatedAt: now } : item)),
          updatedAt: now
        }
      };
    });
  };

  const persistToggle = (task: RoutineTask) => {
    persistTask({
      ...task,
      status: task.status === "done" ? (task.scheduledDate || task.dueDate || task.focusToday ? "todo" : "inbox") : "done"
    });
  };

  const toggleTask = (task: RoutineTask) => {
    if (task.status === "done") {
      persistToggle(task);
      return;
    }
    hold(task.id, () => persistToggle(task));
  };

  const removeTask = (task: RoutineTask) => {
    void updatePlan((current) => {
      const next = normalizeRoutineModuleState(current.routine);
      const now = new Date().toISOString();
      return {
        ...current,
        routine: {
          ...next,
          tasks: next.tasks.filter((item) => item.id !== task.id),
          updatedAt: now
        }
      };
    });
  };

  const openActions = (task: RoutineTask) => {
    Alert.alert(task.title, subtitleFor(task), [
      {
        text: task.status === "done" ? "Reabrir" : "Concluir",
        onPress: () => toggleTask(task)
      },
      { text: "Excluir", style: "destructive", onPress: () => removeTask(task) },
      { text: "Cancelar", style: "cancel" }
    ]);
  };

  return (
    <Screen
      header={
        <AppHeader
          title="Tarefas"
          action={{
            label: "Criar tarefa",
            icon: ListTodo,
            onPress: () => openSheet("task")
          }}
        />
      }
      refreshing={loading}
      onRefresh={() => void refresh()}
      padded={false}
    >
      <View style={{ paddingHorizontal: 20, gap: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {filters.map((item) => {
            const active = filter === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setFilter(item.id)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 100,
                  backgroundColor: active ? colors.accent : colors.surface,
                  borderWidth: active ? 0 : 1,
                  borderColor: cardBorder
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: fonts.regular,
                    color: active ? "#FFFFFF" : colors.text
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {visible.length === 0 ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: cardBorder,
              borderRadius: 20,
              padding: 16,
              gap: 4
            }}
          >
            <Text style={{ fontSize: 15, fontFamily: fonts.regular, color: colors.text }}>Nada por aqui</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: muted }}>
              Cria uma tarefa e eu deixo ela no seu dia.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {visible.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                completing={Boolean(held[task.id])}
                leaving={Boolean(held[task.id]) && filter !== "done" && filter !== "all"}
                onToggle={() => toggleTask(task)}
                onPress={() => openActions(task)}
                onChange={persistTask}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

function sortVisible(left: RoutineTask, right: RoutineTask) {
  const leftDone = left.status === "done" ? 1 : 0;
  const rightDone = right.status === "done" ? 1 : 0;
  if (leftDone !== rightDone) return leftDone - rightDone;
  return left.title.localeCompare(right.title, "pt-BR");
}

function TaskCard({
  task,
  completing,
  leaving,
  onToggle,
  onPress,
  onChange
}: {
  task: RoutineTask;
  completing: boolean;
  leaving: boolean;
  onToggle: () => void;
  onPress: () => void;
  onChange: (task: RoutineTask) => void;
}) {
  const [open, setOpen] = useState(task.subtasks.length > 0);
  const done = completing || task.status === "done";
  const progress = taskSubtaskProgress(task);

  return (
    <FadeOnComplete active={leaving}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: cardBorder,
          borderRadius: 20,
          padding: 16,
          gap: 12
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <AnimatedCheck
            checked={done}
            onPress={onToggle}
            accessibilityLabel={`${done ? "Reabrir" : "Concluir"} ${task.title}`}
          />
          <Pressable onPress={() => setOpen((current) => !current)} onLongPress={onPress} style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                fontSize: 16,
                fontFamily: fonts.regular,
                color: done ? muted : colors.text,
                textDecorationLine: done ? "line-through" : "none"
              }}
            >
              {task.title}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: muted }}>{subtitleFor(task)}</Text>
          </Pressable>
          <Pressable
            onPress={() => setOpen((current) => !current)}
            hitSlop={8}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 100,
              backgroundColor: colors.accentSoft
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: colors.accent }}>
              {open ? "Ocultar" : progress.total ? `${progress.done}/${progress.total}` : "Passos"}
            </Text>
          </Pressable>
          {task.priority === "high" ? (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning }} />
          ) : null}
        </View>
        {open ? <TaskStepTree task={task} onChange={onChange} /> : null}
      </View>
    </FadeOnComplete>
  );
}
