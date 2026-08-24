import {
  buildLocalSpendCoachAdvice,
  countSpendCoachQuestions,
  normalizeSpendCoachTurn,
  SPEND_COACH_MAX_QUESTIONS,
  type SpendCoachBrief,
  type SpendCoachMessage,
  type SpendCoachTurn
} from "@mylyfe/domain";

const systemPrompt = `Voce e o consultor de economia do MyLyfe. Fale em portugues, direto e humano.
Recebe o extrato, ganhos, poupanca, dividas, metas e contas do usuario. Use SO esses dados. Nao invente lancamento.

Devolva SOMENTE um JSON em um destes formatos:

Pergunta, quando um gasto grande ou generico impede um conselho bom:
{"status":"question","question":"pergunta curta","about":{"id":"id-da-conta","name":"iFood","amount":890}}

Conselho, quando ja da para ajudar a economizar:
{"status":"advice","summary":"2 ou 3 frases","hotspots":[{"title":"Alimentacao","amount":1200,"why":"porque pesa"}],"cuts":[{"title":"iFood","monthlySave":250,"how":"como reduzir"}],"nextStep":"uma acao desta semana"}

Regras:
- Objetivo: mostrar onde mais gasta e onde da para reduzir.
- Se houver conta duvidosa em "unclear" e ainda nao fez 2 perguntas, faca UMA pergunta objetiva sobre essa conta.
- Nao pergunte aluguel, salario, financiamento ou o que ja esta claro.
- Nao faca mais de uma pergunta por vez.
- Se o usuario pular, nao souber ou voce ja tiver contexto, devolva advice.
- Valores em reais. Seja concreto. Sem enrolacao nem tom de coach vazio.
- Cortes precisam ser realistas com a vida da pessoa.`;

const completeJson = async (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages
    })
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

export const runSpendCoach = async (brief: SpendCoachBrief, history: SpendCoachMessage[] = []): Promise<SpendCoachTurn> => {
  const forceAdvice = countSpendCoachQuestions(history) >= SPEND_COACH_MAX_QUESTIONS;
  const parsed = await completeJson([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Contexto financeiro:\n${JSON.stringify(brief)}\n\nHistorico:\n${JSON.stringify(history)}\n\n${
        forceAdvice ? "Voce ja fez perguntas suficientes. Devolva advice agora." : "Se faltar contexto de alguma conta, pergunte. Senao, aconselhe."
      }`
    }
  ]);
  return normalizeSpendCoachTurn(parsed, forceAdvice) ?? buildLocalSpendCoachAdvice(brief);
};
