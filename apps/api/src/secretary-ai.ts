import { isShoppingSector, shoppingSectors, type SecretaryIntent, type ShoppingSector } from "@mylyfe/domain";

const systemPrompt = `Voce e a secretaria do MyLyfe. Leia a mensagem do usuario em portugues e devolva SOMENTE um JSON:
{"intents":[ ... ]}

Tipos de intent:
- {"type":"book_event","title":"Entrevista","time":"16:30","date":"2026-08-20","contextId":"context-work"}
- {"type":"book_health","title":"Fisioterapia","time":"11:00","date":"2026-08-21","kind":"other"}
- {"type":"book_series","title":"Fisioterapia","time":"11:00","weekdays":[1,2,3,4,5],"calendarDays":15,"destination":"health"}
- {"type":"add_expense","merchant":"iFood","amount":77.9,"category":"food","date":"2026-08-19"}
- {"type":"add_expense","merchant":"Netflix","amount":55.9,"category":"subscriptions","frequency":"monthly","date":"2026-08-20"}
- {"type":"enable_reminders","title":"Fisioterapia"}
- {"type":"ask","message":"texto curto pedindo um dado que faltou"}
- {"type":"alert_reply"}

Regras:
- date no formato YYYY-MM-DD no fuso America/Sao_Paulo.
- time no formato HH:MM. "agora as 14:30" = hoje nesse horario.
- "segunda/terca/..." sem "toda" ou "de X a Y" e a PROXIMA ocorrencia daquele dia. Nao invente outra data.
- Se hoje ja e o dia citado e o horario ainda nao passou, use hoje.
- entrevista, reuniao, call, daily, almoco, cafe = book_event (nao saude).
- consulta, exame, fisioterapia, vacina, dentista, pilates = book_health ou book_series.
- comprei/gastei/ifood/uber + valor = add_expense. date = ontem/hoje/dd/mm se a pessoa citar; se nao citar, use hoje. NUNCA invente outra data.
- todo mes/mensal/assinatura/mensalidade = frequency monthly. toda semana = weekly. quinzenal = biweekly. trimestral = quarterly. anual = annual.
- Compra unica (ontem comprei, gastei hoje) NUNCA e recorrente. So use frequency se a pessoa pedir recorrencia.
- Categorias: iFood/Rappi/Starbucks/mercado=food. Uber/99/gasolina=transport. Netflix/Spotify=subscriptions. farmacia=health. aluguel=housing. passagem/Latam=travel.
- NUNCA troque o estabelecimento. gasolina nao e Uber.
- sim/nao/amanha sozinho = alert_reply.
- Se faltar horario de um compromisso, use ask. NUNCA invente horario nem data.
- Nao invente valor.`;

const isIntent = (value: unknown): value is SecretaryIntent => {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "book_event" ||
    type === "book_health" ||
    type === "book_series" ||
    type === "add_expense" ||
    type === "enable_reminders" ||
    type === "ask" ||
    type === "alert_reply"
  );
};

export const interpretSecretaryMessageWithAi = async (
  text: string,
  now = new Date(),
  timeZone = "America/Sao_Paulo"
): Promise<SecretaryIntent[] | null> => {
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
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Agora: ${now.toISOString()} (${timeZone})\nHoje: ${new Intl.DateTimeFormat("pt-BR", {
            timeZone,
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          }).format(now)}\nMensagem: ${text}`
        }
      ]
    })
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { intents?: unknown; type?: string };
    const list = Array.isArray(parsed.intents) ? parsed.intents : isIntent(parsed) ? [parsed] : [];
    const intents = list.filter(isIntent);
    return intents.length ? intents : null;
  } catch {
    return null;
  }
};

const sectorPrompt = `Voce classifica itens de supermercado brasileiro no setor correto da loja.
Devolva SOMENTE um JSON: {"sector":"mercearia"}

Setores validos: ${shoppingSectors.join(", ")}

Guia:
- hortifruti: frutas, verduras, legumes, ovos, ervas
- padaria: pao, bolo, torrada da padaria
- acougue: carnes, aves, peixes frescos, linguica
- frios: leite, iogurte, queijo, manteiga, presunto, pudim refrigerado
- congelados: sorvete, pronto congelado, frutas congeladas
- mercearia: arroz, feijao, oleo, vinagre, molho, enlatado, cafe em po, coco ralado, champignon
- bebidas: agua, suco, refri, cerveja, cafe gelado pronto
- higiene: shampoo, sabonete, pasta de dente, desodorante, papel higienico
- limpeza: detergente, desinfetante, saco de lixo, cheirinho de banheiro
- pets: racao, areia, petisco
- bazar: faixa, pilha, lampada, utilidades
- outros: so se realmente nao couber

Nao invente outro setor.`;

export const classifyShoppingSectorWithAi = async (name: string): Promise<ShoppingSector | null> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const item = name.trim();
  if (!apiKey || !item) return null;

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
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sectorPrompt },
        { role: "user", content: `Item: ${item}` }
      ]
    })
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { sector?: unknown };
    return isShoppingSector(parsed.sector) && parsed.sector !== "outros" ? parsed.sector : null;
  } catch {
    return null;
  }
};
