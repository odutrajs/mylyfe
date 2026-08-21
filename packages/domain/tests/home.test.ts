import { describe, expect, it } from "vitest";
import {
  applyShoppingCommand,
  applyShoppingInboxToPlan,
  createEmptyPlan,
  findShoppingListByGroupJid,
  formatShoppingItem,
  linkShoppingListGroup,
  normalizeWhatsappGroupJid,
  parseShoppingCommand,
  setShoppingItemStatus
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

  it("normalizes a pasted group id", () => {
    expect(normalizeWhatsappGroupJid("120363998877")).toBe("120363998877@g.us");
    expect(normalizeWhatsappGroupJid("120363998877@g.us")).toBe("120363998877@g.us");
  });
});
