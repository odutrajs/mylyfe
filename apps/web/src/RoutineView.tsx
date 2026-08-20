import {
  addRoutineStepChild,
  backlogTasks,
  canNestRoutineContexts,
  childRoutineContexts,
  createRoutineSubtask,
  mergeAgendaEvents,
  normalizeRoutineModuleState,
  removeRoutineStepChild,
  rootRoutineContexts,
  routineContextIds,
  routineContextKindLabels,
  routineTaskStatusLabels,
  stepLeafProgress,
  taskSubtaskProgress,
  toggleRoutineStepChild,
  toggleRoutineStepDone,
  upcomingTasks,
  zonedDayKey,
  type FinancePlan,
  type RoutineCalendarEvent,
  type RoutineCalendarLink,
  type RoutineContext,
  type RoutineContextKind,
  type RoutineModuleState,
  type RoutineSubtask,
  type RoutineTask,
  type RoutineTaskPriority,
  type RoutineTaskStatus
} from "@mylyfe/domain";
import {
  CalendarClock,
  Check,
  Inbox,
  Layers,
  Link2,
  ListTodo,
  Plus,
  RefreshCw,
  Star,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { accountColor, RoutineCalendarBoard } from "./RoutineCalendar";
import { apiRequest, uid } from "./lib";

export type RoutineSection = "agenda" | "tasks" | "contexts" | "calendars";

type RoutineConnection = {
  id: string;
  provider?: "google" | "microsoft";
  accountEmail: string;
  calendars: Array<{ externalId: string; name: string; color: string; primary?: boolean }>;
  lastSyncAt?: string;
  lastSyncError?: string;
};

type TaskFilter = "inbox" | "today" | "upcoming" | "waiting" | "backlog";

const timezoneOptions = [
  { value: "America/Sao_Paulo", label: "Brasilia / Sao Paulo" },
  { value: "America/Fortaleza", label: "Fortaleza" },
  { value: "America/Recife", label: "Recife" },
  { value: "America/Manaus", label: "Manaus" },
  { value: "America/Belem", label: "Belem" },
  { value: "America/Rio_Branco", label: "Rio Branco" }
];

const kindOptions: Array<{ value: RoutineContextKind; label: string }> = [
  { value: "work", label: "Trabalho" },
  { value: "project", label: "Projeto" },
  { value: "personal", label: "Vida pessoal" },
  { value: "other", label: "Outro" }
];

const statusOptions: Array<{ value: RoutineTaskStatus; label: string }> = [
  { value: "inbox", label: "Inbox" },
  { value: "todo", label: "A fazer" },
  { value: "doing", label: "Em andamento" },
  { value: "done", label: "Feito" },
  { value: "waiting", label: "Aguardando" }
];

const priorityOptions: Array<{ value: RoutineTaskPriority; label: string }> = [
  { value: "none", label: "Sem prioridade" },
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" }
];

const formatWhen = (iso?: string) => {
  if (!iso) return "Nunca";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
};

const emptyContext = (parent?: RoutineContext): Omit<RoutineContext, "id"> => ({
  name: "",
  kind: parent?.kind ?? "work",
  color: parent?.color ?? "#2563eb",
  sortOrder: 0,
  calendarIds: [],
  parentId: parent?.id
});

const lockedContextIds = new Set(["context-work", "context-projects", "context-personal", "context-health"]);

const ContextOptions = ({ contexts }: { contexts: RoutineContext[] }) => (
  <>
    {rootRoutineContexts(contexts).map((root) => {
      const children = childRoutineContexts(contexts, root.id);
      if (!children.length) {
        return (
          <option key={root.id} value={root.id}>
            {root.name}
          </option>
        );
      }
      return (
        <optgroup key={root.id} label={root.name}>
          <option value={root.id}>{root.name}</option>
          {children.map((child) => (
            <option key={child.id} value={child.id}>
              {child.name}
            </option>
          ))}
        </optgroup>
      );
    })}
  </>
);

const touch = (state: RoutineModuleState): RoutineModuleState =>
  normalizeRoutineModuleState({
    ...state,
    updatedAt: new Date().toISOString()
  });

export function RoutineView({
  plan,
  setPlan,
  section
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  section: RoutineSection;
}) {
  const routine = useMemo(() => normalizeRoutineModuleState(plan.routine), [plan.routine]);
  const [capture, setCapture] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("today");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [contextDraft, setContextDraft] = useState(emptyContext);
  const [editingContextId, setEditingContextId] = useState<string | null>(null);
  const [connections, setConnections] = useState<RoutineConnection[]>([]);
  const [events, setEvents] = useState<RoutineCalendarEvent[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | undefined>();
  const [googleConfigured, setGoogleConfigured] = useState(true);
  const [microsoftConfigured, setMicrosoftConfigured] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [agendaFilter, setAgendaFilter] = useState("all");
  const [calendarMode, setCalendarMode] = useState<"week" | "month">("week");
  const [calendarCursor, setCalendarCursor] = useState("");
  const [captureContextId, setCaptureContextId] = useState("");

  const applyRoutine = (next: RoutineModuleState) => {
    const normalized = touch(next);
    setPlan((current) => (current ? { ...current, routine: normalized } : current));
    return normalized;
  };

  const loadCalendarSnapshot = async () => {
    const response = await apiRequest(`/plans/${plan.id}/routine`);
    if (!response.ok) throw new Error("Nao foi possivel carregar a agenda.");
    const payload = (await response.json()) as RoutineModuleState & {
      connections?: RoutineConnection[];
      events?: RoutineCalendarEvent[];
      syncedAt?: string;
      googleConfigured?: boolean;
      microsoftConfigured?: boolean;
    };
    setConnections(payload.connections ?? []);
    setEvents(payload.events ?? []);
    setSyncedAt(payload.syncedAt);
    setGoogleConfigured(payload.googleConfigured !== false);
    setMicrosoftConfigured(payload.microsoftConfigured !== false);
    setPlan((current) => {
      if (!current) return current;
      if (payload.updatedAt && current.routine?.updatedAt === payload.updatedAt) return current;
      return {
        ...current,
        routine: normalizeRoutineModuleState({
          ...current.routine,
          calendarLinks: payload.calendarLinks ?? current.routine.calendarLinks,
          localEvents: payload.localEvents ?? current.routine.localEvents,
          settings: payload.settings ?? current.routine.settings,
          updatedAt: payload.updatedAt ?? current.routine.updatedAt
        })
      };
    });
  };

  useEffect(() => {
    let active = true;
    loadCalendarSnapshot().catch((error) => {
      if (active) setNotice(error instanceof Error ? error.message : "Falha ao carregar calendarios.");
    });
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") setNotice("Conta Google vinculada. Ative o calendario e associe a um contexto.");
    if (params.get("google") === "error") setNotice(params.get("message") || "Nao foi possivel vincular o Google.");
    if (params.get("microsoft") === "connected") setNotice("Conta Teams/Outlook vinculada. Ative o calendario e associe a um contexto.");
    if (params.get("microsoft") === "error") setNotice(params.get("message") || "Nao foi possivel vincular o Teams.");
    return () => {
      active = false;
    };
  }, [plan.id]);

  const dayKey = zonedDayKey(new Date(), routine.settings.timezone);
  const agendaEvents = useMemo(
    () => mergeAgendaEvents(events, plan.routine?.localEvents ?? []),
    [events, plan.routine?.localEvents]
  );
  const cursor = calendarCursor || dayKey;
  const selectedTask = routine.tasks.find((task) => task.id === selectedTaskId) ?? null;

  const filteredTasks = useMemo(() => {
    if (taskFilter === "inbox") return routine.tasks.filter((task) => task.status === "inbox");
    if (taskFilter === "waiting") return routine.tasks.filter((task) => task.status === "waiting");
    if (taskFilter === "upcoming") return upcomingTasks(routine.tasks, dayKey);
    if (taskFilter === "backlog") return backlogTasks(routine.tasks, dayKey);
    return routine.tasks.filter((task) => task.status !== "inbox" && (task.scheduledDate === dayKey || task.dueDate === dayKey || task.focusToday));
  }, [routine.tasks, taskFilter, dayKey]);

  const filteredAgendaEvents = useMemo(() => {
    if (agendaFilter === "all") return agendaEvents;
    const ids = new Set(routineContextIds(routine.contexts, agendaFilter));
    return agendaEvents.filter((event) => {
      const link = routine.calendarLinks.find(
        (item) => item.connectionId === event.connectionId && item.externalCalendarId === event.calendarId
      );
      const contextId = event.contextId || link?.contextId;
      return contextId ? ids.has(contextId) : false;
    });
  }, [agendaEvents, agendaFilter, routine.calendarLinks, routine.contexts]);

  const calendarTasks = useMemo(() => {
    if (agendaFilter === "all") return routine.tasks;
    const ids = routineContextIds(routine.contexts, agendaFilter);
    return routine.tasks.filter((task) => ids.includes(task.contextId ?? ""));
  }, [agendaFilter, routine.contexts, routine.tasks]);

  const upsertTask = (task: RoutineTask) => {
    applyRoutine({
      ...routine,
      tasks: routine.tasks.some((item) => item.id === task.id)
        ? routine.tasks.map((item) => (item.id === task.id ? task : item))
        : [task, ...routine.tasks]
    });
  };

  const captureTask = (contextId?: string) => {
    const title = capture.trim();
    if (!title) return;
    const assigned = contextId || captureContextId || undefined;
    const createdAt = new Date().toISOString();
    upsertTask({
      id: uid("task"),
      title,
      contextId: assigned,
      status: assigned ? "todo" : "inbox",
      priority: "none",
      scheduledDate: assigned ? dayKey : undefined,
      focusToday: false,
      subtasks: [],
      createdAt,
      updatedAt: createdAt
    });
    setCapture("");
  };

  const removeTask = (taskId: string) => {
    applyRoutine({ ...routine, tasks: routine.tasks.filter((task) => task.id !== taskId) });
    if (selectedTaskId === taskId) setSelectedTaskId(null);
  };

  const toggleDone = (task: RoutineTask) => {
    upsertTask({
      ...task,
      status: task.status === "done" ? "todo" : "done",
      updatedAt: new Date().toISOString()
    });
  };

  const toggleFocus = (task: RoutineTask) => {
    const contextFocus = routine.tasks.filter((item) => item.contextId === task.contextId && item.focusToday && item.status !== "done").length;
    if (!task.focusToday && contextFocus >= 3) {
      setNotice("Cada pessoa fica melhor com no maximo 3 focos por contexto.");
    }
    upsertTask({ ...task, focusToday: !task.focusToday, updatedAt: new Date().toISOString() });
  };

  const saveContext = () => {
    if (!contextDraft.name.trim()) {
      setNotice("Dê um nome ao contexto.");
      return;
    }
    const parent = contextDraft.parentId ? routine.contexts.find((item) => item.id === contextDraft.parentId) : undefined;
    const nextContext: RoutineContext = {
      ...contextDraft,
      id: editingContextId ?? uid("context"),
      name: contextDraft.name.trim(),
      kind: parent?.kind ?? contextDraft.kind,
      parentId: parent && canNestRoutineContexts(parent.kind) ? parent.id : undefined,
      sortOrder: editingContextId ? contextDraft.sortOrder : routine.contexts.length
    };
    applyRoutine({
      ...routine,
      contexts: editingContextId
        ? routine.contexts.map((context) => (context.id === editingContextId ? nextContext : context))
        : [...routine.contexts, nextContext]
    });
    setContextDraft(emptyContext());
    setEditingContextId(null);
    setNotice("");
  };

  const removeContext = (contextId: string) => {
    if (lockedContextIds.has(contextId)) return;
    applyRoutine({
      ...routine,
      contexts: routine.contexts
        .filter((context) => context.id !== contextId)
        .map((context) => (context.parentId === contextId ? { ...context, parentId: undefined } : context)),
      tasks: routine.tasks.map((task) => (task.contextId === contextId ? { ...task, contextId: undefined } : task)),
      calendarLinks: routine.calendarLinks.map((link) => (link.contextId === contextId ? { ...link, contextId: undefined } : link))
    });
  };

  const connectGoogle = async () => {
    setBusy("connect");
    setNotice("");
    try {
      const response = await apiRequest(`/routine/google/connect?planId=${encodeURIComponent(plan.id)}`);
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Nao foi possivel iniciar o Google.");
      window.location.href = payload.url;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao conectar o Google.");
      setBusy("");
    }
  };

  const connectMicrosoft = async () => {
    setBusy("connect-microsoft");
    setNotice("");
    try {
      const response = await apiRequest(`/routine/microsoft/connect?planId=${encodeURIComponent(plan.id)}`);
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Nao foi possivel iniciar o Teams.");
      window.location.href = payload.url;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao conectar o Teams.");
      setBusy("");
    }
  };

  const persistRoutine = async (next = routine) => {
    await apiRequest(`/plans/${plan.id}/routine`, {
      method: "PATCH",
      body: JSON.stringify(next)
    });
  };

  const syncCalendars = async () => {
    setBusy("sync");
    setNotice("");
    try {
      await persistRoutine();
      const response = await apiRequest("/routine/sync", {
        method: "POST",
        body: JSON.stringify({ planId: plan.id })
      });
      const payload = (await response.json()) as {
        events?: RoutineCalendarEvent[];
        syncedAt?: string;
        connections?: RoutineConnection[];
        errors?: string[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Falha no sync.");
      setEvents(payload.events ?? []);
      setSyncedAt(payload.syncedAt);
      setConnections(payload.connections ?? connections);
      if (payload.errors?.length) setNotice(payload.errors.join(" "));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha no sync.");
    } finally {
      setBusy("");
    }
  };

  const disconnectGoogle = async (connectionId: string) => {
    setBusy(connectionId);
    try {
      const response = await apiRequest(`/routine/google/connections/${connectionId}?planId=${encodeURIComponent(plan.id)}`, {
        method: "DELETE"
      });
      if (!response.ok) throw new Error("Nao foi possivel desvincular.");
      applyRoutine({
        ...routine,
        calendarLinks: routine.calendarLinks.filter((link) => link.connectionId !== connectionId)
      });
      setConnections((current) => current.filter((item) => item.id !== connectionId));
      setEvents((current) => current.filter((event) => event.connectionId !== connectionId));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao desvincular.");
    } finally {
      setBusy("");
    }
  };

  const upsertLink = (link: RoutineCalendarLink) => {
    applyRoutine({
      ...routine,
      calendarLinks: routine.calendarLinks.some((item) => item.id === link.id)
        ? routine.calendarLinks.map((item) => (item.id === link.id ? link : item))
        : [...routine.calendarLinks, link]
    });
  };

  const header = (title: string, subtitle: string) => (
    <header className="page-header">
      <span>MyLyfe / Rotina</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );

  if (section === "agenda") {
    return (
      <div className="page">
        {header("Agenda", "Calendario da semana e do mes, com reunioes, tarefas e consultas da Saude no mesmo lugar.")}
        <div className="routine-toolbar">
          <label className="field">
            <span>Contexto</span>
            <select value={agendaFilter} onChange={(event) => setAgendaFilter(event.target.value)}>
              <option value="all">Todos</option>
              <ContextOptions contexts={routine.contexts} />
            </select>
          </label>
          <button className="secondary-button" type="button" onClick={() => void syncCalendars()} disabled={busy === "sync"}>
            <RefreshCw size={16} />
            {busy === "sync" ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
        <p className="panel-note">Ultimo sync: {formatWhen(syncedAt)}</p>
        <RoutineCalendarBoard
          mode={calendarMode}
          cursor={cursor}
          todayKey={dayKey}
          timeZone={routine.settings.timezone}
          dayStartHour={routine.settings.dayStartHour}
          events={filteredAgendaEvents}
          tasks={calendarTasks}
          contexts={routine.contexts}
          links={routine.calendarLinks}
          connections={connections}
          onModeChange={setCalendarMode}
          onCursorChange={setCalendarCursor}
        />
      </div>
    );
  }

  if (section === "tasks") {
    return (
      <div className="page">
        {header("Tarefas", "Inbox, focos, subtarefas e o que esta aguardando retorno.")}
        <div className="routine-capture">
          <input
            value={capture}
            placeholder="Nova tarefa ou captura"
            onChange={(event) => setCapture(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") captureTask();
            }}
          />
          <select
            className="routine-destination"
            value={captureContextId}
            onChange={(event) => setCaptureContextId(event.target.value)}
            aria-label="Onde jogar a tarefa"
          >
            <option value="">Depois eu trio (inbox)</option>
            <ContextOptions contexts={routine.contexts} />
          </select>
          <button className="primary-button" type="button" onClick={() => captureTask()}>
            <Plus size={16} />
            Adicionar
          </button>
        </div>
        <div className="routine-filters">
          {(
            [
              ["inbox", "Inbox"],
              ["today", "Hoje"],
              ["upcoming", "Proximas"],
              ["waiting", "Aguardando"],
              ["backlog", "Backlog"]
            ] as const
          ).map(([value, label]) => (
            <button key={value} className={`secondary-button ${taskFilter === value ? "active" : ""}`} type="button" onClick={() => setTaskFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <section className="panel wide">
          {filteredTasks.length === 0 && <p className="panel-note">Nada nesta lista.</p>}
          {filteredTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              contexts={routine.contexts}
              onToggle={() => toggleDone(task)}
              onFocus={() => toggleFocus(task)}
              onOpen={() => setSelectedTaskId(task.id)}
              onChange={upsertTask}
              onMove={(contextId) =>
                upsertTask({
                  ...task,
                  contextId,
                  status: contextId ? (task.status === "inbox" ? "todo" : task.status) : "inbox",
                  scheduledDate: contextId ? task.scheduledDate ?? dayKey : task.scheduledDate,
                  updatedAt: new Date().toISOString()
                })
              }
            />
          ))}
        </section>
        {selectedTask && (
          <TaskEditor
            task={selectedTask}
            contexts={routine.contexts}
            onClose={() => setSelectedTaskId(null)}
            onChange={upsertTask}
            onDelete={() => removeTask(selectedTask.id)}
          />
        )}
      </div>
    );
  }

  if (section === "contexts") {
    return (
      <div className="page">
        {header("Contextos", "Dentro de Trabalhos e Projetos, crie cada empresa ou iniciativa. Vida pessoal continua simples.")}
        <section className="panel wide">
          <header>
            <div>
              <Layers />
              <h2>{editingContextId ? "Editar" : contextDraft.parentId ? "Novo item" : "Novo contexto"}</h2>
            </div>
          </header>
          <div className="form-grid">
            <label className="field">
              <span>Nome</span>
              <input
                value={contextDraft.name}
                placeholder={contextDraft.kind === "work" ? "Empresa, cliente, freela..." : contextDraft.kind === "project" ? "App, estudo, viagem..." : "Nome"}
                onChange={(event) => setContextDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            {!contextDraft.parentId && (
              <label className="field">
                <span>Tipo</span>
                <select value={contextDraft.kind} onChange={(event) => setContextDraft((current) => ({ ...current, kind: event.target.value as RoutineContextKind, parentId: undefined }))}>
                  {kindOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canNestRoutineContexts(contextDraft.kind) && (
              <label className="field">
                <span>Dentro de</span>
                <select
                  value={contextDraft.parentId ?? ""}
                  onChange={(event) => {
                    const parent = routine.contexts.find((item) => item.id === event.target.value);
                    setContextDraft((current) => ({
                      ...current,
                      parentId: parent?.id,
                      kind: parent?.kind ?? current.kind,
                      color: parent?.color ?? current.color
                    }));
                  }}
                >
                  <option value="">Raiz</option>
                  {rootRoutineContexts(routine.contexts)
                    .filter((context) => canNestRoutineContexts(context.kind))
                    .map((context) => (
                      <option key={context.id} value={context.id}>
                        {context.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="field color-field">
              <span>Cor</span>
              <input type="color" value={contextDraft.color} onChange={(event) => setContextDraft((current) => ({ ...current, color: event.target.value }))} />
            </label>
          </div>
          <div className="routine-toolbar">
            <button className="primary-button" type="button" onClick={saveContext}>
              {editingContextId ? "Salvar" : "Criar"}
            </button>
            {(editingContextId || contextDraft.parentId) && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setEditingContextId(null);
                  setContextDraft(emptyContext());
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </section>
        {rootRoutineContexts(routine.contexts).map((context) => {
          const children = childRoutineContexts(routine.contexts, context.id);
          return (
            <section key={context.id} className="panel wide">
              <header>
                <div>
                  <span className="routine-color-dot" style={{ background: context.color }} />
                  <h2>{context.name}</h2>
                </div>
                <div className="routine-toolbar">
                  {canNestRoutineContexts(context.kind) && (
                    <button className="secondary-button" type="button" onClick={() => setContextDraft(emptyContext(context))}>
                      <Plus size={16} />
                      {context.kind === "work" ? "Trabalho" : "Projeto"}
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setEditingContextId(context.id);
                      setContextDraft(context);
                    }}
                  >
                    Editar
                  </button>
                  {!lockedContextIds.has(context.id) && (
                    <button className="icon-button" type="button" onClick={() => removeContext(context.id)} aria-label="Remover contexto">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </header>
              <p className="panel-note">
                {routineContextKindLabels[context.kind]} · {routine.tasks.filter((task) => task.contextId === context.id && task.status !== "done").length} tarefas aqui
                {children.length ? ` · ${children.length} ${context.kind === "work" ? "trabalhos" : "projetos"}` : ""}
              </p>
              {children.map((child) => (
                <article key={child.id} className="routine-child-row">
                  <span className="routine-color-dot" style={{ background: child.color }} />
                  <div>
                    <strong>{child.name}</strong>
                    <small>
                      {routine.tasks.filter((task) => task.contextId === child.id && task.status !== "done").length} tarefas ·{" "}
                      {routine.calendarLinks.filter((link) => link.contextId === child.id && link.enabled).length} calendarios
                    </small>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setEditingContextId(child.id);
                      setContextDraft(child);
                    }}
                  >
                    Editar
                  </button>
                  <button className="icon-button" type="button" onClick={() => removeContext(child.id)} aria-label="Remover">
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </section>
          );
        })}
        {notice && <p className="panel-note">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="page">
      {header("Calendarios", "Vincule contas Google e Teams/Outlook. Em cada conta, escolha o calendario e o contexto.")}
      {!googleConfigured && (
        <p className="panel-note">
          Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI no ambiente da API. O redirect local e
          http://localhost:3333/api/routine/google/callback.
        </p>
      )}
      {!microsoftConfigured && (
        <p className="panel-note">
          Para o Teams, configure MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET e MICROSOFT_REDIRECT_URI. O redirect local e
          http://localhost:3333/api/routine/microsoft/callback.
        </p>
      )}
      <div className="routine-toolbar">
        <button className="primary-button" type="button" onClick={() => void connectGoogle()} disabled={Boolean(busy)}>
          <Link2 size={16} />
          Vincular conta Google
        </button>
        <button className="secondary-button" type="button" onClick={() => void connectMicrosoft()} disabled={Boolean(busy)}>
          <Link2 size={16} />
          Vincular Teams / Outlook
        </button>
        <button className="secondary-button" type="button" onClick={() => void syncCalendars()} disabled={busy === "sync"}>
          <RefreshCw size={16} />
          {busy === "sync" ? "Sincronizando..." : "Sincronizar agora"}
        </button>
      </div>
      <p className="panel-note">Ultimo sync: {formatWhen(syncedAt)}</p>
      {notice && <p className="panel-note">{notice}</p>}

      <section className="panel wide">
        <header>
          <div>
            <CalendarClock />
            <h2>Fuso e inicio do dia</h2>
          </div>
        </header>
        <div className="form-grid">
          <label className="field">
            <span>Fuso</span>
            <select
              value={routine.settings.timezone}
              onChange={(event) => applyRoutine({ ...routine, settings: { ...routine.settings, timezone: event.target.value } })}
            >
              {timezoneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Comeca o dia as</span>
            <input
              inputMode="numeric"
              value={String(routine.settings.dayStartHour)}
              onChange={(event) =>
                applyRoutine({
                  ...routine,
                  settings: { ...routine.settings, dayStartHour: Number(event.target.value) || 0 }
                })
              }
            />
          </label>
        </div>
      </section>

      {connections.length === 0 && <p className="panel-note">Nenhuma conta vinculada ainda.</p>}
      {connections.map((connection) => (
        <section key={connection.id} className="panel wide">
          <header>
            <div>
              <Link2 />
              <h2>{connection.accountEmail}</h2>
              <small className="routine-provider-tag">{connection.provider === "microsoft" ? "Teams / Outlook" : "Google"}</small>
            </div>
            <button className="secondary-button" type="button" onClick={() => void disconnectGoogle(connection.id)} disabled={busy === connection.id}>
              Desvincular
            </button>
          </header>
          {connection.lastSyncError && <p className="panel-note">{connection.lastSyncError}</p>}
          {(connection.calendars.length ? connection.calendars : routine.calendarLinks.filter((link) => link.connectionId === connection.id)).map((calendar) => {
            const externalId = "externalId" in calendar ? calendar.externalId : calendar.externalCalendarId;
            const link =
              routine.calendarLinks.find((item) => item.connectionId === connection.id && item.externalCalendarId === externalId) ??
              ({
                id: uid("link"),
                connectionId: connection.id,
                externalCalendarId: externalId,
                name: calendar.name,
                color: calendar.color,
                enabled: false
              } satisfies RoutineCalendarLink);
            return (
              <div key={`${connection.id}:${externalId}`} className="routine-calendar-row">
                <span
                  className="routine-color-dot"
                  style={{ background: accountColor(connection.id, connections.map((item) => item.id)) }}
                />
                <strong>{calendar.name}</strong>
                <label className="field">
                  <span>Ativo</span>
                  <select value={link.enabled ? "yes" : "no"} onChange={(event) => upsertLink({ ...link, enabled: event.target.value === "yes" })}>
                    <option value="no">Nao</option>
                    <option value="yes">Sim</option>
                  </select>
                </label>
                <label className="field">
                  <span>Contexto</span>
                  <select value={link.contextId ?? ""} onChange={(event) => upsertLink({ ...link, contextId: event.target.value || undefined })}>
                    <option value="">Sem contexto</option>
                    <ContextOptions contexts={routine.contexts} />
                  </select>
                </label>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function replaceStep(subtasks: RoutineSubtask[], stepId: string, next: RoutineSubtask) {
  return subtasks.map((item) => (item.id === stepId ? next : item));
}

function StepTree({ task, onChange }: { task: RoutineTask; onChange: (task: RoutineTask) => void }) {
  const [stepTitle, setStepTitle] = useState("");
  const [childDrafts, setChildDrafts] = useState<Record<string, string>>({});
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(task.subtasks.filter((step) => (step.children?.length ?? 0) > 0).map((step) => [step.id, true]))
  );

  const commit = (subtasks: RoutineSubtask[]) => onChange({ ...task, subtasks, updatedAt: new Date().toISOString() });

  const addStep = () => {
    const title = stepTitle.trim();
    if (!title) return;
    commit([...task.subtasks, createRoutineSubtask(uid("sub"), title)]);
    setStepTitle("");
  };

  const addChild = (step: RoutineSubtask) => {
    const title = (childDrafts[step.id] ?? "").trim();
    if (!title) return;
    commit(replaceStep(task.subtasks, step.id, addRoutineStepChild(step, title, uid("sub"))));
    setChildDrafts((current) => ({ ...current, [step.id]: "" }));
    setOpenSteps((current) => ({ ...current, [step.id]: true }));
  };

  return (
    <div className="routine-inline-subtasks">
      {task.subtasks.map((step) => {
        const progress = stepLeafProgress(step);
        const hasChildren = (step.children?.length ?? 0) > 0;
        const open = openSteps[step.id] ?? hasChildren;
        return (
          <div key={step.id} className="routine-step">
            <label className="routine-subtask">
              <input
                type="checkbox"
                checked={step.done}
                onChange={() => commit(replaceStep(task.subtasks, step.id, toggleRoutineStepDone(step)))}
              />
              <span className={step.done ? "done" : ""}>
                {step.title}
                {hasChildren ? ` · ${progress.done}/${progress.total}` : ""}
              </span>
              <button
                className="secondary-button"
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  setOpenSteps((current) => ({ ...current, [step.id]: !open }));
                }}
              >
                {open ? "Ocultar tarefinhas" : "Tarefinhas"}
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  commit(task.subtasks.filter((item) => item.id !== step.id));
                }}
                aria-label="Remover passo"
              >
                <Trash2 size={14} />
              </button>
            </label>
            {open && (
              <div className="routine-step-children">
                {(step.children ?? []).map((child) => (
                  <label key={child.id} className="routine-subtask nested">
                    <input
                      type="checkbox"
                      checked={child.done}
                      onChange={() => commit(replaceStep(task.subtasks, step.id, toggleRoutineStepChild(step, child.id)))}
                    />
                    <span className={child.done ? "done" : ""}>{child.title}</span>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        commit(replaceStep(task.subtasks, step.id, removeRoutineStepChild(step, child.id)));
                      }}
                      aria-label="Remover tarefinha"
                    >
                      <Trash2 size={14} />
                    </button>
                  </label>
                ))}
                <div className="routine-capture compact">
                  <input
                    value={childDrafts[step.id] ?? ""}
                    placeholder="Quebrar este passo..."
                    onChange={(event) => setChildDrafts((current) => ({ ...current, [step.id]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addChild(step);
                    }}
                  />
                  <button className="secondary-button" type="button" onClick={() => addChild(step)}>
                    <Plus size={16} />
                    Tarefinha
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div className="routine-capture compact">
        <input
          value={stepTitle}
          placeholder="Quebrar em um passo menor..."
          onChange={(event) => setStepTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addStep();
          }}
        />
        <button className="secondary-button" type="button" onClick={addStep}>
          <Plus size={16} />
          Passo
        </button>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  contexts,
  onToggle,
  onFocus,
  onOpen,
  onMove,
  onChange
}: {
  task: RoutineTask;
  contexts?: RoutineContext[];
  onToggle: () => void;
  onFocus: () => void;
  onOpen: () => void;
  onMove?: (contextId?: string) => void;
  onChange?: (task: RoutineTask) => void;
}) {
  const [open, setOpen] = useState(task.subtasks.length > 0);
  const progress = taskSubtaskProgress(task);

  return (
    <article className={`routine-task-card ${task.status === "done" ? "done" : ""}`}>
      <div className="routine-task-row">
        <button className="icon-button" type="button" onClick={onToggle} aria-label="Concluir">
          <Check size={16} />
        </button>
        <button className="routine-task-main" type="button" onClick={onOpen}>
          <strong>{task.title}</strong>
          <small>
            {routineTaskStatusLabels[task.status]}
            {task.dueDate ? ` · ${task.dueDate}` : ""}
            {progress.total ? ` · ${progress.done}/${progress.total} ${progress.nested ? "itens" : "passos"}` : ""}
            {task.waitingFor ? ` · espera ${task.waitingFor}` : ""}
          </small>
        </button>
        {onMove && contexts && (
          <select
            className="routine-destination"
            value={task.contextId ?? ""}
            onChange={(event) => onMove(event.target.value || undefined)}
            aria-label="Mover tarefa"
          >
            <option value="">Inbox</option>
            <ContextOptions contexts={contexts} />
          </select>
        )}
        {onChange && (
          <button className="secondary-button" type="button" onClick={() => setOpen((current) => !current)}>
            {open ? "Ocultar passos" : "Subtarefas"}
          </button>
        )}
        <button className={`icon-button ${task.focusToday ? "active" : ""}`} type="button" onClick={onFocus} aria-label="Foco">
          <Star size={16} />
        </button>
      </div>
      {open && onChange && <StepTree task={task} onChange={onChange} />}
    </article>
  );
}

function TaskEditor({
  task,
  contexts,
  onChange,
  onClose,
  onDelete
}: {
  task: RoutineTask;
  contexts: RoutineContext[];
  onChange: (task: RoutineTask) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const patch = (partial: Partial<RoutineTask>) => onChange({ ...task, ...partial, updatedAt: new Date().toISOString() });

  return (
    <section className="panel wide">
      <header>
        <div>
          <ListTodo />
          <h2>Detalhe da tarefa</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>
          Fechar
        </button>
      </header>
      <div className="form-grid">
        <label className="field">
          <span>Titulo</span>
          <input value={task.title} onChange={(event) => patch({ title: event.target.value })} />
        </label>
        <label className="field">
          <span>Contexto</span>
          <select value={task.contextId ?? ""} onChange={(event) => patch({ contextId: event.target.value || undefined, status: task.status === "inbox" && event.target.value ? "todo" : task.status })}>
            <option value="">Sem contexto</option>
            <ContextOptions contexts={contexts} />
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={task.status} onChange={(event) => patch({ status: event.target.value as RoutineTaskStatus })}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Prioridade</span>
          <select value={task.priority} onChange={(event) => patch({ priority: event.target.value as RoutineTaskPriority })}>
            {priorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Fazer em</span>
          <input type="date" value={task.scheduledDate ?? ""} onChange={(event) => patch({ scheduledDate: event.target.value || undefined })} />
        </label>
        <label className="field">
          <span>Prazo</span>
          <input type="date" value={task.dueDate ?? ""} onChange={(event) => patch({ dueDate: event.target.value || undefined })} />
        </label>
        <label className="field">
          <span>Aguardando</span>
          <input value={task.waitingFor ?? ""} placeholder="Cliente, entrevista, medico..." onChange={(event) => patch({ waitingFor: event.target.value || undefined })} />
        </label>
      </div>
      <label className="field">
        <span>Notas</span>
        <input value={task.notes ?? ""} onChange={(event) => patch({ notes: event.target.value || undefined })} />
      </label>
      <div className="routine-subtasks">
        <p className="panel-note">Passos e tarefinhas</p>
        <StepTree task={task} onChange={onChange} />
      </div>
      <div className="routine-toolbar">
        <button className="secondary-button" type="button" onClick={onDelete}>
          <Trash2 size={16} />
          Excluir tarefa
        </button>
      </div>
    </section>
  );
}
