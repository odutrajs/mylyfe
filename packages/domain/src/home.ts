import type { FinancePlan, HomeModuleState, OwnerId, ShoppingItem, ShoppingItemStatus, ShoppingList } from "./types.js";

const defaultUpdatedAt = "1970-01-01T00:00:00.000Z";

export const DEFAULT_SHOPPING_LIST_ID = "mercado";

export type ShoppingCommandKind = "add" | "buy" | "remove" | "list" | "ignore";

export interface ParsedShoppingCommand {
  kind: ShoppingCommandKind;
  name?: string;
  quantity?: number;
}

export interface ShoppingActor {
  personId?: OwnerId;
  phone?: string;
  name?: string;
}

export interface ShoppingCommandResult {
  list: ShoppingList;
  reply: string;
  ignored: boolean;
}

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[•–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const titleCase = (value: string) =>
  fold(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const chatterPrefix =
  /^(vou|vamos|to |estou|depois|ok\b|beleza|valeu|obrigad|oi\b|oie\b|eae\b|blz\b|pode\b|espera|pera\b|calma|aham|bom dia|boa tarde|boa noite|sim\b|nao\b|kkk|haha|rs\b|ta\b|hmm|acho|precisa|quem\b|onde\b|quando|porque|por que|ja to|ja estou)/;

const parseQuantity = (raw: string) => {
  const parsed = Number(raw.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const parseNamedItem = (raw: string): { name: string; quantity?: number } | undefined => {
  const text = fold(raw);
  if (!text) return undefined;

  const lead = text.match(/^(\d+(?:[.,]\d+)?)\s+(?:x\s+)?(.+)$/);
  if (lead?.[1] && lead[2]) {
    const quantity = parseQuantity(lead[1]);
    const name = titleCase(lead[2]);
    return name ? { name, quantity } : undefined;
  }

  const trailX = text.match(/^(.+?)\s+x\s*(\d+(?:[.,]\d+)?)$/);
  if (trailX?.[1] && trailX[2]) {
    const name = titleCase(trailX[1]);
    return name ? { name, quantity: parseQuantity(trailX[2]) } : undefined;
  }

  const trail = text.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)$/);
  if (trail?.[1] && trail[2]) {
    const name = titleCase(trail[1]);
    return name ? { name, quantity: parseQuantity(trail[2]) } : undefined;
  }

  const name = titleCase(text);
  return name ? { name } : undefined;
};

export const parseShoppingCommand = (text: string): ParsedShoppingCommand => {
  const folded = fold(text);
  if (!folded) return { kind: "ignore" };
  if (folded.includes("?") || /https?:\/\//.test(folded) || /\bwww\./.test(folded) || folded.includes("@")) {
    return { kind: "ignore" };
  }

  if (/^(lista|listar|o que falta|o q falta)$/.test(folded)) return { kind: "list" };
  if (
    folded.startsWith("lista do mercado") ||
    / na lista\.?$/.test(folded) ||
    / ja esta na lista\.?$/.test(folded) ||
    /^(marquei |tirei |nao achei )/.test(folded)
  ) {
    return { kind: "ignore" };
  }

  const buy = folded.match(/^(?:comprei|peguei|ja (?:peguei|comprei)|ja pega)\s+(.+)$/);
  if (buy?.[1]) {
    const item = parseNamedItem(buy[1]);
    return item ? { kind: "buy", name: item.name } : { kind: "ignore" };
  }

  const remove = folded.match(/^(?:tira|tirar|remove|remover|apaga|apagar)(?:\s+da\s+lista)?\s+(.+)$/);
  if (remove?.[1]) {
    const item = parseNamedItem(remove[1]);
    return item ? { kind: "remove", name: item.name } : { kind: "ignore" };
  }

  if (folded.split(" ").length > 6 || chatterPrefix.test(folded)) return { kind: "ignore" };

  const item = parseNamedItem(folded);
  return item ? { kind: "add", name: item.name, quantity: item.quantity } : { kind: "ignore" };
};

export const normalizeWhatsappGroupJid = (value?: string | null) => {
  const raw = asString(value).trim();
  if (!raw) return "";
  if (raw.endsWith("@g.us")) return raw;
  const id = raw.replace(/[^\d-]/g, "");
  return id ? `${id}@g.us` : "";
};

const isItemStatus = (value: unknown): value is ShoppingItemStatus => value === "open" || value === "bought";

const normalizeItem = (item: Partial<ShoppingItem>, index: number): ShoppingItem => ({
  id: asString(item.id) || `item-${index + 1}`,
  name: titleCase(asString(item.name)) || asString(item.name).trim(),
  quantity: Number(item.quantity) > 0 ? Number(item.quantity) : undefined,
  addedByPersonId: asString(item.addedByPersonId) || undefined,
  addedByPhone: asString(item.addedByPhone) || undefined,
  addedByName: asString(item.addedByName).trim() || undefined,
  status: isItemStatus(item.status) ? item.status : "open",
  createdAt: asString(item.createdAt) || defaultUpdatedAt,
  boughtAt: asString(item.boughtAt) || undefined
});

const defaultShoppingList = (): ShoppingList => ({
  id: DEFAULT_SHOPPING_LIST_ID,
  name: "Mercado",
  items: []
});

const normalizeList = (list: Partial<ShoppingList>, index: number): ShoppingList => ({
  id: asString(list.id) || (index === 0 ? DEFAULT_SHOPPING_LIST_ID : `list-${index + 1}`),
  name: asString(list.name).trim() || "Mercado",
  whatsappGroupJid: normalizeWhatsappGroupJid(list.whatsappGroupJid) || undefined,
  items: (list.items ?? []).map(normalizeItem).filter((item) => item.name)
});

export const defaultHomeModuleState = (): HomeModuleState => ({
  lists: [defaultShoppingList()],
  updatedAt: defaultUpdatedAt
});

export const normalizeHomeModuleState = (state?: Partial<HomeModuleState> | null): HomeModuleState => {
  const lists = (state?.lists ?? []).map(normalizeList).filter((list) => list.id);
  if (!lists.length) {
    return defaultHomeModuleState();
  }
  if (!lists.some((list) => list.id === DEFAULT_SHOPPING_LIST_ID)) {
    lists.unshift(defaultShoppingList());
  }
  return {
    lists,
    updatedAt: asString(state?.updatedAt) || defaultUpdatedAt
  };
};

export const pickHomeModuleState = (
  incoming?: Partial<HomeModuleState> | null,
  existing?: Partial<HomeModuleState> | null
) => {
  if (!incoming) return normalizeHomeModuleState(existing);
  if (!existing) return normalizeHomeModuleState(incoming);

  const incomingTime = Date.parse(incoming.updatedAt ?? "") || 0;
  const existingTime = Date.parse(existing.updatedAt ?? "") || 0;
  return normalizeHomeModuleState(incomingTime >= existingTime ? incoming : existing);
};

export const createShoppingId = (prefix: string, now = new Date()) =>
  `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const defaultShoppingListOf = (state?: Partial<HomeModuleState> | null) => {
  const home = normalizeHomeModuleState(state);
  return home.lists.find((list) => list.id === DEFAULT_SHOPPING_LIST_ID) ?? home.lists[0];
};

export const findShoppingListByGroupJid = (state: HomeModuleState | undefined, groupJid: string) => {
  const jid = normalizeWhatsappGroupJid(groupJid);
  if (!jid) return undefined;
  return normalizeHomeModuleState(state).lists.find((list) => list.whatsappGroupJid === jid);
};

const itemKey = (name: string) => fold(name);

const findOpenItem = (list: ShoppingList, name: string) =>
  list.items.find((item) => item.status === "open" && itemKey(item.name) === itemKey(name));

const findItemByName = (list: ShoppingList, name: string) => {
  const open = findOpenItem(list, name);
  if (open) return open;
  return [...list.items].reverse().find((item) => itemKey(item.name) === itemKey(name));
};

export const formatShoppingItem = (item: Pick<ShoppingItem, "name" | "quantity">) =>
  item.quantity && item.quantity !== 1 ? `${item.quantity} ${item.name}` : item.name;

const formatListReply = (list: ShoppingList) => {
  const open = list.items.filter((item) => item.status === "open");
  if (!open.length) return "A lista esta vazia.";
  return `Lista do mercado:\n${open.map((item) => `- ${formatShoppingItem(item)}`).join("\n")}`;
};

export const applyShoppingCommand = (
  list: ShoppingList,
  command: ParsedShoppingCommand,
  actor: ShoppingActor = {},
  now = new Date()
): ShoppingCommandResult => {
  if (command.kind === "ignore") return { list, reply: "", ignored: true };

  if (command.kind === "list") {
    return { list, reply: formatListReply(list), ignored: false };
  }

  if (!command.name) return { list, reply: "", ignored: true };

  if (command.kind === "add") {
    const existing = findOpenItem(list, command.name);
    if (existing) {
      if (!existing.quantity && !command.quantity) {
        return { list, reply: `${existing.name} ja esta na lista.`, ignored: false };
      }
      const quantity = (existing.quantity ?? 1) + (command.quantity ?? 1);
      return {
        list: {
          ...list,
          items: list.items.map((item) => (item.id === existing.id ? { ...item, quantity } : item))
        },
        reply: `${existing.name}: agora ${quantity}.`,
        ignored: false
      };
    }

    const item: ShoppingItem = {
      id: createShoppingId("item", now),
      name: command.name,
      quantity: command.quantity,
      addedByPersonId: actor.personId,
      addedByPhone: actor.phone,
      addedByName: actor.name?.trim() || undefined,
      status: "open",
      createdAt: now.toISOString()
    };
    return {
      list: { ...list, items: [...list.items, item] },
      reply: `${formatShoppingItem(item)} na lista.`,
      ignored: false
    };
  }

  const existing = findItemByName(list, command.name);
  if (!existing) {
    return { list, reply: `Nao achei ${command.name} na lista.`, ignored: false };
  }

  if (command.kind === "buy") {
    if (existing.status === "bought") {
      return { list, reply: `${existing.name} ja estava marcada.`, ignored: false };
    }
    return {
      list: {
        ...list,
        items: list.items.map((item) =>
          item.id === existing.id ? { ...item, status: "bought", boughtAt: now.toISOString() } : item
        )
      },
      reply: `Marquei ${existing.name}.`,
      ignored: false
    };
  }

  return {
    list: { ...list, items: list.items.filter((item) => item.id !== existing.id) },
    reply: `Tirei ${existing.name}.`,
    ignored: false
  };
};

const withList = (plan: FinancePlan, listId: string, now: Date, mutate: (list: ShoppingList) => ShoppingList): FinancePlan => {
  const home = normalizeHomeModuleState(plan.home);
  return {
    ...plan,
    home: {
      ...home,
      lists: home.lists.map((list) => (list.id === listId ? mutate(list) : list)),
      updatedAt: now.toISOString()
    }
  };
};

export const applyShoppingInboxToPlan = (
  plan: FinancePlan,
  listId: string,
  text: string,
  actor: ShoppingActor = {},
  now = new Date()
) => {
  const home = normalizeHomeModuleState(plan.home);
  const list = home.lists.find((item) => item.id === listId);
  if (!list) return { plan, reply: "", ignored: true as const, listId };

  const result = applyShoppingCommand(list, parseShoppingCommand(text), actor, now);
  if (result.ignored) return { plan, reply: "", ignored: true as const, listId };

  return {
    plan: withList(plan, listId, now, () => result.list),
    reply: result.reply,
    ignored: false as const,
    listId
  };
};

export const setShoppingItemStatus = (
  plan: FinancePlan,
  listId: string,
  itemId: string,
  status: ShoppingItemStatus,
  now = new Date()
) =>
  withList(plan, listId, now, (list) => ({
    ...list,
    items: list.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            status,
            boughtAt: status === "bought" ? now.toISOString() : undefined
          }
        : item
    )
  }));

export const updateShoppingItemQuantity = (
  plan: FinancePlan,
  listId: string,
  itemId: string,
  quantity: number | undefined,
  now = new Date()
) =>
  withList(plan, listId, now, (list) => ({
    ...list,
    items: list.items.map((item) =>
      item.id === itemId ? { ...item, quantity: quantity && quantity > 0 ? quantity : undefined } : item
    )
  }));

export const removeShoppingItem = (plan: FinancePlan, listId: string, itemId: string, now = new Date()) =>
  withList(plan, listId, now, (list) => ({
    ...list,
    items: list.items.filter((item) => item.id !== itemId)
  }));

export const clearBoughtShoppingItems = (plan: FinancePlan, listId: string, now = new Date()) =>
  withList(plan, listId, now, (list) => ({
    ...list,
    items: list.items.filter((item) => item.status !== "bought")
  }));

export const linkShoppingListGroup = (plan: FinancePlan, listId: string, groupJid: string, now = new Date()) =>
  withList(plan, listId, now, (list) => ({
    ...list,
    whatsappGroupJid: normalizeWhatsappGroupJid(groupJid) || undefined
  }));

export const unlinkShoppingListGroup = (plan: FinancePlan, listId: string, now = new Date()) =>
  withList(plan, listId, now, (list) => ({
    ...list,
    whatsappGroupJid: undefined
  }));
