import type {
  AlertFrequency,
  AlertKind,
  FinancePlan,
  LifeAlert,
  SecretarySettings
} from "@mylyfe/domain";
import { alertKindLabels } from "@mylyfe/domain";
import { Bell, LogOut, MessageCircle, Pause, Play, Plus, SlidersHorizontal, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { MoneyField } from "./MoneyField";
import { WhatsAppPhoneField } from "./WhatsAppPhoneField";
import { apiRequest, preciseCurrency, uid } from "./lib";

export type SecretarySection = "home" | "alerts" | "whatsapp" | "settings";

type SecretaryStatus = {
  state?: "disconnected" | "qr" | "connecting" | "connected" | "offline";
  qr?: string | null;
  phone?: string;
  message?: string;
  lastError?: string;
};

type SecretarySnapshot = {
  phone: string;
  personName: string;
  settings: SecretarySettings;
  alerts: LifeAlert[];
  updatedAt?: string;
  pendingJobs: number;
};

const kindOptions: Array<{ value: AlertKind; label: string }> = [
  { value: "bill", label: "Conta / boleto" },
  { value: "tax", label: "Imposto" },
  { value: "subscription", label: "Assinatura" },
  { value: "income", label: "Recebimento" },
  { value: "document", label: "Documento / prazo" },
  { value: "habit", label: "Check-in" },
  { value: "one_off", label: "Lembrete avulso" }
];

const frequencyOptions: Array<{ value: AlertFrequency; label: string }> = [
  { value: "monthly", label: "Mensal" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "annual", label: "Anual" },
  { value: "once", label: "Uma vez" },
  { value: "daily", label: "Diario" }
];

const templates: Array<Partial<LifeAlert> & { title: string; kind: AlertKind }> = [
  { title: "Internet", kind: "bill", dueDay: 10, frequency: "monthly" },
  { title: "Energia", kind: "bill", dueDay: 15, frequency: "monthly" },
  { title: "Agua", kind: "bill", dueDay: 12, frequency: "monthly" },
  { title: "Aluguel / condominio", kind: "bill", dueDay: 5, frequency: "monthly" },
  { title: "IPTU", kind: "tax", frequency: "annual" },
  { title: "Academia", kind: "subscription", dueDay: 8, frequency: "monthly" },
  { title: "Salario", kind: "income", dueDay: 5, frequency: "monthly" },
  { title: "Aporte do mes", kind: "habit", dueDay: 28, frequency: "monthly" },
  { title: "Check-up anual", kind: "document", frequency: "annual" },
  { title: "Dentista", kind: "document", frequency: "quarterly" },
  { title: "Tomar continuo", kind: "habit", frequency: "daily", preferredHour: 8, askIfPaid: true },
  { title: "Renovar receita", kind: "document", frequency: "once" }
];

const frequencyLabel: Record<AlertFrequency, string> = {
  monthly: "Mensal",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  quarterly: "Trimestral",
  annual: "Anual",
  once: "Uma vez",
  daily: "Diario"
};

const cycleLabel: Record<LifeAlert["cycle"]["status"], string> = {
  scheduled: "Agendado",
  reminded: "Lembrete enviado",
  awaiting_confirmation: "Esperando resposta",
  paid: "Pago / feito",
  snoozed: "Adiado",
  skipped: "Pulado"
};

const timezoneOptions = [
  { value: "America/Sao_Paulo", label: "Brasilia / Sao Paulo" },
  { value: "America/Fortaleza", label: "Fortaleza" },
  { value: "America/Recife", label: "Recife" },
  { value: "America/Manaus", label: "Manaus" },
  { value: "America/Belem", label: "Belem" },
  { value: "America/Rio_Branco", label: "Rio Branco" }
];

const weekdayOptions = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terca" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sabado" }
];

const emptyDraft = (): Partial<LifeAlert> & { title: string; kind: AlertKind; frequency: AlertFrequency } => ({
  title: "",
  kind: "bill",
  frequency: "monthly",
  dueDay: 10,
  weekday: 1,
  remindDaysBefore: 2,
  confirmAfterHours: 8,
  snoozeHours: 24,
  preferredHour: 9,
  askIfPaid: true,
  amount: 0,
  notes: ""
});

const draftFromAlert = (alert: LifeAlert) => ({
  ...emptyDraft(),
  ...alert
});

const formatWhen = (iso?: string) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
};

const stateLabel = (state?: SecretaryStatus["state"]) =>
  ({
    connected: "Conectada",
    qr: "Escaneie o QR",
    connecting: "Conectando",
    disconnected: "Desconectada",
    offline: "Container desligado"
  })[state ?? "offline"];

export function SecretaryView({
  plan,
  setPlan,
  section,
  admin = true,
  viewerPhone,
  onOpenSection
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  section: SecretarySection;
  admin?: boolean;
  viewerPhone?: string;
  onOpenSection?: (view: "secretary-home" | "secretary-alerts" | "secretary-whatsapp" | "secretary-settings") => void;
}) {
  const primary = plan.profile.people.find((person) => person.role === "primary") ?? plan.profile.people[0];
  const contactPhone = admin ? primary?.phone : viewerPhone;
  const [status, setStatus] = useState<SecretaryStatus>({ state: "offline" });
  const [snapshot, setSnapshot] = useState<SecretarySnapshot | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");

  const applySnapshot = (next: SecretarySnapshot) => {
    setSnapshot(next);
    setPlan((current) => {
      if (!current) return current;
      const updatedAt = next.updatedAt ?? current.secretary?.updatedAt ?? new Date().toISOString();
      if (
        current.secretary?.updatedAt === updatedAt &&
        current.secretary.alerts.length === next.alerts.length &&
        current.secretary.settings.enabled === next.settings.enabled &&
        current.secretary.settings.timezone === next.settings.timezone &&
        current.secretary.settings.quietHoursStart === next.settings.quietHoursStart &&
        current.secretary.settings.quietHoursEnd === next.settings.quietHoursEnd
      ) {
        return current;
      }

      return {
        ...current,
        secretary: {
          settings: next.settings,
          alerts: next.alerts,
          updatedAt
        }
      };
    });
  };

  const loadSnapshot = async () => {
    const response = await apiRequest(`/plans/${plan.id}/secretary`);
    if (!response.ok) throw new Error("Nao foi possivel carregar os alertas.");
    applySnapshot((await response.json()) as SecretarySnapshot);
  };

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [statusResponse] = await Promise.all([apiRequest("/secretary/status"), loadSnapshot().catch(() => undefined)]);
        if (!active) return;
        setStatus((await statusResponse.json()) as SecretaryStatus);
      } catch {
        if (active) setStatus({ state: "offline", message: "API ou secretaria indisponivel." });
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [plan.id]);

  const resetWhatsAppSession = async (confirmMessage?: string) => {
    if (disconnecting) return;
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }
    setDisconnecting(true);
    setError("");
    try {
      const response = await apiRequest("/secretary/logout", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as SecretaryStatus & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Nao foi possivel atualizar a sessao do WhatsApp.");
      }
      setStatus(payload);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Nao foi possivel atualizar a sessao do WhatsApp.");
    } finally {
      setDisconnecting(false);
    }
  };

  const disconnectWhatsApp = () =>
    resetWhatsAppSession("Desconectar o WhatsApp da secretaria? Voce vai precisar escanear o QR de novo.");

  const saveSettings = async (patch: Partial<SecretarySettings>) => {
    const response = await apiRequest(`/plans/${plan.id}/secretary/settings`, {
      method: "PUT",
      body: JSON.stringify({ ...snapshot?.settings, ...patch })
    });
    if (!response.ok) {
      setError("Nao foi possivel salvar as preferencias.");
      return;
    }
    setError("");
    await loadSnapshot();
  };

  const saveAlert = async () => {
    if (!draft.title.trim()) {
      setError("De um nome para o lembrete.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest(`/plans/${plan.id}/alerts`, {
        method: "POST",
        body: JSON.stringify({
          id: draft.id ?? uid("alert"),
          title: draft.title,
          kind: draft.kind,
          frequency: draft.frequency,
          amount: draft.amount && draft.amount > 0 ? draft.amount : undefined,
          dueDay: draft.frequency === "monthly" || draft.frequency === "quarterly" ? draft.dueDay : undefined,
          dueDate: draft.dueDate || undefined,
          weekday: draft.frequency === "weekly" || draft.frequency === "biweekly" ? draft.weekday : undefined,
          remindDaysBefore: draft.remindDaysBefore ?? 2,
          confirmAfterHours: draft.confirmAfterHours ?? 8,
          snoozeHours: draft.snoozeHours ?? 24,
          preferredHour: draft.preferredHour ?? 9,
          askIfPaid: draft.askIfPaid ?? true,
          notes: draft.notes
        })
      });
      if (!response.ok) throw new Error("Falha ao salvar");
      setDraft(emptyDraft());
      await loadSnapshot();
    } catch {
      setError("Nao foi possivel salvar o lembrete.");
    } finally {
      setSaving(false);
    }
  };

  const setStatusFor = async (alertId: string, next: LifeAlert["status"]) => {
    const response = await apiRequest(`/plans/${plan.id}/alerts/${alertId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: next })
    });
    if (!response.ok) {
      setError("Nao foi possivel atualizar o lembrete.");
      return;
    }
    await loadSnapshot();
  };

  const removeAlert = async (alertId: string) => {
    const response = await apiRequest(`/plans/${plan.id}/alerts/${alertId}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Nao foi possivel remover o lembrete.");
      return;
    }
    if (draft.id === alertId) setDraft(emptyDraft());
    await loadSnapshot();
  };

  const upcoming = useMemo(
    () =>
      [...(snapshot?.alerts ?? [])]
        .filter((alert) => alert.status === "active")
        .sort((left, right) => left.cycle.dueAt.localeCompare(right.cycle.dueAt)),
    [snapshot]
  );

  if ((section === "whatsapp" || section === "settings") && !admin) {
    return (
      <div className="page">
        <header className="page-header">
          <span>Zelo / Secretaria</span>
          <h1>Configuracao do projeto</h1>
          <p>So o administrador conecta o chip da secretaria e altera as preferencias do projeto.</p>
        </header>
      </div>
    );
  }

  if (section === "whatsapp") {
    return (
      <div className="page">
        <header className="page-header">
          <span>Zelo / Secretaria</span>
          <h1>WhatsApp</h1>
          <p>Conecte o chip da secretaria. A sessao fica no container, fora do Financeiro.</p>
        </header>
        <section className={`metric-card ${status.state === "connected" ? "tone-good" : "tone-warn"}`}>
          <div>
            <MessageCircle />
          </div>
          <span>Status</span>
          <strong>{stateLabel(status.state)}</strong>
          <small>{status.phone ? `Chip conectado: ${status.phone}` : "Nenhum chip pareado ainda"}</small>
        </section>
        <section className="panel wide">
          <header>
            <div>
              <Smartphone />
              <h2>Parear aparelho</h2>
            </div>
            {status.state === "connected" ? (
              <button className="icon-button labeled danger" type="button" onClick={() => void disconnectWhatsApp()} disabled={disconnecting}>
                <LogOut size={16} /> {disconnecting ? "Desconectando..." : "Desconectar WhatsApp"}
              </button>
            ) : status.state !== "offline" ? (
              <button className="icon-button labeled" type="button" onClick={() => void resetWhatsAppSession()} disabled={disconnecting}>
                <Smartphone size={16} /> {disconnecting ? "Gerando QR..." : "Gerar QR"}
              </button>
            ) : null}
          </header>
          <p className="panel-note">
            Use um numero reserva. Quando o app atualizar, este container continua ligado e voce nao precisa escanear de
            novo.
          </p>
          {status.state === "offline" && (
            <p className="panel-note">
              Suba com <code>docker compose up -d secretary</code> e volte nesta tela.
            </p>
          )}
          {status.qr && (
            <div className="secretary-qr">
              <img src={status.qr} alt="QR Code para conectar a secretaria no WhatsApp" />
              <span>WhatsApp no chip da secretaria → Aparelhos conectados → Conectar.</span>
            </div>
          )}
          {status.state === "connected" && (
            <p className="panel-note">Pronto. Os avisos vao para o seu WhatsApp pessoal cadastrado em Preferencias.</p>
          )}
          {(status.lastError || status.message) && <p className="panel-note">{status.lastError || status.message}</p>}
          {error && <p className="panel-note">{error}</p>}
        </section>
      </div>
    );
  }

  if (section === "settings") {
    return (
      <div className="page">
        <header className="page-header">
          <span>Zelo / Secretaria</span>
          <h1>Preferencias</h1>
          <p>Numero pessoal, fuso e janela em que ela pode escrever.</p>
        </header>
        <section className="panel wide">
          <header>
            <div>
              <SlidersHorizontal />
              <h2>Contato e funcionamento</h2>
            </div>
          </header>
          <div className="form-grid">
            {primary && (
              <WhatsAppPhoneField
                personId={primary.id}
                phone={primary.phone ?? ""}
                verifiedAt={primary.whatsappVerifiedAt}
                onPhoneChange={(phone, verifiedAt) => {
                  setPlan((current) =>
                    current
                      ? {
                          ...current,
                          profile: {
                            ...current.profile,
                            people: current.profile.people.map((person) =>
                              person.id === primary.id ? { ...person, phone, whatsappVerifiedAt: verifiedAt } : person
                            )
                          }
                        }
                      : current
                  );
                }}
              />
            )}
            <label className="field">
              <span>Secretaria ativa</span>
              <select
                value={snapshot?.settings.enabled ? "yes" : "no"}
                onChange={(event) => saveSettings({ enabled: event.target.value === "yes" })}
              >
                <option value="yes">Sim, pode me avisar</option>
                <option value="no">Pausar avisos</option>
              </select>
            </label>
            <label className="field">
              <span>Fuso horario</span>
              <select
                value={snapshot?.settings.timezone ?? "America/Sao_Paulo"}
                onChange={(event) => saveSettings({ timezone: event.target.value })}
              >
                {timezoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Nao incomodar a partir de</span>
              <input
                inputMode="numeric"
                value={String(snapshot?.settings.quietHoursStart ?? 22)}
                onChange={(event) => saveSettings({ quietHoursStart: Number(event.target.value) || 0 })}
              />
            </label>
            <label className="field">
              <span>Voltar a avisar as</span>
              <input
                inputMode="numeric"
                value={String(snapshot?.settings.quietHoursEnd ?? 8)}
                onChange={(event) => saveSettings({ quietHoursEnd: Number(event.target.value) || 0 })}
              />
            </label>
          </div>
          {error && <p className="panel-note">{error}</p>}
          <p className="panel-note">
            Ela escreve para o seu numero e entende respostas como <strong>sim</strong>, <strong>ainda nao</strong> e{" "}
            <strong>me lembra amanha</strong>.
          </p>
        </section>
      </div>
    );
  }

  if (section === "alerts") {
    return (
      <div className="page">
        <header className="page-header">
          <span>Zelo / Secretaria</span>
          <h1>Lembretes</h1>
          <p>Contas, impostos, assinaturas, recebimentos e prazos que ela vai cobrar por voce.</p>
        </header>
        <section className="panel wide">
          <header>
            <div>
              <Bell />
              <h2>Novo lembrete</h2>
            </div>
          </header>
          <div className="secretary-templates">
            {templates.map((template) => (
              <button key={template.title} type="button" className="chip-button" onClick={() => setDraft({ ...emptyDraft(), ...template })}>
                {template.title}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Nome</span>
              <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as AlertKind }))}>
                {kindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Frequencia</span>
              <select
                value={draft.frequency}
                onChange={(event) => setDraft((current) => ({ ...current, frequency: event.target.value as AlertFrequency }))}
              >
                {frequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <MoneyField
              label="Valor"
              value={draft.amount ?? 0}
              onChange={(amount) => setDraft((current) => ({ ...current, amount }))}
            />
            {(draft.frequency === "monthly" || draft.frequency === "quarterly") && (
              <label className="field">
                <span>Dia do vencimento</span>
                <input
                  inputMode="numeric"
                  value={String(draft.dueDay ?? "")}
                  onChange={(event) => setDraft((current) => ({ ...current, dueDay: Number(event.target.value) || undefined }))}
                />
              </label>
            )}
            {(draft.frequency === "once" || draft.frequency === "annual") && (
              <label className="field">
                <span>Data</span>
                <input type="date" value={draft.dueDate ?? ""} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} />
              </label>
            )}
            {(draft.frequency === "weekly" || draft.frequency === "biweekly") && (
              <label className="field">
                <span>Dia da semana</span>
                <select
                  value={String(draft.weekday ?? 1)}
                  onChange={(event) => setDraft((current) => ({ ...current, weekday: Number(event.target.value) }))}
                >
                  {weekdayOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Observacao</span>
              <input
                value={draft.notes ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Lembrar quantos dias antes</span>
              <input
                inputMode="numeric"
                value={String(draft.remindDaysBefore ?? 2)}
                onChange={(event) => setDraft((current) => ({ ...current, remindDaysBefore: Number(event.target.value) || 0 }))}
              />
            </label>
            <label className="field">
              <span>Perguntar se ja pagou?</span>
              <select
                value={draft.askIfPaid ? "yes" : "no"}
                onChange={(event) => setDraft((current) => ({ ...current, askIfPaid: event.target.value === "yes" }))}
              >
                <option value="yes">Sim, cobrar confirmacao</option>
                <option value="no">So lembrar</option>
              </select>
            </label>
          </div>
          {error && <p className="panel-note">{error}</p>}
          <button className="icon-button labeled" type="button" onClick={saveAlert} disabled={saving}>
            <Plus size={16} /> {draft.id ? "Salvar alteracoes" : "Cadastrar lembrete"}
          </button>
          {draft.id && (
            <button className="icon-button labeled" type="button" onClick={() => setDraft(emptyDraft())}>
              Cancelar edicao
            </button>
          )}
        </section>
        <section className="panel wide">
          <header>
            <div>
              <Bell />
              <h2>Cadastrados</h2>
            </div>
          </header>
          <div className="item-list">
            {(snapshot?.alerts ?? []).length === 0 && (
              <div className="empty-state">
                <span>Nenhum lembrete ainda</span>
                <small>Comece pela internet, imposto ou salario.</small>
              </div>
            )}
            {(snapshot?.alerts ?? []).map((alert) => (
              <div className="editable-item" key={alert.id}>
                <div className="list-row">
                  <span className="list-row-icon">
                    <Bell size={18} />
                  </span>
                  <div className="list-row-copy secretary-alert">
                    <strong>{alert.title}</strong>
                    <span>
                      {alertKindLabels[alert.kind]} · {frequencyLabel[alert.frequency]} · {cycleLabel[alert.cycle.status]}
                      {alert.amount ? ` · ${preciseCurrency.format(alert.amount)}` : ""}
                      {alert.status === "paused" ? " · pausado" : ""}
                      {alert.status === "completed" ? " · encerrado" : ""}
                    </span>
                    <small>
                      Vence {formatWhen(alert.cycle.dueAt)} · lembrete {formatWhen(alert.cycle.remindAt)}
                      {alert.cycle.snoozeUntil ? ` · volta ${formatWhen(alert.cycle.snoozeUntil)}` : ""}
                    </small>
                  </div>
                </div>
                <div className="secretary-alert-actions">
                  <button className="icon-button labeled" type="button" onClick={() => setDraft(draftFromAlert(alert))}>
                    Editar
                  </button>
                  <button
                    className="icon-button"
                    title={alert.status === "paused" ? "Retomar" : "Pausar"}
                    onClick={() => setStatusFor(alert.id, alert.status === "paused" ? "active" : "paused")}
                  >
                    {alert.status === "paused" ? <Play size={16} /> : <Pause size={16} />}
                  </button>
                  <button className="icon-button danger" title="Remover" onClick={() => removeAlert(alert.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <span>Zelo / Secretaria</span>
        <h1>Painel</h1>
        <p>Uma secretaria da vida, nao uma tela do Financeiro. Ela lembra, pergunta e reagenda.</p>
      </header>
      <section className="metric-grid">
        {admin && (
          <article className={`metric-card ${status.state === "connected" ? "tone-good" : "tone-warn"}`}>
            <div>
              <MessageCircle />
            </div>
            <span>WhatsApp</span>
            <strong>{stateLabel(status.state)}</strong>
            <small>{status.phone ? `Chip: ${status.phone}` : "Pareie o chip da secretaria"}</small>
          </article>
        )}
        <article className="metric-card">
          <div>
            <Smartphone />
          </div>
          <span>Seu numero</span>
          <strong>{contactPhone || "Nao cadastrado"}</strong>
          <small>{admin ? "E para este WhatsApp que ela escreve" : "Confirme este numero no seu Perfil"}</small>
        </article>
        <article className="metric-card">
          <div>
            <Bell />
          </div>
          <span>Lembretes ativos</span>
          <strong>{String(upcoming.length)}</strong>
          <small>{snapshot?.pendingJobs ? `${snapshot.pendingJobs} aviso(s) na fila` : "Fila vazia"}</small>
        </article>
      </section>
      <section className="module-overview-grid">
        {admin && (
          <button className="module-overview-card active" type="button" onClick={() => onOpenSection?.("secretary-whatsapp")}>
            <div>
              <Smartphone />
              <strong>WhatsApp</strong>
            </div>
            <p>Conectar o chip da secretaria e ver se a sessao esta viva.</p>
            <span>Configurar</span>
          </button>
        )}
        <button className="module-overview-card active" type="button" onClick={() => onOpenSection?.("secretary-alerts")}>
          <div>
            <Bell />
            <strong>Lembretes</strong>
          </div>
          <p>Cadastrar contas, impostos, assinaturas e prazos.</p>
          <span>Abrir</span>
        </button>
        {admin && (
          <button className="module-overview-card active" type="button" onClick={() => onOpenSection?.("secretary-settings")}>
            <div>
              <SlidersHorizontal />
              <strong>Preferencias</strong>
            </div>
            <p>Numero do projeto, fuso e horario em que ela pode mandar mensagem.</p>
            <span>Ajustar</span>
          </button>
        )}
      </section>
      <section className="panel wide">
        <header>
          <div>
            <Bell />
            <h2>Proximos avisos</h2>
          </div>
        </header>
        <div className="item-list">
          {upcoming.length === 0 && <p className="panel-note">Nenhum lembrete ativo. Cadastre o primeiro em Lembretes.</p>}
          {upcoming.slice(0, 5).map((alert) => (
            <div className="editable-item" key={alert.id}>
              <div className="secretary-alert">
                <strong>{alert.title}</strong>
                <span>
                  {alertKindLabels[alert.kind]} · {frequencyLabel[alert.frequency]} · {cycleLabel[alert.cycle.status]}
                </span>
                <small>Vence {formatWhen(alert.cycle.dueAt)}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
