import { describe, expect, it } from "vitest";
import {
  applyShoppingCommand,
  applyShoppingInboxToPlan,
  classifyShoppingSector,
  clearBoughtShoppingItems,
  createEmptyPlan,
  findShoppingListByGroupJid,
  formatShoppingItem,
  formatShoppingListReply,
  groupShoppingPurchasesByDay,
  linkShoppingListGroup,
  normalizeHomeModuleState,
  normalizeWhatsappGroupJid,
  parseShoppingCommand,
  setShoppingItemSector,
  setShoppingItemStatus,
  shoppingPurchasesInMonth,
  summarizeShoppingPurchases
} from "../src/index.js";

describe("shopping command parser", () => {
  it("adds a short grocery name", () => {
    expect(parseShoppingCommand("maionese")).toEqual({ kind: "add", name: "Maionese" });
    expect(parseShoppingCommand("2 leite")).toEqual({ kind: "add", name: "Leite", quantity: 2 });
    expect(parseShoppingCommand("queijo prato x2")).toEqual({ kind: "add", name: "Queijo Prato", quantity: 2 });
  });

  it("parses buy, remove and list commands", () => {
    expect(parseShoppingCommand("comprei maionese")).toEqual({ kind: "buy", name: "Maionese" });
    expect(parseShoppingCommand("ja peguei leite")).toEqual({ kind: "buy", name: "Leite" });
    expect(parseShoppingCommand("tira maionese")).toEqual({ kind: "remove", name: "Maionese" });
    expect(parseShoppingCommand("lista")).toEqual({ kind: "list" });
  });

  it("ignores conversation, questions and urls", () => {
    expect(parseShoppingCommand("vou chegar mais tarde")).toEqual({ kind: "ignore" });
    expect(parseShoppingCommand("maionese?")).toEqual({ kind: "ignore" });
    expect(parseShoppingCommand("olha isso https://exemplo.com")).toEqual({ kind: "ignore" });
    expect(parseShoppingCommand("amanha a gente decide o que comprar no mercado")).toEqual({ kind: "ignore" });
    expect(parseShoppingCommand("Agua Com Gas na lista.")).toEqual({ kind: "ignore" });
    expect(parseShoppingCommand("Lista do mercado:\n- Vinagre")).toEqual({ kind: "ignore" });
  });
});

describe("shopping list mutations", () => {
  const emptyList = { id: "mercado", name: "Mercado", items: [] };

  it("adds, dedups and increments quantity", () => {
    const first = applyShoppingCommand(emptyList, { kind: "add", name: "Maionese" });
    expect(first.reply).toBe("Maionese na lista.");
    expect(first.list.items).toHaveLength(1);

    const again = applyShoppingCommand(first.list, { kind: "add", name: "Maionese" });
    expect(again.reply).toBe("Maionese ja esta na lista.");
    expect(again.list.items).toHaveLength(1);

    const more = applyShoppingCommand(first.list, { kind: "add", name: "Maionese", quantity: 2 });
    expect(more.reply).toBe("Maionese: agora 3.");
    expect(more.list.items[0]?.quantity).toBe(3);
  });

  it("marks bought and lists open items", () => {
    const added = applyShoppingCommand(emptyList, { kind: "add", name: "Leite", quantity: 2 });
    const bought = applyShoppingCommand(added.list, { kind: "buy", name: "Leite" });
    expect(bought.reply).toBe("Marquei Leite.");
    expect(bought.list.items[0]?.status).toBe("bought");

    const listed = applyShoppingCommand(bought.list, { kind: "list" });
    expect(listed.reply).toBe("A lista esta vazia.");
  });

  it("formats quantity when it is not 1", () => {
    expect(formatShoppingItem({ name: "Leite", quantity: 2 })).toBe("2 Leite");
    expect(formatShoppingItem({ name: "Maionese" })).toBe("Maionese");
  });

  it("stores the aisle when adding and lists items by sector", () => {
    const names = [
      "Vinagre",
      "Frutas Congeladas",
      "Agua Com Gas",
      "Shampoo Anti Caspa",
      "Cheirinho De Banheiro (pastilha)",
      "Iogurte Zero",
      "Pudim Batavo",
      "Cafe Gelado Pingado",
      "Suco Dell Vale",
      "Faixa",
      "Champignon",
      "Coco Ralado",
      "Cheiro Verde"
    ];
    const list = names.reduce(
      (current, name) => applyShoppingCommand(current, { kind: "add", name }).list,
      emptyList
    );

    expect(list.items.map((item) => [item.name, item.sector])).toEqual([
      ["Vinagre", "mercearia"],
      ["Frutas Congeladas", "congelados"],
      ["Agua Com Gas", "bebidas"],
      ["Shampoo Anti Caspa", "higiene"],
      ["Cheirinho De Banheiro (pastilha)", "limpeza"],
      ["Iogurte Zero", "frios"],
      ["Pudim Batavo", "frios"],
      ["Cafe Gelado Pingado", "bebidas"],
      ["Suco Dell Vale", "bebidas"],
      ["Faixa", "bazar"],
      ["Champignon", "mercearia"],
      ["Coco Ralado", "mercearia"],
      ["Cheiro Verde", "hortifruti"]
    ]);

    expect(applyShoppingCommand(list, { kind: "list" }).reply).toBe(
      [
        "Lista do mercado:",
        "",
        "Hortifruti",
        "- Cheiro Verde",
        "",
        "Frios e Laticinios",
        "- Iogurte Zero",
        "- Pudim Batavo",
        "",
        "Congelados",
        "- Frutas Congeladas",
        "",
        "Mercearia",
        "- Vinagre",
        "- Champignon",
        "- Coco Ralado",
        "",
        "Bebidas",
        "- Agua Com Gas",
        "- Cafe Gelado Pingado",
        "- Suco Dell Vale",
        "",
        "Higiene",
        "- Shampoo Anti Caspa",
        "",
        "Limpeza",
        "- Cheirinho De Banheiro (pastilha)",
        "",
        "Bazar",
        "- Faixa"
      ].join("\n")
    );
  });
});

describe("home module on the plan", () => {
  it("applies a group message onto the mercado list", () => {
    const plan = linkShoppingListGroup(createEmptyPlan("test"), "mercado", "120363998877@g.us");
    const result = applyShoppingInboxToPlan(plan, "mercado", "maionese", { name: "Taina" });

    expect(result.ignored).toBe(false);
    expect(result.reply).toBe("Maionese na lista.");
    expect(result.plan.home.lists[0]?.items[0]?.addedByName).toBe("Taina");
    expect(findShoppingListByGroupJid(result.plan.home, "120363998877")?.items).toHaveLength(1);
  });

  it("ignores chatter without changing the list", () => {
    const plan = createEmptyPlan("test");
    const result = applyShoppingInboxToPlan(plan, "mercado", "vou chegar mais tarde");
    expect(result.ignored).toBe(true);
    expect(result.plan.home.lists[0]?.items).toHaveLength(0);
  });

  it("toggles bought from the app", () => {
    const added = applyShoppingInboxToPlan(createEmptyPlan("test"), "mercado", "2 leite");
    const itemId = added.plan.home.lists[0]?.items[0]?.id ?? "";
    const bought = setShoppingItemStatus(added.plan, "mercado", itemId, "bought");
    expect(bought.home.lists[0]?.items[0]?.status).toBe("bought");
  });

  it("keeps a monthly history of bought items", () => {
    const now = new Date("2026-08-15T18:00:00.000-03:00");
    const added = applyShoppingInboxToPlan(createEmptyPlan("test"), "mercado", "2 leite", {}, now);
    const itemId = added.plan.home.lists[0]?.items[0]?.id ?? "";
    const bought = setShoppingItemStatus(added.plan, "mercado", itemId, "bought", now);

    expect(bought.home.purchases).toHaveLength(1);
    expect(bought.home.purchases[0]?.name).toBe("Leite");
    expect(shoppingPurchasesInMonth(bought.home, "2026-08")).toHaveLength(1);
    expect(shoppingPurchasesInMonth(bought.home, "2026-07")).toHaveLength(0);

    const reopened = setShoppingItemStatus(bought, "mercado", itemId, "open", now);
    expect(reopened.home.purchases).toHaveLength(0);

    const boughtAgain = setShoppingItemStatus(reopened, "mercado", itemId, "bought", now);
    const cleared = clearBoughtShoppingItems(boughtAgain, "mercado", now);
    expect(cleared.home.lists[0]?.items).toHaveLength(0);
    expect(cleared.home.purchases).toHaveLength(1);
    expect(summarizeShoppingPurchases(cleared.home.purchases)).toEqual({ total: 1, unique: 1, days: 1 });
    expect(groupShoppingPurchasesByDay(cleared.home.purchases)[0]?.day).toBe("2026-08-15");
  });

  it("records a WhatsApp buy into the monthly history", () => {
    const now = new Date("2026-08-20T12:00:00.000-03:00");
    const added = applyShoppingInboxToPlan(createEmptyPlan("test"), "mercado", "maionese", { name: "Taina" }, now);
    const bought = applyShoppingInboxToPlan(added.plan, "mercado", "comprei maionese", { name: "Taina" }, now);
    expect(bought.reply).toBe("Marquei Maionese.");
    expect(bought.plan.home.purchases[0]?.name).toBe("Maionese");
  });

  it("backfills bought items from the list into purchases", () => {
    const home = normalizeHomeModuleState({
      lists: [
        {
          id: "mercado",
          name: "Mercado",
          items: [
            {
              id: "1",
              name: "Vinagre",
              status: "bought",
              createdAt: "2026-08-10T00:00:00.000Z",
              boughtAt: "2026-08-11T00:00:00.000Z"
            }
          ]
        }
      ],
      updatedAt: "2026-08-11T00:00:00.000Z"
    });
    expect(home.purchases).toHaveLength(1);
    expect(home.purchases[0]?.name).toBe("Vinagre");
  });

  it("normalizes a pasted group id", () => {
    expect(normalizeWhatsappGroupJid("120363998877")).toBe("120363998877@g.us");
    expect(normalizeWhatsappGroupJid("120363998877@g.us")).toBe("120363998877@g.us");
  });

  it("backfills sectors and remembers a corrected aisle", () => {
    const home = normalizeHomeModuleState({
      lists: [{ id: "mercado", name: "Mercado", items: [{ id: "1", name: "Vinagre", status: "open", createdAt: "2026-08-22T00:00:00.000Z" }] }],
      updatedAt: "2026-08-22T00:00:00.000Z"
    });
    expect(home.lists[0]?.items[0]?.sector).toBe("mercearia");
    expect(home.sectorMemory.vinagre).toBe("mercearia");

    const plan = createEmptyPlan("test");
    const added = applyShoppingInboxToPlan(plan, "mercado", "faixa");
    const itemId = added.plan.home.lists[0]?.items[0]?.id ?? "";
    const corrected = setShoppingItemSector(added.plan, "mercado", itemId, "higiene");
    expect(corrected.home.lists[0]?.items[0]?.sector).toBe("higiene");
    expect(corrected.home.sectorMemory.faixa).toBe("higiene");
  });
});

describe("shopping sector classifier", () => {
  it("prefers the more specific aisle", () => {
    expect(classifyShoppingSector("Frutas Congeladas")).toBe("congelados");
    expect(classifyShoppingSector("Cafe Gelado Pingado")).toBe("bebidas");
    expect(classifyShoppingSector("Cafe")).toBe("mercearia");
    expect(classifyShoppingSector("Champignon")).toBe("mercearia");
    expect(classifyShoppingSector("Maionese")).toBe("mercearia");
    expect(formatShoppingListReply({ id: "mercado", name: "Mercado", items: [] })).toBe("A lista esta vazia.");
  });
});
