import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  apiUrl,
  authTokenStorageKey,
  clearAuthToken,
  emptyToZero,
  formatMoneyDisplay,
  labels,
  monthsLabel,
  parseMoneyInput,
  readAuthToken,
  toDateInput,
  writeAuthToken
} from "./lib";

describe("lib", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("auth token storage", () => {
    it("reads, writes and clears the auth token from localStorage", () => {
      expect(readAuthToken()).toBe("");
      writeAuthToken("secret-token");
      expect(readAuthToken()).toBe("secret-token");
      expect(localStorage.getItem(authTokenStorageKey)).toBe("secret-token");
      clearAuthToken();
      expect(readAuthToken()).toBe("");
      expect(localStorage.getItem(authTokenStorageKey)).toBeNull();
    });
  });

  describe("apiRequest", () => {
    it("adds auth header and json content-type for json bodies", async () => {
      writeAuthToken("abc123");
      const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
      vi.stubGlobal("fetch", fetchMock);

      await apiRequest("/plans/primary", {
        method: "POST",
        body: JSON.stringify({ ok: true })
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${apiUrl}/plans/primary`);
      const headers = init.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer abc123");
      expect(headers.get("Content-Type")).toBe("application/json");
    });

    it("skips content-type for FormData bodies", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
      vi.stubGlobal("fetch", fetchMock);
      const formData = new FormData();
      formData.append("file", "data");

      await apiRequest("/import", { method: "POST", body: formData });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Headers;
      expect(headers.has("Content-Type")).toBe(false);
    });

    it("does not override an existing Authorization header", async () => {
      writeAuthToken("stored-token");
      const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
      vi.stubGlobal("fetch", fetchMock);

      await apiRequest("/auth/me", {
        headers: { Authorization: "Bearer custom" }
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Headers;
      expect(headers.get("Authorization")).toBe("Bearer custom");
    });
  });

  describe("money helpers", () => {
    it("parses emptyToZero from localized strings", () => {
      expect(emptyToZero("")).toBe(0);
      expect(emptyToZero("1.234,56")).toBe(1234.56);
      expect(emptyToZero("abc")).toBe(0);
    });

    it("parses and formats money input", () => {
      expect(parseMoneyInput("1234,5")).toEqual({
        display: "R$ 1.234,5",
        value: 1234.5
      });
      expect(formatMoneyDisplay(1234.5)).toMatch(/1\.234,50/);
      expect(formatMoneyDisplay(0)).toBe("");
    });
  });

  describe("monthsLabel", () => {
    it("formats month labels in portuguese", () => {
      expect(monthsLabel(null)).toBe("Sem prazo estimado");
      expect(monthsLabel(0)).toBe("Alcancada");
      expect(monthsLabel(1)).toBe("1 mes");
      expect(monthsLabel(3)).toBe("3 meses");
      expect(monthsLabel(12)).toBe("1 ano");
      expect(monthsLabel(24)).toBe("2 anos");
      expect(monthsLabel(14)).toBe("1 ano e 2 meses");
    });
  });

  describe("toDateInput", () => {
    it("converts iso dates to yyyy-mm-dd", () => {
      expect(toDateInput("2025-06-15T10:00:00.000Z")).toBe("2025-06-15");
      expect(toDateInput("")).toBe("");
      expect(toDateInput("invalid")).toBe("");
    });
  });

  describe("labels", () => {
    it("includes housing category label", () => {
      expect(labels.category.housing).toBe("Moradia");
    });
  });
});
