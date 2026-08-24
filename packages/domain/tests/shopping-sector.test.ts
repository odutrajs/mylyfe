import { describe, expect, it } from "vitest";
import {
  classifyShoppingSector,
  foldShoppingName,
  groupShoppingItemsBySector,
  isShoppingSector,
  normalizeShoppingSectorMemory,
  rememberShoppingSector,
  shoppingSectorLabel,
  shoppingSectors
} from "../src/index.js";

describe("shopping sector classifier", () => {
  it("classifies common grocery items into aisles", () => {
    expect(classifyShoppingSector("leite")).toBe("frios");
    expect(classifyShoppingSector("detergente")).toBe("limpeza");
    expect(classifyShoppingSector("banana")).toBe("hortifruti");
    expect(classifyShoppingSector("item inexistente")).toBe("outros");
  });

  it("uses remembered sectors before keyword rules", () => {
    const memory = rememberShoppingSector(undefined, "leite", "mercearia");
    expect(classifyShoppingSector("leite", { memory })).toBe("mercearia");
    expect(classifyShoppingSector("Leite", { memory })).toBe("mercearia");
    expect(classifyShoppingSector("Leite Integral", { memory })).toBe("frios");
  });

  it("reuses a previous non-outros sector from sibling items", () => {
    expect(
      classifyShoppingSector("leite", {
        items: [{ name: "leite", sector: "mercearia" }]
      })
    ).toBe("mercearia");
  });

  it("normalizes memory keys and ignores invalid sectors", () => {
    const memory = normalizeShoppingSectorMemory({
      " Leite ": "mercearia",
      detergente: "limpeza",
      invalido: "farmacia",
      banana: "hortifruti"
    });

    expect(memory).toEqual({
      leite: "mercearia",
      detergente: "limpeza",
      banana: "hortifruti"
    });
    expect(classifyShoppingSector("detergente", { memory })).toBe("limpeza");
  });

  it("folds names and labels sectors consistently", () => {
    expect(foldShoppingName("Leite Integral")).toBe("leite integral");
    expect(isShoppingSector("mercearia")).toBe(true);
    expect(isShoppingSector("farmacia")).toBe(false);
    expect(shoppingSectorLabel("frios")).toBe("Frios e Laticinios");
    expect(shoppingSectorLabel("invalid")).toBe("Outros");
  });

  it("groups items by sector in catalog order", () => {
    const groups = groupShoppingItemsBySector([
      { id: "1", name: "banana", sector: "hortifruti" },
      { id: "2", name: "detergente", sector: "limpeza" },
      { id: "3", name: "leite", sector: "frios" },
      { id: "4", name: "misterio" }
    ]);

    expect(groups.map((group) => group.sector)).toEqual(["hortifruti", "frios", "limpeza", "outros"]);
    expect(groups[0]?.label).toBe("Hortifruti");
    expect(groups.at(-1)?.items).toHaveLength(1);
    expect(shoppingSectors).toContain("outros");
  });

  it("does not remember outros corrections", () => {
    expect(rememberShoppingSector(undefined, "xyz", "outros")).toEqual({});
  });
});
