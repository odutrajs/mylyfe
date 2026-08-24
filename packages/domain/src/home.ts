import {
  classifyShoppingSector,
  foldShoppingName,
  groupShoppingItemsBySector,
  isShoppingSector,
  normalizeShoppingSectorMemory,
  rememberShoppingSector
} from "./shopping-sector.js";
import type {
  FinancePlan,
  HomeModuleState,
  OwnerId,
  ShoppingItem,
  ShoppingItemStatus,
  ShoppingList,
  ShoppingSector,
  ShoppingSectorMemory
} from "./types.js";

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

const normalizeItem = (
  item: Partial<ShoppingItem>,
  index: number,
  memory?: ShoppingSectorMemory,
  siblings?: Array<Partial<ShoppingItem>>
): ShoppingItem => {
  const name = titleCase(asString(item.name)) || asString(item.name).trim();
  return {
    id: asString(item.id) || `item-${index + 1}`,
    name,
    quantity: Number(item.quantity) > 0 ? Number(item.quantity) : undefined,
    sector: isShoppingSector(item.sector)
      ? item.sector
      : classifyShoppingSector(name, { memory, items: siblings as ShoppingItem[] }),
    addedByPersonId: asString(item.addedByPersonId) || undefined,
    addedByPhone: asString(item.addedByPhone) || undefined,
    addedByName: asString(item.addedByName).trim() || undefined,
    status: isItemStatus(item.status) ? item.status : "open",
    createdAt: asString(item.createdAt) || defaultUpdatedAt,
    boughtAt: asString(item.boughtAt) || undefined
  };
};

const defaultShoppingList = (): ShoppingList => ({
  id: DEFAULT_SHOPPING_LIST_ID,
  name: "Mercado",
  items: []
});

const normalizeList = (list: Partial<ShoppingList>, index: number, memory?: ShoppingSectorMemory): ShoppingList => ({
  id: asString(list.id) || (index === 0 ? DEFAULT_SHOPPING_LIST_ID : `list-${index + 1}`),
  name: asString(list.name).trim() || "Mercado",
  whatsappGroupJid: normalizeWhatsappGroupJid(list.whatsappGroupJid) || undefined,
  items: (list.items ?? [])
    .map((item, itemIndex, siblings) => normalizeItem(item, itemIndex, memory, siblings))
    .filter((item) => item.name)
});

const MAX_SHOPPING_PURCHASES = 400;

const purchaseTime = (item: ShoppingItem) => Date.parse(item.boughtAt || item.createdAt) || 0;

const sortPurchases = (purchases: ShoppingItem[]) =>
  [...purchases].sort((left, right) => purchaseTime(right) - purchaseTime(left));

const trimPurchases = (purchases: ShoppingItem[]) => sortPurchases(purchases).slice(0, MAX_SHOPPING_PURCHASES);

const rememberPurchase = (purchases: ShoppingItem[], item: ShoppingItem, now: Date) => {
  const recorded: ShoppingItem = {
    ...item,
    status: "bought",
    boughtAt: item.boughtAt || now.toISOString()
  };
  return trimPurchases([recorded, ...purchases.filter((entry) => entry.id !== recorded.id)]);
};

const forgetPurchase = (purchases: ShoppingItem[], itemId: string) =>
  purchases.filter((entry) => entry.id !== itemId);

const collectSectorMemory = (
  lists: ShoppingList[],
  purchases: ShoppingItem[],
  memory: ShoppingSectorMemory
): ShoppingSectorMemory => {
  let next = memory;
  for (const list of lists) {
    for (const item of list.items) {
      next = rememberShoppingSector(next, item.name, item.sector);
    }
  }
  for (const item of purchases) {
    next = rememberShoppingSector(next, item.name, item.sector);
  }
  return next;
};

const normalizePurchases = (
  purchases: Array<Partial<ShoppingItem>> | undefined,
  lists: ShoppingList[],
  memory?: ShoppingSectorMemory
) => {
  const fromHistory = (purchases ?? [])
    .map((item, index, siblings) => normalizeItem(item, index, memory, siblings))
    .filter((item) => item.name)
    .map((item) => ({
      ...item,
      status: "bought" as const,
      boughtAt: item.boughtAt || item.createdAt
    }));
  const known = new Set(fromHistory.map((item) => item.id));
  const fromLists = lists
    .flatMap((list) => list.items.filter((item) => item.status === "bought"))
    .filter((item) => !known.has(item.id))
    .map((item) => ({
      ...item,
      boughtAt: item.boughtAt || item.createdAt
    }));
  return trimPurchases([...fromHistory, ...fromLists]);
};

export const defaultHomeModuleState = (): HomeModuleState => ({
  lists: [defaultShoppingList()],
  purchases: [],
  sectorMemory: {},
  updatedAt: defaultUpdatedAt
});

export const normalizeHomeModuleState = (state?: Partial<HomeModuleState> | null): HomeModuleState => {
  const sectorMemory = normalizeShoppingSectorMemory(state?.sectorMemory);
  const lists = (state?.lists ?? []).map((list, index) => normalizeList(list, index, sectorMemory)).filter((list) => list.id);
  if (!lists.length) {
    return defaultHomeModuleState();
  }
  if (!lists.some((list) => list.id === DEFAULT_SHOPPING_LIST_ID)) {
    lists.unshift(defaultShoppingList());
  }
  const purchases = normalizePurchases(state?.purchases, lists, sectorMemory);
  return {
    lists,
    purchases,
    sectorMemory: collectSectorMemory(lists, purchases, sectorMemory),
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

const itemKey = (name: string) => foldShoppingName(name);

const findOpenItem = (list: ShoppingList, name: string) =>
  list.items.find((item) => item.status === "open" && itemKey(item.name) === itemKey(name));

const findItemByName = (list: ShoppingList, name: string) => {
  const open = findOpenItem(list, name);
  if (open) return open;
  return [...list.items].reverse().find((item) => itemKey(item.name) === itemKey(name));
};

export const formatShoppingItem = (item: Pick<ShoppingItem, "name" | "quantity">) =>
  item.quantity && item.quantity !== 1 ? `${item.quantity} ${item.name}` : item.name;

export const formatShoppingListReply = (list: ShoppingList) => {
  const open = list.items.filter((item) => item.status === "open");
  if (!open.length) return "A lista esta vazia.";
  const groups = groupShoppingItemsBySector(open);
  const body = groups
    .map((group) => `${group.label}\n${group.items.map((item) => `- ${formatShoppingItem(item)}`).join("\n")}`)
    .join("\n\n");
  return `Lista do mercado:\n\n${body}`;
};

export const applyShoppingCommand = (
  list: ShoppingList,
  command: ParsedShoppingCommand,
  actor: ShoppingActor = {},
  now = new Date(),
  memory?: ShoppingSectorMemory
): ShoppingCommandResult => {
  if (command.kind === "ignore") return { list, reply: "", ignored: true };

  if (command.kind === "list") {
    return { list, reply: formatShoppingListReply(list), ignored: false };
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
      sector: classifyShoppingSector(command.name, { memory, items: list.items }),
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

const withHome = (
  plan: FinancePlan,
  now: Date,
  mutate: (home: HomeModuleState) => HomeModuleState
): FinancePlan => {
  const home = normalizeHomeModuleState(plan.home);
  return {
    ...plan,
    home: {
      ...mutate(home),
      updatedAt: now.toISOString()
    }
  };
};

const withList = (
  plan: FinancePlan,
  listId: string,
  now: Date,
  mutate: (list: ShoppingList) => ShoppingList,
  memory?: ShoppingSectorMemory
): FinancePlan =>
  withHome(plan, now, (home) => ({
    ...home,
    lists: home.lists.map((list) => (list.id === listId ? mutate(list) : list)),
    sectorMemory: memory ?? home.sectorMemory
  }));

export const applyShoppingInboxToPlan = (
  plan: FinancePlan,
  listId: string,
  text: string,
  actor: ShoppingActor = {},
  now = new Date()
) => {
  const home = normalizeHomeModuleState(plan.home);
  const list = home.lists.find((item) => item.id === listId);
  if (!list) return { plan, reply: "", ignored: true as const, listId, addedItemId: undefined as string | undefined };

  const command = parseShoppingCommand(text);
  const result = applyShoppingCommand(list, command, actor, now, home.sectorMemory);
  if (result.ignored) return { plan, reply: "", ignored: true as const, listId, addedItemId: undefined as string | undefined };

  const added =
    command.kind === "add"
      ? result.list.items.find((item) => !list.items.some((current) => current.id === item.id))
      : undefined;
  const newlyBought =
    command.kind === "buy"
      ? result.list.items.filter(
          (item) => item.status === "bought" && !list.items.some((current) => current.id === item.id && current.status === "bought")
        )
      : [];
  const sectorMemory = added ? rememberShoppingSector(home.sectorMemory, added.name, added.sector) : home.sectorMemory;

  return {
    plan: withHome(plan, now, (current) => ({
      ...current,
      lists: current.lists.map((entry) => (entry.id === listId ? result.list : entry)),
      sectorMemory,
      purchases: newlyBought.reduce((purchases, item) => rememberPurchase(purchases, item, now), current.purchases)
    })),
    reply: result.reply,
    ignored: false as const,
    listId,
    addedItemId: added?.id
  };
};

export const setShoppingItemStatus = (
  plan: FinancePlan,
  listId: string,
  itemId: string,
  status: ShoppingItemStatus,
  now = new Date()
) =>
  withHome(plan, now, (home) => {
    const current = home.lists.find((list) => list.id === listId)?.items.find((item) => item.id === itemId);
    if (!current) return home;
    const nextItem: ShoppingItem = {
      ...current,
      status,
      boughtAt: status === "bought" ? now.toISOString() : undefined
    };
    return {
      ...home,
      lists: home.lists.map((list) =>
        list.id === listId
          ? { ...list, items: list.items.map((item) => (item.id === itemId ? nextItem : item)) }
          : list
      ),
      purchases:
        status === "bought" ? rememberPurchase(home.purchases, nextItem, now) : forgetPurchase(home.purchases, itemId)
    };
  });

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

export const setShoppingItemSector = (
  plan: FinancePlan,
  listId: string,
  itemId: string,
  sector: ShoppingSector,
  now = new Date()
) => {
  const home = normalizeHomeModuleState(plan.home);
  const item = home.lists.find((list) => list.id === listId)?.items.find((entry) => entry.id === itemId);
  return withList(
    plan,
    listId,
    now,
    (list) => ({
      ...list,
      items: list.items.map((entry) => (entry.id === itemId ? { ...entry, sector } : entry))
    }),
    item ? rememberShoppingSector(home.sectorMemory, item.name, sector) : home.sectorMemory
  );
};

export const removeShoppingItem = (plan: FinancePlan, listId: string, itemId: string, now = new Date()) =>
  withList(plan, listId, now, (list) => ({
    ...list,
    items: list.items.filter((item) => item.id !== itemId)
  }));

export const clearBoughtShoppingItems = (plan: FinancePlan, listId: string, now = new Date()) =>
  withHome(plan, now, (home) => {
    const list = home.lists.find((entry) => entry.id === listId);
    if (!list) return home;
    const bought = list.items.filter((item) => item.status === "bought");
    if (!bought.length) return home;
    return {
      ...home,
      lists: home.lists.map((entry) =>
        entry.id === listId ? { ...entry, items: entry.items.filter((item) => item.status !== "bought") } : entry
      ),
      purchases: bought.reduce((purchases, item) => rememberPurchase(purchases, item, now), home.purchases)
    };
  });

export const shoppingPurchaseDayKey = (item: Pick<ShoppingItem, "boughtAt" | "createdAt">) => {
  const raw = item.boughtAt || item.createdAt;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const shoppingPurchasesInMonth = (state: Partial<HomeModuleState> | null | undefined, month: string) => {
  const home = normalizeHomeModuleState(state);
  return sortPurchases(home.purchases.filter((item) => shoppingPurchaseDayKey(item).startsWith(month)));
};

export const shoppingPurchaseMonths = (state: Partial<HomeModuleState> | null | undefined) => {
  const months = new Set(
    normalizeHomeModuleState(state).purchases.map((item) => shoppingPurchaseDayKey(item).slice(0, 7)).filter(Boolean)
  );
  return [...months].sort().reverse();
};

export const groupShoppingPurchasesByDay = (items: ShoppingItem[]) => {
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of sortPurchases(items)) {
    const day = shoppingPurchaseDayKey(item);
    const current = groups.get(day) ?? [];
    current.push(item);
    groups.set(day, current);
  }
  return [...groups.entries()].map(([day, dayItems]) => ({ day, items: dayItems }));
};

export const summarizeShoppingPurchases = (items: ShoppingItem[]) => ({
  total: items.length,
  unique: new Set(items.map((item) => itemKey(item.name))).size,
  days: new Set(items.map((item) => shoppingPurchaseDayKey(item))).size
});

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
