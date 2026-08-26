import type {
  FinancePlan,
  HealthAppointment,
  HealthAppointmentKind,
  HealthCare,
  HealthCareKind,
  HealthInsurance,
  HealthMedication,
  HealthProfile
} from "@mylyfe/domain";
import {
  buildAppointmentDateTime,
  defaultHealthCares,
  healthAppointmentKindLabels,
  healthCareKindLabels,
  healthCareStatus,
  healthCareStatusLabels,
  markHealthAppointmentDone,
  markHealthCareDone,
  normalizeHealthModuleState,
  removeHealthAppointment,
  removeHealthCare,
  removeHealthMedication,
  summarizeHealthFinances,
  upsertHealthAppointment,
  upsertHealthCare,
  upsertHealthInsurance,
  upsertHealthMedication,
  upsertHealthProfile
} from "@mylyfe/domain";
import { Activity, Bell, CalendarDays, HeartPulse, Pill, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { MoneyField } from "./MoneyField";
import { currency, uid } from "./lib";

export type HealthSection = "home" | "wallet" | "appointments" | "meds";

const appointmentKindOptions = Object.entries(healthAppointmentKindLabels) as Array<[HealthAppointmentKind, string]>;
const careKindOptions = Object.entries(healthCareKindLabels) as Array<[HealthCareKind, string]>;

const emptyAppointment = () => ({
  title: "",
  kind: "consult" as HealthAppointmentKind,
  personId: "primary",
  professional: "",
  location: "",
  date: "",
  time: "09:00",
  notes: "",
  careId: "",
  remindOnWhatsApp: true
});

const emptyCare = () => ({
  title: "",
  kind: "checkup" as HealthCareKind,
  personId: "primary",
  intervalMonths: 12,
  lastDoneOn: ""
});

const emptyMed = () => ({
  name: "",
  personId: "primary",
  dosage: "",
  prescriptionExpiresOn: "",
  stockNote: "",
  remindOnWhatsApp: true,
  reminderHour: 8
});

const formatWhen = (iso?: string, timeZone = "America/Sao_Paulo") => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const personName = (plan: FinancePlan, personId?: string) =>
  plan.profile.people.find((person) => person.id === personId)?.name || "Voce";

export function HealthView({
  plan,
  setPlan,
  section
}: {
  plan: FinancePlan;
  setPlan: Dispatch<SetStateAction<FinancePlan | null>>;
  section: HealthSection;
}) {
  const health = useMemo(() => normalizeHealthModuleState(plan.health), [plan.health]);
  const timezone = plan.routine?.settings?.timezone || plan.secretary?.settings?.timezone || "America/Sao_Paulo";
  const people = plan.profile.people;
  const [appointmentDraft, setAppointmentDraft] = useState(emptyAppointment);
  const [careDraft, setCareDraft] = useState(emptyCare);
  const [medDraft, setMedDraft] = useState(emptyMed);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);

  const apply = (next: FinancePlan) => setPlan(next);

  const finance = useMemo(() => summarizeHealthFinances(plan), [plan]);
  const upcoming = useMemo(
    () =>
      [...health.appointments]
        .filter((appointment) => !appointment.done)
        .sort((left, right) => left.start.localeCompare(right.start)),
    [health.appointments]
  );
  const overdueCares = useMemo(
    () => health.cares.filter((care) => healthCareStatus(care) !== "on_track"),
    [health.cares]
  );

  const saveAppointment = () => {
    if (!appointmentDraft.date || !appointmentDraft.time) return;
    const { start, end } = buildAppointmentDateTime(appointmentDraft.date, appointmentDraft.time, timezone);
    apply(
      upsertHealthAppointment(plan, {
        id: editingAppointmentId ?? uid("appt"),
        title: appointmentDraft.title || healthAppointmentKindLabels[appointmentDraft.kind],
        kind: appointmentDraft.kind,
        personId: appointmentDraft.personId,
        professional: appointmentDraft.professional || undefined,
        location: appointmentDraft.location || undefined,
        notes: appointmentDraft.notes || undefined,
        careId: appointmentDraft.careId || undefined,
        remindOnWhatsApp: appointmentDraft.remindOnWhatsApp,
        start,
        end
      })
    );
    setAppointmentDraft(emptyAppointment());
    setEditingAppointmentId(null);
  };

  const editAppointment = (appointment: HealthAppointment) => {
    const start = new Date(appointment.start);
    setEditingAppointmentId(appointment.id);
    setAppointmentDraft({
      title: appointment.title,
      kind: appointment.kind,
      personId: appointment.personId,
      professional: appointment.professional ?? "",
      location: appointment.location ?? "",
      date: new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(start),
      time: new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start),
      notes: appointment.notes ?? "",
      careId: appointment.careId ?? "",
      remindOnWhatsApp: appointment.remindOnWhatsApp
    });
  };

  const saveCare = (partial?: Partial<HealthCare>) => {
    const draft = { ...careDraft, ...partial };
    if (!draft.title.trim()) return;
    apply(
      upsertHealthCare(plan, {
        title: draft.title,
        kind: draft.kind,
        personId: draft.personId,
        intervalMonths: draft.intervalMonths,
        lastDoneOn: draft.lastDoneOn || undefined
      })
    );
    setCareDraft(emptyCare());
  };

  const saveMed = () => {
    if (!medDraft.name.trim()) return;
    apply(
      upsertHealthMedication(plan, {
        id: editingMedId ?? uid("med"),
        name: medDraft.name,
        personId: medDraft.personId,
        dosage: medDraft.dosage || undefined,
        prescriptionExpiresOn: medDraft.prescriptionExpiresOn || undefined,
        stockNote: medDraft.stockNote || undefined,
        remindOnWhatsApp: medDraft.remindOnWhatsApp,
        reminderHour: medDraft.reminderHour
      })
    );
    setMedDraft(emptyMed());
    setEditingMedId(null);
  };

  const editMed = (medication: HealthMedication) => {
    setEditingMedId(medication.id);
    setMedDraft({
      name: medication.name,
      personId: medication.personId,
      dosage: medication.dosage ?? "",
      prescriptionExpiresOn: medication.prescriptionExpiresOn ?? "",
      stockNote: medication.stockNote ?? "",
      remindOnWhatsApp: medication.remindOnWhatsApp,
      reminderHour: medication.reminderHour
    });
  };

  const saveInsurance = (patch: Partial<HealthInsurance>) => {
    apply(
      upsertHealthInsurance(plan, {
        provider: health.insurance?.provider ?? "",
        cardNumber: health.insurance?.cardNumber,
        expiresOn: health.insurance?.expiresOn,
        monthlyCost: health.insurance?.monthlyCost,
        holderPersonId: health.insurance?.holderPersonId,
        ...patch
      })
    );
  };

  const saveProfile = (personId: string, patch: Partial<HealthProfile>) => {
    const current = health.profiles.find((profile) => profile.personId === personId);
    apply(
      upsertHealthProfile(plan, {
        personId,
        bloodType: current?.bloodType,
        allergies: current?.allergies,
        emergencyContact: current?.emergencyContact,
        doctors: current?.doctors,
        ...patch
      })
    );
  };

  const personSelect = (value: string, onChange: (value: string) => void) => (
    <label className="field">
      <span>Pessoa</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name || (person.role === "primary" ? "Voce" : person.id)}
          </option>
        ))}
      </select>
    </label>
  );

  const header = (title: string, copy: string) => (
    <header className="page-header">
      <span>Zelo / Saude</span>
      <h1>{title}</h1>
      <p>{copy}</p>
    </header>
  );

  if (section === "home") {
    return (
      <div className="page">
        {header("Painel", "O que esta em dia, o que vence e quanto saude esta custando neste mes.")}
        <section className="metric-grid compact">
          <article className={`metric-card ${overdueCares.length ? "tone-warn" : "tone-good"}`}>
            <div>
              <Activity />
            </div>
            <span>Cuidados</span>
            <strong>{overdueCares.length ? `${overdueCares.length} atrasados` : "Em dia"}</strong>
            <small>{health.cares.length} cadastrados</small>
          </article>
          <article className="metric-card">
            <div>
              <HeartPulse />
            </div>
            <span>Proximas consultas</span>
            <strong>{upcoming.length}</strong>
            <small>{upcoming[0] ? formatWhen(upcoming[0].start, timezone) : "Nenhuma marcada"}</small>
          </article>
          <article className="metric-card">
            <div>
              <Pill />
            </div>
            <span>Gasto de saude</span>
            <strong>{currency.format(finance.monthSpend)}</strong>
            <small>
              {finance.insuranceMonthly ? `Plano ${currency.format(finance.insuranceMonthly)}` : "Sem plano informado"}
            </small>
          </article>
        </section>

        {finance.reimbursableCount > 0 && (
          <p className="panel-note">
            {finance.reimbursableCount} reembolso(s) de saude somam {currency.format(finance.reimbursablePending)}.
          </p>
        )}

        <section className="panel wide">
          <header>
            <div>
              <Activity />
              <h2>Precisa de atencao</h2>
            </div>
          </header>
          {overdueCares.length === 0 && upcoming.length === 0 && (
            <div className="empty-state">
              <span>Nada atrasado</span>
              <small>Cadastre a cadencia dos check-ups em Consultas.</small>
            </div>
          )}
          {overdueCares.map((care) => (
            <article key={care.id} className="list-row">
              <span className="list-row-icon">
                <Activity size={18} />
              </span>
              <div className="list-row-copy secretary-alert">
                <strong>{care.title}</strong>
                <span>
                  {personName(plan, care.personId)} · {healthCareStatusLabels[healthCareStatus(care)]}
                </span>
              </div>
              <div className="secretary-alert-actions">
                <button className="secondary-button" type="button" onClick={() => apply(markHealthCareDone(plan, care.id))}>
                  Marquei como feito
                </button>
              </div>
            </article>
          ))}
          {upcoming.slice(0, 4).map((appointment) => (
            <article key={appointment.id} className="list-row">
              <span className="list-row-icon">
                <CalendarDays size={18} />
              </span>
              <div className="list-row-copy secretary-alert">
                <strong>{appointment.title}</strong>
                <span>
                  {formatWhen(appointment.start, timezone)}
                  {appointment.location ? ` · ${appointment.location}` : ""} · na agenda da Rotina
                </span>
              </div>
            </article>
          ))}
        </section>
      </div>
    );
  }

  if (section === "wallet") {
    return (
      <div className="page">
        {header("Carteira", "Plano, carteirinha e dados da familia — sem prontuario clinico.")}
        <section className="panel wide">
          <header>
            <div>
              <HeartPulse />
              <h2>Plano de saude</h2>
            </div>
          </header>
          <div className="form-grid">
            <label className="field">
              <span>Operadora</span>
              <input
                value={health.insurance?.provider ?? ""}
                placeholder="Unimed, Bradesco, particular..."
                onChange={(event) => saveInsurance({ provider: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Carteirinha</span>
              <input
                value={health.insurance?.cardNumber ?? ""}
                onChange={(event) => saveInsurance({ cardNumber: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Vencimento</span>
              <input
                type="date"
                value={health.insurance?.expiresOn ?? ""}
                onChange={(event) => saveInsurance({ expiresOn: event.target.value || undefined })}
              />
            </label>
            <MoneyField
              label="Valor mensal"
              value={health.insurance?.monthlyCost ?? 0}
              onChange={(monthlyCost) => saveInsurance({ monthlyCost: monthlyCost || undefined })}
            />
          </div>
        </section>

        {people.map((person) => {
          const profile = health.profiles.find((item) => item.personId === person.id);
          return (
            <section key={person.id} className="panel wide">
              <header>
                <div>
                  <HeartPulse />
                  <h2>{person.name || (person.role === "primary" ? "Voce" : "Familiar")}</h2>
                </div>
              </header>
              <div className="form-grid">
                <label className="field">
                  <span>Tipo sanguineo</span>
                  <input value={profile?.bloodType ?? ""} onChange={(event) => saveProfile(person.id, { bloodType: event.target.value })} />
                </label>
                <label className="field">
                  <span>Alergias</span>
                  <input value={profile?.allergies ?? ""} onChange={(event) => saveProfile(person.id, { allergies: event.target.value })} />
                </label>
                <label className="field">
                  <span>Contato de emergencia</span>
                  <input
                    value={profile?.emergencyContact ?? ""}
                    onChange={(event) => saveProfile(person.id, { emergencyContact: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Medicos de referencia</span>
                  <input value={profile?.doctors ?? ""} onChange={(event) => saveProfile(person.id, { doctors: event.target.value })} />
                </label>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  if (section === "appointments") {
    return (
      <div className="page">
        {header("Consultas", "Cadastre a consulta aqui. Ela aparece na agenda geral da Rotina e a Secretaria avisa no WhatsApp.")}
        <section className="panel wide">
          <header>
            <div>
              <Plus />
              <h2>{editingAppointmentId ? "Editar consulta" : "Nova consulta"}</h2>
            </div>
          </header>
          <div className="form-grid">
            <label className="field">
              <span>Titulo</span>
              <input
                value={appointmentDraft.title}
                placeholder="Dentista, exame de sangue..."
                onChange={(event) => setAppointmentDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select
                value={appointmentDraft.kind}
                onChange={(event) => setAppointmentDraft((current) => ({ ...current, kind: event.target.value as HealthAppointmentKind }))}
              >
                {appointmentKindOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {personSelect(appointmentDraft.personId, (personId) => setAppointmentDraft((current) => ({ ...current, personId })))}
            <label className="field">
              <span>Data</span>
              <input
                type="date"
                value={appointmentDraft.date}
                onChange={(event) => setAppointmentDraft((current) => ({ ...current, date: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Horario</span>
              <input
                type="time"
                value={appointmentDraft.time}
                onChange={(event) => setAppointmentDraft((current) => ({ ...current, time: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Profissional</span>
              <input
                value={appointmentDraft.professional}
                onChange={(event) => setAppointmentDraft((current) => ({ ...current, professional: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Local</span>
              <input
                value={appointmentDraft.location}
                onChange={(event) => setAppointmentDraft((current) => ({ ...current, location: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Cuidado periodico</span>
              <select
                value={appointmentDraft.careId}
                onChange={(event) => setAppointmentDraft((current) => ({ ...current, careId: event.target.value }))}
              >
                <option value="">Nenhum</option>
                {health.cares.map((care) => (
                  <option key={care.id} value={care.id}>
                    {care.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Lembrar no WhatsApp</span>
              <select
                value={appointmentDraft.remindOnWhatsApp ? "yes" : "no"}
                onChange={(event) => setAppointmentDraft((current) => ({ ...current, remindOnWhatsApp: event.target.value === "yes" }))}
              >
                <option value="yes">Sim, vespera, 3h, 1h antes e check 2h depois</option>
                <option value="no">Nao</option>
              </select>
            </label>
          </div>
          <button className="primary-button" type="button" onClick={saveAppointment}>
            <Plus size={16} /> {editingAppointmentId ? "Salvar consulta" : "Cadastrar na agenda"}
          </button>
        </section>

        <section className="panel wide">
          <header>
            <div>
              <HeartPulse />
              <h2>Consultas marcadas</h2>
            </div>
          </header>
          {health.appointments.length === 0 && (
            <div className="empty-state">
              <span>Nenhuma consulta ainda</span>
              <small>Ao cadastrar, ela entra na Rotina.</small>
            </div>
          )}
          {health.appointments
            .slice()
            .sort((left, right) => left.start.localeCompare(right.start))
            .map((appointment) => (
              <article key={appointment.id} className="list-row">
                <span className="list-row-icon">
                  <CalendarDays size={18} />
                </span>
                <div className="list-row-copy secretary-alert">
                  <strong>{appointment.done ? `${appointment.title} (feito)` : appointment.title}</strong>
                  <span>
                    {formatWhen(appointment.start, timezone)} · {personName(plan, appointment.personId)}
                    {appointment.location ? ` · ${appointment.location}` : ""}
                    {appointment.remindOnWhatsApp ? " · Secretaria: vespera, 3h, 1h e check 2h depois" : ""}
                  </span>
                </div>
                <div className="secretary-alert-actions">
                  {!appointment.done && (
                    <button className="secondary-button" type="button" onClick={() => apply(markHealthAppointmentDone(plan, appointment.id))}>
                      Marquei como feito
                    </button>
                  )}
                  <button className="secondary-button" type="button" onClick={() => editAppointment(appointment)}>
                    Editar
                  </button>
                  <button className="icon-button" type="button" onClick={() => apply(removeHealthAppointment(plan, appointment.id))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
        </section>

        <section className="panel wide">
          <header>
            <div>
              <Activity />
              <h2>Cuidados periodicos</h2>
            </div>
          </header>
          <p className="panel-note">Cadencia, nao horario. Quando marcar a consulta, ela cai na agenda da Rotina.</p>
          <div className="secretary-templates">
            {defaultHealthCares().map((template) => (
              <button
                key={template.title}
                type="button"
                className="chip-button"
                onClick={() => saveCare({ ...template, personId: people[0]?.id ?? "primary" })}
              >
                {template.title}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Cuidado</span>
              <input
                value={careDraft.title}
                onChange={(event) => setCareDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select
                value={careDraft.kind}
                onChange={(event) => setCareDraft((current) => ({ ...current, kind: event.target.value as HealthCareKind }))}
              >
                {careKindOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {personSelect(careDraft.personId, (personId) => setCareDraft((current) => ({ ...current, personId })))}
            <label className="field">
              <span>Intervalo (meses)</span>
              <input
                inputMode="numeric"
                value={String(careDraft.intervalMonths)}
                onChange={(event) => setCareDraft((current) => ({ ...current, intervalMonths: Number(event.target.value) || 12 }))}
              />
            </label>
            <label className="field">
              <span>Ultima vez</span>
              <input
                type="date"
                value={careDraft.lastDoneOn}
                onChange={(event) => setCareDraft((current) => ({ ...current, lastDoneOn: event.target.value }))}
              />
            </label>
          </div>
          <button className="secondary-button" type="button" onClick={() => saveCare()}>
            <Plus size={16} /> Adicionar cuidado
          </button>
          {health.cares.map((care) => {
            const status = healthCareStatus(care);
            return (
              <article key={care.id} className="list-row">
                <span className="list-row-icon">
                  <Activity size={18} />
                </span>
                <div className="list-row-copy secretary-alert">
                  <strong>{care.title}</strong>
                  <span>
                    {personName(plan, care.personId)} · a cada {care.intervalMonths} meses · {healthCareStatusLabels[status]}
                  </span>
                </div>
                <div className="secretary-alert-actions">
                  <button className="secondary-button" type="button" onClick={() => apply(markHealthCareDone(plan, care.id))}>
                    Fiz agora
                  </button>
                  <button className="icon-button" type="button" onClick={() => apply(removeHealthCare(plan, care.id))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      {header("Medicamentos", "A Secretaria cobra o continuo no WhatsApp e avisa quando a receita vence.")}
      <section className="panel wide">
        <header>
          <div>
            <Pill />
            <h2>{editingMedId ? "Editar medicamento" : "Novo medicamento"}</h2>
          </div>
        </header>
        <div className="form-grid">
          <label className="field">
            <span>Nome</span>
            <input value={medDraft.name} onChange={(event) => setMedDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          {personSelect(medDraft.personId, (personId) => setMedDraft((current) => ({ ...current, personId })))}
          <label className="field">
            <span>Dosagem</span>
            <input value={medDraft.dosage} onChange={(event) => setMedDraft((current) => ({ ...current, dosage: event.target.value }))} />
          </label>
          <label className="field">
            <span>Validade da receita</span>
            <input
              type="date"
              value={medDraft.prescriptionExpiresOn}
              onChange={(event) => setMedDraft((current) => ({ ...current, prescriptionExpiresOn: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Estoque / nota</span>
            <input value={medDraft.stockNote} onChange={(event) => setMedDraft((current) => ({ ...current, stockNote: event.target.value }))} />
          </label>
          <label className="field">
            <span>Lembrar de tomar</span>
            <select
              value={medDraft.remindOnWhatsApp ? "yes" : "no"}
              onChange={(event) => setMedDraft((current) => ({ ...current, remindOnWhatsApp: event.target.value === "yes" }))}
            >
              <option value="yes">Sim, todo dia no WhatsApp</option>
              <option value="no">Nao</option>
            </select>
          </label>
          {medDraft.remindOnWhatsApp && (
            <label className="field">
              <span>Horario do lembrete</span>
              <input
                inputMode="numeric"
                value={String(medDraft.reminderHour)}
                onChange={(event) => setMedDraft((current) => ({ ...current, reminderHour: Number(event.target.value) || 0 }))}
              />
            </label>
          )}
        </div>
        <button className="primary-button" type="button" onClick={saveMed}>
          <Bell size={16} /> {editingMedId ? "Salvar medicamento" : "Cadastrar e lembrar"}
        </button>
      </section>

      <section className="panel wide">
        <header>
          <div>
            <Pill />
            <h2>Continuos</h2>
          </div>
        </header>
        {health.medications.length === 0 && (
          <div className="empty-state">
            <span>Nenhum medicamento cadastrado</span>
            <small>A Secretaria pode cobrar o continuo no WhatsApp.</small>
          </div>
        )}
        {health.medications.map((medication) => (
          <article key={medication.id} className="list-row">
            <span className="list-row-icon">
              <Pill size={18} />
            </span>
            <div className="list-row-copy secretary-alert">
              <strong>{medication.name}</strong>
              <span>
                {personName(plan, medication.personId)}
                {medication.dosage ? ` · ${medication.dosage}` : ""}
                {medication.remindOnWhatsApp ? ` · WhatsApp as ${String(medication.reminderHour).padStart(2, "0")}h` : ""}
                {medication.prescriptionExpiresOn ? ` · receita ${medication.prescriptionExpiresOn}` : ""}
              </span>
            </div>
            <div className="secretary-alert-actions">
              <button className="secondary-button" type="button" onClick={() => editMed(medication)}>
                Editar
              </button>
              <button className="icon-button" type="button" onClick={() => apply(removeHealthMedication(plan, medication.id))}>
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
