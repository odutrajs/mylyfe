import {
  addDaysToKey,
  monthGridKeys,
  routineContextLabel,
  weekDayKeys,
  weekdayFromKey,
  zonedClock,
  zonedDayKey,
  type RoutineCalendarEvent,
  type RoutineCalendarLink,
  type RoutineContext,
  type RoutineTask
} from "@mylyfe/domain";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";

const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
const hourHeight = 68;

const formatDayNumber = (dayKey: string) => String(Number(dayKey.slice(8)));
const monthTitleFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const weekStartFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const weekEndFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

const timeFormatter = (timeZone: string) => {
  const cached = timeFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone });
  timeFormatters.set(timeZone, formatter);
  return formatter;
};

const formatMonthTitle = (dayKey: string) => {
  const [year = 1970, month = 1] = dayKey.split("-").map(Number);
  return monthTitleFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
};

const formatWeekTitle = (days: string[]) => {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return "";
  const [startYear = 1970, startMonth = 1, startDay = 1] = first.split("-").map(Number);
  const [endYear = 1970, endMonth = 1, endDay = 1] = last.split("-").map(Number);
  const start = weekStartFormatter.format(new Date(Date.UTC(startYear, startMonth - 1, startDay)));
  const end = weekEndFormatter.format(new Date(Date.UTC(endYear, endMonth - 1, endDay)));
  return `${start} — ${end}`;
};

const formatTime = (iso: string, timeZone: string, allDay?: boolean) => {
  if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Dia inteiro";
  return timeFormatter(timeZone).format(new Date(iso));
};

const eventsByDayKey = (events: RoutineCalendarEvent[], timeZone: string) => {
  const map = new Map<string, RoutineCalendarEvent[]>();
  for (const event of events) {
    if (event.status === "cancelled") continue;
    const startKey = event.allDay && /^\d{4}-\d{2}-\d{2}$/.test(event.start) ? event.start : zonedDayKey(new Date(event.start), timeZone);
    const bucket = map.get(startKey);
    if (bucket) bucket.push(event);
    else map.set(startKey, [event]);
  }
  for (const bucket of map.values()) {
    bucket.sort((left, right) => left.start.localeCompare(right.start));
  }
  return map;
};

const parseHex = (hex: string) => {
  const raw = hex.replace("#", "");
  const value = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw.padEnd(6, "0");
  return {
    r: Number.parseInt(value.slice(0, 2), 16) || 100,
    g: Number.parseInt(value.slice(2, 4), 16) || 116,
    b: Number.parseInt(value.slice(4, 6), 16) || 139
  };
};

const eventTone = (hex?: string) => {
  const { r, g, b } = parseHex(hex || "#64748b");
  const rail = (value: number) => Math.round(value * 0.72);
  return {
    accent: `rgb(${rail(r)}, ${rail(g)}, ${rail(b)})`,
    background: `rgba(${r}, ${g}, ${b}, 0.18)`,
    border: `rgba(${r}, ${g}, ${b}, 0.26)`,
    text: "#18221c"
  };
};

const ACCOUNT_PALETTE = ["#2563eb", "#0d9488", "#ea580c", "#7c3aed", "#db2777", "#0369a1"];

export const accountColor = (connectionId: string, connectionIds: string[]) => {
  const index = connectionIds.indexOf(connectionId);
  return ACCOUNT_PALETTE[(index < 0 ? 0 : index) % ACCOUNT_PALETTE.length] ?? ACCOUNT_PALETTE[0] ?? "#2563eb";
};

type EventLookups = {
  contexts: RoutineContext[];
  contextById: Map<string, RoutineContext>;
  linkByKey: Map<string, RoutineCalendarLink>;
  accountById: Map<string, string>;
  connectionIds: string[];
};

const eventMeta = (event: RoutineCalendarEvent, lookups: EventLookups) => {
  const link = lookups.linkByKey.get(`${event.connectionId}:${event.calendarId}`);
  const contextId = event.contextId || link?.contextId;
  const context = contextId ? lookups.contextById.get(contextId) : undefined;
  const parent = context?.parentId ? lookups.contextById.get(context.parentId) : undefined;
  const account = event.connectionId ? lookups.accountById.get(event.connectionId) : undefined;
  const fromAccount = Boolean(account);
  const color = fromAccount
    ? accountColor(event.connectionId ?? "", lookups.connectionIds)
    : context?.color || link?.color || "#dc2626";
  return {
    color,
    label: routineContextLabel(lookups.contexts, contextId) || link?.name || "Agenda",
    shortLabel: context?.parentId ? context.name : link?.name || context?.name || "Agenda",
    parentLabel: parent?.name,
    account,
    calendarName: link?.name
  };
};

const minutesOf = (iso: string, timeZone: string) => {
  const clock = zonedClock(iso, timeZone);
  return clock.hour * 60 + clock.minute;
};

const placeEvents = (events: RoutineCalendarEvent[], timeZone: string, dayStartHour: number, dayEndHour: number) => {
  const prepared = events
    .map((event) => {
      const startMin = Math.max(minutesOf(event.start, timeZone), dayStartHour * 60);
      const rawEnd = minutesOf(event.end, timeZone);
      const endMin = Math.min(rawEnd <= startMin ? startMin + 30 : rawEnd, dayEndHour * 60);
      return { event, startMin, endMin, col: 0, cols: 1 };
    })
    .sort((left, right) => left.startMin - right.startMin || left.endMin - right.endMin);

  for (let index = 0; index < prepared.length; index += 1) {
    const current = prepared[index];
    if (!current) continue;
    const taken = new Set(
      prepared.filter((item, other) => other !== index && item.startMin < current.endMin && item.endMin > current.startMin).map((item) => item.col)
    );
    let col = 0;
    while (taken.has(col)) col += 1;
    current.col = col;
  }

  for (const current of prepared) {
    const cluster = prepared.filter((item) => item.startMin < current.endMin && item.endMin > current.startMin);
    current.cols = Math.max(1, ...cluster.map((item) => item.col + 1));
  }

  return prepared.map((item) => ({
    ...item,
    top: ((item.startMin - dayStartHour * 60) / 60) * hourHeight,
    height: Math.max(((item.endMin - item.startMin) / 60) * hourHeight, 28)
  }));
};

export function RoutineCalendarBoard({
  mode,
  cursor,
  todayKey,
  timeZone,
  dayStartHour,
  events,
  tasks,
  contexts,
  links,
  connections = [],
  onModeChange,
  onCursorChange
}: {
  mode: "week" | "month";
  cursor: string;
  todayKey: string;
  timeZone: string;
  dayStartHour: number;
  events: RoutineCalendarEvent[];
  tasks: RoutineTask[];
  contexts: RoutineContext[];
  links: RoutineCalendarLink[];
  connections?: Array<{ id: string; accountEmail: string }>;
  onModeChange: (mode: "week" | "month") => void;
  onCursorChange: (dayKey: string) => void;
}) {
  const week = useMemo(() => weekDayKeys(cursor), [cursor]);
  const month = useMemo(() => (mode === "month" ? monthGridKeys(cursor) : []), [mode, cursor]);
  const hours = useMemo(
    () => Array.from({ length: Math.max(1, 22 - dayStartHour) }, (_, index) => dayStartHour + index),
    [dayStartHour]
  );
  const shift = mode === "week" ? 7 : 30;
  const now = zonedClock(new Date().toISOString(), timeZone);
  const nowTop = ((now.hour * 60 + now.minute - dayStartHour * 60) / 60) * hourHeight;
  const showNow = now.hour >= dayStartHour && now.hour < 22;
  const eventsByDay = useMemo(() => eventsByDayKey(events, timeZone), [events, timeZone]);
  const lookups = useMemo<EventLookups>(() => {
    const connectionIds = connections.map((item) => item.id);
    return {
      contexts,
      contextById: new Map(contexts.map((context) => [context.id, context])),
      linkByKey: new Map(links.map((link) => [`${link.connectionId}:${link.externalCalendarId}`, link])),
      accountById: new Map(connections.map((item) => [item.id, item.accountEmail])),
      connectionIds
    };
  }, [contexts, links, connections]);

  const legend = useMemo(() => {
    const items = connections.map((item) => ({
      label: item.accountEmail,
      color: accountColor(item.id, lookups.connectionIds)
    }));
    const extras = new Map<string, { color: string; label: string }>();
    for (const event of events) {
      const connectionId = event.connectionId;
      if (connectionId && lookups.accountById.has(connectionId)) continue;
      const meta = eventMeta(event, lookups);
      if (!extras.has(meta.label)) extras.set(meta.label, { color: meta.color, label: meta.label });
    }
    return [...items, ...extras.values()];
  }, [connections, events, lookups]);

  return (
    <section className="panel wide routine-calendar-board">
      <header className="routine-cal-toolbar">
        <div>
          <p className="routine-cal-kicker">{mode === "week" ? "Semana" : "Mes"}</p>
          <h2>{mode === "week" ? formatWeekTitle(week) : formatMonthTitle(cursor)}</h2>
        </div>
        <div className="routine-cal-actions">
          <div className="routine-cal-toggle">
            <button className={mode === "week" ? "active" : ""} type="button" onClick={() => onModeChange("week")}>
              Semana
            </button>
            <button className={mode === "month" ? "active" : ""} type="button" onClick={() => onModeChange("month")}>
              Mes
            </button>
          </div>
          <div className="routine-cal-nav">
            <button type="button" onClick={() => onCursorChange(addDaysToKey(cursor, -shift))} aria-label="Anterior">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => onCursorChange(todayKey)}>
              Hoje
            </button>
            <button type="button" onClick={() => onCursorChange(addDaysToKey(cursor, shift))} aria-label="Proximo">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </header>

      {legend.length > 0 && (
        <div className="routine-cal-legend">
          {legend.map((item) => (
            <span key={item.label}>
              <i style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}

      {mode === "month" ? (
        <div className="routine-month">
          {weekdayLabels.map((label) => (
            <span key={label} className="routine-cal-head">
              {label}
            </span>
          ))}
          {month.map((dayKey) => {
            const dayEvents = eventsByDay.get(dayKey) ?? [];
            const dayTasks = tasks.filter((task) => task.status !== "done" && (task.scheduledDate === dayKey || task.dueDate === dayKey));
            const inMonth = dayKey.slice(0, 7) === cursor.slice(0, 7);
            const weekend = weekdayFromKey(dayKey) === 0 || weekdayFromKey(dayKey) === 6;
            return (
              <button
                key={dayKey}
                type="button"
                className={`routine-month-day ${inMonth ? "" : "muted"} ${weekend ? "weekend" : ""} ${dayKey === todayKey ? "today" : ""} ${dayKey === cursor ? "selected" : ""}`}
                onClick={() => {
                  onCursorChange(dayKey);
                  onModeChange("week");
                }}
              >
                <strong>{formatDayNumber(dayKey)}</strong>
                {dayEvents.slice(0, 3).map((event) => {
                  const meta = eventMeta(event, lookups);
                  const tone = eventTone(meta.color);
                  return (
                    <span key={event.id} className="routine-month-chip" style={{ background: tone.background, color: tone.text, borderColor: tone.border }}>
                      <i style={{ background: meta.color }} />
                      {event.title}
                    </span>
                  );
                })}
                {dayTasks.slice(0, 2).map((task) => (
                  <span key={task.id} className="routine-month-chip task">
                    {task.title}
                  </span>
                ))}
                {dayEvents.length + dayTasks.length > 5 && <small>+{dayEvents.length + dayTasks.length - 5}</small>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="routine-week-wrap">
          <div className="routine-week">
            <div className="routine-week-gutter" />
            {week.map((dayKey) => {
              const weekend = weekdayFromKey(dayKey) === 0 || weekdayFromKey(dayKey) === 6;
              return (
                <button
                  key={`head-${dayKey}`}
                  type="button"
                  className={`routine-week-head ${dayKey === todayKey ? "today" : ""} ${weekend ? "weekend" : ""}`}
                  onClick={() => onCursorChange(dayKey)}
                >
                  <small>{weekdayLabels[week.indexOf(dayKey)]}</small>
                  <strong>{formatDayNumber(dayKey)}</strong>
                </button>
              );
            })}
            {week.some((dayKey) => (eventsByDay.get(dayKey) ?? []).some((event) => event.allDay)) && (
              <>
                <div className="routine-week-gutter muted">Dia</div>
                {week.map((dayKey) => {
                  const allDay = (eventsByDay.get(dayKey) ?? []).filter((event) => event.allDay);
                  return (
                    <div key={`allday-${dayKey}`} className={`routine-week-allday ${dayKey === todayKey ? "today" : ""}`}>
                      {allDay.map((event) => {
                        const meta = eventMeta(event, lookups);
                        const tone = eventTone(meta.color);
                        return (
                          <span key={event.id} className="routine-week-chip" style={{ background: tone.background, color: tone.text, borderColor: tone.border }}>
                            {event.title}
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
            <div className="routine-week-grid" style={{ gridColumn: "1 / -1", minHeight: hours.length * hourHeight }}>
              <div className="routine-week-hours">
                {hours.map((hour) => (
                  <span key={hour} style={{ height: hourHeight }}>
                    {String(hour).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
              {week.map((dayKey) => {
                const timed = (eventsByDay.get(dayKey) ?? []).filter((event) => !event.allDay);
                const placed = placeEvents(timed, timeZone, dayStartHour, 22);
                const weekend = weekdayFromKey(dayKey) === 0 || weekdayFromKey(dayKey) === 6;
                return (
                  <div
                    key={`col-${dayKey}`}
                    className={`routine-week-col ${dayKey === todayKey ? "today" : ""} ${weekend ? "weekend" : ""}`}
                    style={{ minHeight: hours.length * hourHeight, backgroundSize: `100% ${hourHeight}px` }}
                  >
                    {dayKey === todayKey && showNow && <div className="routine-now-line" style={{ top: nowTop }} />}
                    {placed.map((item) => {
                      const meta = eventMeta(item.event, lookups);
                      const tone = eventTone(meta.color);
                      const width = `calc((100% - 8px) / ${item.cols})`;
                      const left = `calc(4px + ${item.col} * (100% - 8px) / ${item.cols})`;
                      const detail = [meta.label, meta.account].filter(Boolean).join(" · ");
                      return (
                        <article
                          key={item.event.id}
                          className={`routine-week-event ${item.height < 44 ? "compact" : ""}`}
                          style={{
                            top: item.top,
                            height: item.height,
                            left,
                            width,
                            background: tone.background,
                            borderColor: tone.border,
                            color: tone.text,
                            boxShadow: `inset 3px 0 0 ${tone.accent}`
                          }}
                          title={`${item.event.title} · ${formatTime(item.event.start, timeZone)} – ${formatTime(item.event.end, timeZone)} · ${detail}`}
                        >
                          <strong>{item.event.title}</strong>
                          {item.height >= 44 && (
                            <small>
                              {formatTime(item.event.start, timeZone)} – {formatTime(item.event.end, timeZone)}
                            </small>
                          )}
                        </article>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
