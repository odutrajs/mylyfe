import type {
  RoutineCalendarEvent,
  RoutineCalendarLink,
  RoutineContext,
  RoutineContextKind,
  RoutineLocalEvent,
  RoutineModuleState,
  RoutineSettings,
  RoutineSubtask,
  RoutineTask,
  RoutineTaskPriority,
  RoutineTaskStatus
} from "./types.js";

const defaultUpdatedAt = "1970-01-01T00:00:00.000Z";

export const routineContextKindLabels: Record<RoutineContextKind, string> = {
  work: "Trabalho",
  project: "Projeto",
  personal: "Vida pessoal",
  other: "Outro"
};

export const routineTaskStatusLabels: Record<RoutineTaskStatus, string> = {
  inbox: "Inbox",
  todo: "A fazer",
  doing: "Em andamento",
  done: "Feito",
  waiting: "Aguardando"
};

export const routineTaskPriorityLabels: Record<RoutineTaskPriority, string> = {
  none: "Sem prioridade",
  low: "Baixa",
  medium: "Media",
  high: "Alta"
};

export const defaultRoutineSettings = (): RoutineSettings => ({
  timezone: "America/Sao_Paulo",
  dayStartHour: 8
});

export const defaultRoutineContexts = (): RoutineContext[] => [
  {
    id: "context-work",
    name: "Trabalhos",
    kind: "work",
    color: "#2563eb",
    sortOrder: 0,
    calendarIds: []
  },
  {
    id: "context-projects",
    name: "Projetos pessoais",
    kind: "project",
    color: "#9333ea",
    sortOrder: 1,
    calendarIds: []
  },
  {
    id: "context-personal",
    name: "Vida pessoal",
    kind: "personal",
    color: "#0f766e",
    sortOrder: 2,
    calendarIds: []
  },
  {
    id: "context-health",
    name: "Saude",
    kind: "personal",
    color: "#dc2626",
    sortOrder: 3,
    calendarIds: []
  }
];

export const HEALTH_CONTEXT_ID = "context-health";
export const LOCAL_CALENDAR_CONNECTION_ID = "local";

export const defaultRoutineModuleState = (): RoutineModuleState => ({
  settings: defaultRoutineSettings(),
  contexts: defaultRoutineContexts(),
  tasks: [],
  calendarLinks: [],
  localEvents: [],
  updatedAt: defaultUpdatedAt
});

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const clampHour = (value: unknown) => {
  const hour = Number(value);
  if (!Number.isFinite(hour)) return 8;
  return Math.min(23, Math.max(0, Math.round(hour)));
};

export const canNestRoutineContexts = (kind: RoutineContextKind) => kind === "work" || kind === "project";

const normalizeContext = (context: Partial<RoutineContext>, index: number): RoutineContext => {
  const id = asString(context.id) || `context-${index + 1}`;
  const kind =
    context.kind === "work" || context.kind === "project" || context.kind === "personal" || context.kind === "other" ? context.kind : "other";
  const parentId = asString(context.parentId);
  return {
    id,
    name: asString(context.name).trim() || `Contexto ${index + 1}`,
    kind,
    color: asString(context.color) || "#64748b",
    sortOrder: Number.isFinite(context.sortOrder) ? Number(context.sortOrder) : index,
    calendarIds: Array.isArray(context.calendarIds) ? context.calendarIds.filter((item): item is string => typeof item === "string") : [],
    parentId: parentId && parentId !== id && canNestRoutineContexts(kind) ? parentId : undefined
  };
};

const resolveContextTree = (contexts: RoutineContext[]) => {
  const byId = new Map(contexts.map((context) => [context.id, context]));
  return contexts.map((context) => {
    const parent = context.parentId ? byId.get(context.parentId) : undefined;
    if (!parent || parent.parentId || !canNestRoutineContexts(parent.kind)) {
      return { ...context, parentId: undefined };
    }
    return { ...context, kind: parent.kind, parentId: parent.id };
  });
};

export const rootRoutineContexts = (contexts: RoutineContext[]) => contexts.filter((context) => !context.parentId);

export const childRoutineContexts = (contexts: RoutineContext[], parentId: string) =>
  contexts
    .filter((context) => context.parentId === parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));

export const routineContextLabel = (contexts: RoutineContext[], contextId?: string) => {
  const context = contexts.find((item) => item.id === contextId);
  if (!context) return "";
  const parent = context.parentId ? contexts.find((item) => item.id === context.parentId) : undefined;
  return parent ? `${parent.name} / ${context.name}` : context.name;
};

export const routineContextIds = (contexts: RoutineContext[], contextId: string) => [
  contextId,
  ...childRoutineContexts(contexts, contextId).map((context) => context.id)
];

const normalizeLeaf = (subtask: Partial<RoutineSubtask>, index: number): RoutineSubtask => ({
  id: asString(subtask.id) || `subtask-${index + 1}`,
  title: asString(subtask.title).trim(),
  done: Boolean(subtask.done),
  children: []
});

const normalizeSubtask = (subtask: Partial<RoutineSubtask>, index: number): RoutineSubtask => {
  const children = (subtask.children ?? []).map(normalizeLeaf).filter((child) => child.title);
  return {
    id: asString(subtask.id) || `subtask-${index + 1}`,
    title: asString(subtask.title).trim(),
    done: children.length ? children.every((child) => child.done) : Boolean(subtask.done),
    children
  };
};

export const createRoutineSubtask = (id: string, title: string): RoutineSubtask => ({
  id,
  title,
  done: false,
  children: []
});

const childrenOf = (step: RoutineSubtask) => step.children ?? [];

const withSyncedStepDone = (step: RoutineSubtask): RoutineSubtask => {
  const children = childrenOf(step);
  return children.length ? { ...step, children, done: children.every((child) => child.done) } : { ...step, children };
};

export const toggleRoutineStepDone = (step: RoutineSubtask, done = !step.done): RoutineSubtask => {
  const children = childrenOf(step);
  if (!children.length) return { ...step, done, children };
  return {
    ...step,
    done,
    children: children.map((child) => ({ ...child, done, children: [] }))
  };
};

export const toggleRoutineStepChild = (step: RoutineSubtask, childId: string): RoutineSubtask =>
  withSyncedStepDone({
    ...step,
    children: childrenOf(step).map((child) => (child.id === childId ? { ...child, done: !child.done, children: [] } : child))
  });

export const addRoutineStepChild = (step: RoutineSubtask, title: string, id: string): RoutineSubtask =>
  withSyncedStepDone({
    ...step,
    children: [...childrenOf(step), createRoutineSubtask(id, title)]
  });

export const removeRoutineStepChild = (step: RoutineSubtask, childId: string): RoutineSubtask =>
  withSyncedStepDone({
    ...step,
    children: childrenOf(step).filter((child) => child.id !== childId)
  });

const stepLeaves = (step: RoutineSubtask) => (childrenOf(step).length ? childrenOf(step) : [step]);

export const stepLeafProgress = (step: RoutineSubtask) => {
  const leaves = stepLeaves(step);
  const total = leaves.length;
  const done = leaves.filter((item) => item.done).length;
  return {
    total,
    done,
    ratio: total ? done / total : 0
  };
};

const normalizeTaskStatus = (status: unknown): RoutineTaskStatus =>
  status === "inbox" || status === "todo" || status === "doing" || status === "done" || status === "waiting" ? status : "todo";

const normalizeTaskPriority = (priority: unknown): RoutineTaskPriority =>
  priority === "low" || priority === "medium" || priority === "high" || priority === "none" ? priority : "none";

const optionalDay = (value: unknown) => {
  const day = asString(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
};

const normalizeTask = (task: Partial<RoutineTask>, index: number): RoutineTask => {
  const createdAt = asString(task.createdAt) || defaultUpdatedAt;
  return {
    id: asString(task.id) || `task-${index + 1}`,
    contextId: asString(task.contextId) || undefined,
    title: asString(task.title).trim(),
    notes: asString(task.notes) || undefined,
    status: normalizeTaskStatus(task.status),
    priority: normalizeTaskPriority(task.priority),
    dueDate: optionalDay(task.dueDate),
    scheduledDate: optionalDay(task.scheduledDate),
    focusToday: Boolean(task.focusToday),
    waitingFor: asString(task.waitingFor) || undefined,
    subtasks: (task.subtasks ?? []).map(normalizeSubtask).filter((subtask) => subtask.title),
    createdAt,
    updatedAt: asString(task.updatedAt) || createdAt
  };
};

const normalizeCalendarLink = (link: Partial<RoutineCalendarLink>, index: number): RoutineCalendarLink => ({
  id: asString(link.id) || `calendar-link-${index + 1}`,
  connectionId: asString(link.connectionId),
  externalCalendarId: asString(link.externalCalendarId),
  name: asString(link.name).trim() || "Calendario",
  color: asString(link.color) || "#64748b",
  enabled: link.enabled !== false,
  contextId: asString(link.contextId) || undefined
});

const normalizeLocalEvent = (event: Partial<RoutineLocalEvent>, index: number): RoutineLocalEvent => ({
  id: asString(event.id) || `local-event-${index + 1}`,
  source: event.source === "health" || event.source === "manual" ? event.source : "manual",
  title: asString(event.title).trim(),
  start: asString(event.start),
  end: asString(event.end) || asString(event.start),
  allDay: Boolean(event.allDay),
  location: asString(event.location) || undefined,
  notes: asString(event.notes) || undefined,
  contextId: asString(event.contextId) || undefined,
  healthAppointmentId: asString(event.healthAppointmentId) || undefined,
  status: asString(event.status) || undefined
});

export const normalizeRoutineModuleState = (state?: Partial<RoutineModuleState> | null): RoutineModuleState => {
  const defaults = defaultRoutineModuleState();
  const incoming = resolveContextTree((state?.contexts ?? []).map(normalizeContext));
  const knownIds = new Set(incoming.map((context) => context.id));
  const contexts = [...incoming, ...defaultRoutineContexts().filter((context) => !knownIds.has(context.id))];
  return {
    settings: {
      ...defaults.settings,
      ...state?.settings,
      timezone: asString(state?.settings?.timezone) || defaults.settings.timezone,
      dayStartHour: clampHour(state?.settings?.dayStartHour ?? defaults.settings.dayStartHour)
    },
    contexts: contexts.length ? contexts.sort((left, right) => left.sortOrder - right.sortOrder) : defaults.contexts,
    tasks: (state?.tasks ?? []).map(normalizeTask).filter((task) => task.title),
    calendarLinks: (state?.calendarLinks ?? []).map(normalizeCalendarLink).filter((link) => link.connectionId && link.externalCalendarId),
    localEvents: (state?.localEvents ?? []).map(normalizeLocalEvent).filter((event) => event.title && event.start),
    updatedAt: asString(state?.updatedAt) || defaults.updatedAt
  };
};

export const mergeRoutineLocalEvents = (
  primary: RoutineLocalEvent[] = [],
  secondary: RoutineLocalEvent[] = []
): RoutineLocalEvent[] => {
  const byId = new Map<string, RoutineLocalEvent>();
  for (const event of secondary) {
    if (event.id && event.title && event.start) byId.set(event.id, event);
  }
  for (const event of primary) {
    if (event.id && event.title && event.start) byId.set(event.id, event);
  }
  return [...byId.values()];
};

export const createRoutineLocalEventId = (now = new Date()) =>
  `local-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const upsertRoutineLocalEvent = (
  state: RoutineModuleState | undefined,
  input: Partial<RoutineLocalEvent> & { title: string; start: string },
  now = new Date()
) => {
  const routine = normalizeRoutineModuleState(state);
  const id = asString(input.id) || createRoutineLocalEventId(now);
  const next = normalizeLocalEvent(
    {
      ...routine.localEvents.find((event) => event.id === id),
      ...input,
      id,
      source: input.source === "health" ? "health" : "manual"
    },
    routine.localEvents.length
  );
  return {
    ...routine,
    localEvents: routine.localEvents.some((event) => event.id === next.id)
      ? routine.localEvents.map((event) => (event.id === next.id ? next : event))
      : [...routine.localEvents, next],
    updatedAt: now.toISOString()
  };
};

export const toAgendaEvent = (event: RoutineLocalEvent): RoutineCalendarEvent => ({
  id: event.id,
  connectionId: LOCAL_CALENDAR_CONNECTION_ID,
  calendarId: event.source,
  contextId: event.contextId,
  title: event.title,
  start: event.start,
  end: event.end,
  allDay: event.allDay,
  location: event.location,
  status: event.status
});

export const mergeAgendaEvents = (remote: RoutineCalendarEvent[], local: RoutineLocalEvent[] = []) => [
  ...remote,
  ...local.map(toAgendaEvent)
];

export const pickRoutineModuleState = (
  incoming?: Partial<RoutineModuleState> | null,
  existing?: Partial<RoutineModuleState> | null
) => {
  if (!incoming) return normalizeRoutineModuleState(existing);
  if (!existing) return normalizeRoutineModuleState(incoming);

  const incomingTime = Date.parse(incoming.updatedAt ?? "") || 0;
  const existingTime = Date.parse(existing.updatedAt ?? "") || 0;
  return normalizeRoutineModuleState(incomingTime >= existingTime ? incoming : existing);
};

export const zonedDayKey = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);

export const taskSubtaskProgress = (task: RoutineTask) => {
  const leaves = task.subtasks.flatMap(stepLeaves);
  const total = leaves.length;
  const done = leaves.filter((item) => item.done).length;
  return {
    total,
    done,
    ratio: total ? done / total : 0,
    nested: task.subtasks.some((step) => childrenOf(step).length > 0)
  };
};

const isActiveTask = (task: RoutineTask) => task.status !== "done";

export const isTaskForDay = (task: RoutineTask, dayKey: string) =>
  task.scheduledDate === dayKey || task.dueDate === dayKey || (task.focusToday && isActiveTask(task));

export interface RoutineDayCapacity {
  meetingMinutes: number;
  freeMinutes: number;
  windowMinutes: number;
  meetingHours: number;
  freeHours: number;
  busyRatio: number;
}

const zonedParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute")
  };
};

const tzOffsetMs = (date: Date, timeZone: string) => {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  return asUtc - date.getTime();
};

const zonedDateTime = (timeZone: string, year: number, month: number, day: number, hour = 0, minute = 0) => {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = new Date(utcGuess - tzOffsetMs(new Date(utcGuess), timeZone));
  return new Date(utcGuess - tzOffsetMs(first, timeZone));
};

const parseDayKey = (dayKey: string) => {
  const [year, month, day] = dayKey.split("-").map(Number);
  return {
    year: year || 1970,
    month: month || 1,
    day: day || 1
  };
};

const padDayPart = (value: number) => String(value).padStart(2, "0");

export const addDaysToKey = (dayKey: string, days: number) => {
  const { year, month, day } = parseDayKey(dayKey);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${padDayPart(date.getUTCMonth() + 1)}-${padDayPart(date.getUTCDate())}`;
};

export const weekdayFromKey = (dayKey: string) => {
  const { year, month, day } = parseDayKey(dayKey);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
};

export const weekDayKeys = (dayKey: string, weekStartsOn = 1) => {
  const offset = (weekdayFromKey(dayKey) - weekStartsOn + 7) % 7;
  return Array.from({ length: 7 }, (_, index) => addDaysToKey(dayKey, index - offset));
};

export const monthGridKeys = (dayKey: string, weekStartsOn = 1) => {
  const { year, month } = parseDayKey(dayKey);
  const first = `${year}-${padDayPart(month)}-01`;
  const start = weekDayKeys(first, weekStartsOn)[0] ?? first;
  return Array.from({ length: 42 }, (_, index) => addDaysToKey(start, index));
};

export const zonedClock = (iso: string, timeZone: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { hour: 0, minute: 0 };
  const parts = zonedParts(new Date(iso), timeZone);
  return { hour: parts.hour, minute: parts.minute };
};

const mergeIntervals = (intervals: Array<{ start: number; end: number }>) => {
  const sorted = [...intervals].filter((item) => item.end > item.start).sort((left, right) => left.start - right.start);
  const merged: Array<{ start: number; end: number }> = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push({ ...interval });
      continue;
    }
    last.end = Math.max(last.end, interval.end);
  }

  return merged;
};

export const computeDayCapacity = (
  events: RoutineCalendarEvent[],
  dayKey: string,
  timeZone: string,
  dayStartHour = 8,
  dayEndHour = 22
): RoutineDayCapacity => {
  const { year, month, day } = parseDayKey(dayKey);
  const windowStart = zonedDateTime(timeZone, year, month, day, dayStartHour).getTime();
  const windowEnd = zonedDateTime(timeZone, year, month, day, dayEndHour).getTime();
  const windowMinutes = Math.max(0, Math.round((windowEnd - windowStart) / 60000));

  const intervals = events
    .filter((event) => !event.allDay && event.status !== "cancelled")
    .map((event) => ({
      start: Math.max(windowStart, Date.parse(event.start) || 0),
      end: Math.min(windowEnd, Date.parse(event.end) || 0)
    }));

  const meetingMinutes = mergeIntervals(intervals).reduce((sum, interval) => sum + Math.round((interval.end - interval.start) / 60000), 0);
  const freeMinutes = Math.max(0, windowMinutes - meetingMinutes);

  return {
    meetingMinutes,
    freeMinutes,
    windowMinutes,
    meetingHours: Number((meetingMinutes / 60).toFixed(1)),
    freeHours: Number((freeMinutes / 60).toFixed(1)),
    busyRatio: windowMinutes ? meetingMinutes / windowMinutes : 0
  };
};

export const eventsForDay = (events: RoutineCalendarEvent[], dayKey: string, timeZone: string) =>
  events
    .filter((event) => event.status !== "cancelled")
    .filter((event) => {
      const startKey = event.allDay && /^\d{4}-\d{2}-\d{2}$/.test(event.start) ? event.start : zonedDayKey(new Date(event.start), timeZone);
      return startKey === dayKey;
    })
    .sort((left, right) => left.start.localeCompare(right.start));

const sortTasks = (left: RoutineTask, right: RoutineTask) => {
  const priorityRank: Record<RoutineTaskPriority, number> = { high: 0, medium: 1, low: 2, none: 3 };
  if (left.focusToday !== right.focusToday) return left.focusToday ? -1 : 1;
  if (priorityRank[left.priority] !== priorityRank[right.priority]) return priorityRank[left.priority] - priorityRank[right.priority];
  return (left.dueDate ?? left.scheduledDate ?? left.title).localeCompare(right.dueDate ?? right.scheduledDate ?? right.title);
};

export interface RoutineContextBriefing {
  context: RoutineContext;
  focus: RoutineTask[];
  tasks: RoutineTask[];
  waiting: RoutineTask[];
  events: RoutineCalendarEvent[];
  children: RoutineContextBriefing[];
}

export interface RoutineDailyBriefing {
  dayKey: string;
  timezone: string;
  contexts: RoutineContextBriefing[];
  inbox: RoutineTask[];
  waiting: RoutineTask[];
  unassigned: RoutineTask[];
  events: RoutineCalendarEvent[];
  capacity: RoutineDayCapacity;
}

const eventContextId = (event: RoutineCalendarEvent, links: RoutineCalendarLink[]) =>
  event.contextId ||
  links.find((link) => link.connectionId === event.connectionId && link.externalCalendarId === event.calendarId)?.contextId;

export const buildDailyBriefing = (
  state: RoutineModuleState,
  events: RoutineCalendarEvent[],
  now = new Date()
): RoutineDailyBriefing => {
  const normalized = normalizeRoutineModuleState(state);
  const dayKey = zonedDayKey(now, normalized.settings.timezone);
  const dayEvents = eventsForDay(events, dayKey, normalized.settings.timezone);
  const inbox = normalized.tasks.filter((task) => task.status === "inbox").sort(sortTasks);
  const waiting = normalized.tasks.filter((task) => task.status === "waiting").sort(sortTasks);
  const briefContext = (context: RoutineContext): RoutineContextBriefing => {
    const contextTasks = normalized.tasks.filter((task) => task.contextId === context.id && isTaskForDay(task, dayKey) && task.status !== "inbox");
    return {
      context,
      focus: contextTasks.filter((task) => task.focusToday && isActiveTask(task)).sort(sortTasks),
      tasks: contextTasks.filter((task) => task.status !== "waiting").sort(sortTasks),
      waiting: contextTasks.filter((task) => task.status === "waiting").sort(sortTasks),
      events: dayEvents.filter((event) => eventContextId(event, normalized.calendarLinks) === context.id),
      children: childRoutineContexts(normalized.contexts, context.id).map(briefContext)
    };
  };
  const contexts = rootRoutineContexts(normalized.contexts).map(briefContext);

  return {
    dayKey,
    timezone: normalized.settings.timezone,
    contexts,
    inbox,
    waiting,
    unassigned: normalized.tasks.filter((task) => !task.contextId && task.status !== "inbox" && isTaskForDay(task, dayKey)).sort(sortTasks),
    events: dayEvents,
    capacity: computeDayCapacity(dayEvents, dayKey, normalized.settings.timezone, normalized.settings.dayStartHour)
  };
};

export const groupEventsByDay = (events: RoutineCalendarEvent[], timeZone: string) => {
  const groups = new Map<string, RoutineCalendarEvent[]>();
  for (const event of events.filter((item) => item.status !== "cancelled")) {
    const key = event.allDay && /^\d{4}-\d{2}-\d{2}$/.test(event.start) ? event.start : zonedDayKey(new Date(event.start), timeZone);
    const current = groups.get(key) ?? [];
    current.push(event);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayKey, dayEvents]) => ({
      dayKey,
      events: dayEvents.sort((left, right) => left.start.localeCompare(right.start))
    }));
};

export const upcomingTasks = (tasks: RoutineTask[], dayKey: string) =>
  tasks
    .filter((task) => isActiveTask(task) && task.status !== "inbox" && task.status !== "waiting")
    .filter((task) => {
      const date = task.dueDate ?? task.scheduledDate;
      return Boolean(date && date > dayKey);
    })
    .sort(sortTasks);

export const backlogTasks = (tasks: RoutineTask[], dayKey: string) =>
  tasks
    .filter((task) => isActiveTask(task) && task.status !== "inbox" && task.status !== "waiting")
    .filter((task) => !isTaskForDay(task, dayKey) && !(task.dueDate && task.dueDate > dayKey) && !(task.scheduledDate && task.scheduledDate > dayKey))
    .sort(sortTasks);
