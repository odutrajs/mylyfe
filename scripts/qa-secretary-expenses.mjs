import { copyFileSync, readFileSync } from "node:fs";

const TOKEN = process.env.SECRETARY_TOKEN || "dev-secretary-token";
const FROM = process.env.SECRETARY_QA_FROM || "4198415276";
const API = process.env.SECRETARY_QA_API || "http://localhost:3333/api/secretary/inbox";
const PLAN = new URL("../apps/api/data/plans/user-taina-gmail-com.json", import.meta.url);
const BACKUP = "/tmp/mylyfe-plan-qa-expenses-backup.json";

const cases = [
  { id: "ifood-hoje", text: "comprei ifood 32,90", kind: "one_off", merchant: "iFood", amount: 32.9, category: "food" },
  { id: "rappi-ontem", text: "ontem gastei 18,90 no rappi", kind: "one_off", merchant: "Rappi", amount: 18.9, category: "food", date: "yesterday" },
  { id: "uber-hoje", text: "uber 24,50", kind: "one_off", merchant: "Uber", amount: 24.5, category: "transport" },
  { id: "gasolina", text: "gastei 80 de gasolina", kind: "one_off", merchant: "Gasolina", amount: 80, category: "transport" },
  { id: "farmacia", text: "paguei farmácia 47", kind: "one_off", merchant: "Farmácia", amount: 47, category: "health" },
  { id: "mercado-data", text: "comprei no mercado 150 no dia 15/08", kind: "one_off", merchant: "Mercado", amount: 150, category: "food", date: "2026-08-15" },
  { id: "starbucks", text: "comprei starbucks 22,40", kind: "one_off", merchant: "Starbucks", amount: 22.4, category: "food" },
  { id: "99", text: "gastei 15 no 99", kind: "one_off", merchant: "99", amount: 15, category: "transport" },
  { id: "latam", text: "comprei passagem latam 890", kind: "one_off", merchant: "Latam", amount: 890, category: "travel" },
  { id: "netflix-avulso", text: "paguei netflix 55,90", kind: "one_off", merchant: "Netflix", amount: 55.9, category: "subscriptions" },
  { id: "aluguel-recorrente", text: "todo mês pago o aluguel 1800", kind: "recurring", merchant: "Aluguel", amount: 1800, category: "housing", frequency: "monthly" },
  { id: "netflix-recorrente", text: "todo mês pago netflix 55,90", kind: "recurring", merchant: "Netflix", amount: 55.9, category: "subscriptions", frequency: "monthly" },
  { id: "spotify-assinatura", text: "assinatura do spotify 21,90", kind: "recurring", merchant: "Spotify", amount: 21.9, category: "subscriptions", frequency: "monthly" },
  { id: "academia", text: "mensalidade da academia 149", kind: "recurring", merchant: "Academia", amount: 149, category: "health", frequency: "monthly" },
  { id: "internet", text: "todo mês pago internet 99,90", kind: "recurring", merchant: "Internet", amount: 99.9, category: "subscriptions", frequency: "monthly" },
  { id: "ifood-semanal", text: "toda semana ifood 80", kind: "recurring", merchant: "iFood", amount: 80, category: "food", frequency: "weekly" },
  { id: "99-quinzenal", text: "quinzenal 99 60", kind: "recurring", merchant: "99", amount: 60, category: "transport", frequency: "biweekly" },
  { id: "saude-trimestral", text: "plano de saúde trimestral 600", kind: "recurring", amount: 600, frequency: "quarterly" },
  { id: "ipva-anual", text: "ipva anual 1200", kind: "recurring", merchant: "IPVA", amount: 1200, category: "taxes", frequency: "annual" },
  { id: "aluguel-dia-10", text: "todo dia 10 pago o aluguel 1800", kind: "recurring", merchant: "Aluguel", amount: 1800, category: "housing", frequency: "monthly", date: "2026-08-10" },
  { id: "gasolina-recorrente", text: "todo mês 400 de gasolina", kind: "recurring", merchant: "Gasolina", amount: 400, category: "transport", frequency: "monthly" },
  { id: "condominio", text: "recorrente condomínio 650", kind: "recurring", merchant: "Condomínio", amount: 650, category: "housing", frequency: "monthly" }
];

const almostEqual = (left, right) => Math.abs(Number(left) - Number(right)) < 0.009;

const datePrefix = (value) => String(value ?? "").slice(0, 10);

const yesterdayKey = () => {
  const now = new Date();
  const wall = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  wall.setDate(wall.getDate() - 1);
  return `${wall.getFullYear()}-${String(wall.getMonth() + 1).padStart(2, "0")}-${String(wall.getDate()).padStart(2, "0")}`;
};

const readPlan = () => JSON.parse(readFileSync(PLAN, "utf8"));

copyFileSync(PLAN, BACKUP);
const baseline = readPlan();

const results = [];
try {
  for (const item of cases) {
    const started = Date.now();
    const response = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, text: item.text })
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = { error: error instanceof Error ? error.message : "json invalido" };
    }

    const plan = readPlan();
    const txs = (plan.transactions ?? []).filter((row) => !(baseline.transactions ?? []).some((item) => item.id === row.id));
    const recs = (plan.recurringTransactions ?? []).filter(
      (row) => !(baseline.recurringTransactions ?? []).some((item) => item.id === row.id)
    );
    const latestTx = txs.at(-1);
    const latestRec = recs.at(-1);
    const errors = [];

    if (response.status !== 200) errors.push(`http ${response.status}`);
    if (item.kind === "one_off") {
      if (!latestTx) errors.push("nao criou transacao");
      if (latestRec && recs.length > txs.length) errors.push("criou recorrente indevido");
      if (item.merchant && latestTx && latestTx.merchant !== item.merchant) errors.push(`merchant ${latestTx.merchant}`);
      if (latestTx && !almostEqual(latestTx.amount, item.amount)) errors.push(`valor ${latestTx.amount}`);
      if (item.category && latestTx && latestTx.category !== item.category) errors.push(`categoria ${latestTx.category}`);
      if (item.date === "yesterday" && latestTx && datePrefix(latestTx.date) !== yesterdayKey()) {
        errors.push(`data ${datePrefix(latestTx.date)}`);
      }
      if (item.date && item.date !== "yesterday" && latestTx && datePrefix(latestTx.date) !== item.date) {
        errors.push(`data ${datePrefix(latestTx.date)}`);
      }
    } else {
      if (!latestRec) errors.push("nao criou recorrente");
      if (item.merchant && latestRec && latestRec.name !== item.merchant) errors.push(`nome ${latestRec.name}`);
      if (latestRec && !almostEqual(latestRec.amount, item.amount)) errors.push(`valor ${latestRec.amount}`);
      if (item.category && latestRec && latestRec.category !== item.category) errors.push(`categoria ${latestRec.category}`);
      if (item.frequency && latestRec && latestRec.frequency !== item.frequency) errors.push(`freq ${latestRec.frequency}`);
      if (item.date && latestRec && datePrefix(latestRec.startDate) !== item.date) {
        errors.push(`inicio ${datePrefix(latestRec.startDate)}`);
      }
    }

    results.push({
      id: item.id,
      text: item.text,
      http: response.status,
      ms: Date.now() - started,
      reply: payload.reply ?? payload.error ?? "",
      ok: errors.length === 0,
      errors
    });
  }
} finally {
  copyFileSync(BACKUP, PLAN);
}

const failed = results.filter((item) => !item.ok);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
