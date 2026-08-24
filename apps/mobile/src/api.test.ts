import * as SecureStore from "expo-secure-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./api.js";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}));

describe("apiRequest", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true })
      })
    );
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue("stored-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sets Authorization from secure store when no token is passed", async () => {
    await apiRequest("/plans/test");

    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = init?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer stored-token");
  });

  it("uses an explicit token when provided", async () => {
    await apiRequest("/plans/test", undefined, "inline-token");

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = init?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer inline-token");
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  });

  it("throws ApiError when the response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Sessao expirada." })
    } as Response);

    const error = await apiRequest("/session").catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: "Sessao expirada.",
      status: 401
    });
  });
});
