import * as SecureStore from "expo-secure-store";

export const authTokenKey = "mylyfe-auth-token";

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "https://feedeo.com.br/api").replace(/\/$/, "");

export type PublicSubscription = {
  status: string;
  trialEnd?: string;
  currentPeriodEnd?: string;
  accessGranted: boolean;
};

export type PublicSession = {
  userId: string;
  planId: string;
  personalPlanId: string;
  name: string;
  email: string;
  hasPushToken: boolean;
  subscription?: PublicSubscription;
};

export const sessionHasAccess = (session?: PublicSession | null) => Boolean(session?.subscription?.accessGranted);

export type AuthResult = {
  token: string;
  session: PublicSession;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const readAuthToken = () => SecureStore.getItemAsync(authTokenKey);

export const writeAuthToken = (token: string) => SecureStore.setItemAsync(authTokenKey, token);

export const clearAuthToken = () => SecureStore.deleteItemAsync(authTokenKey);

export const apiRequest = async (path: string, init?: RequestInit, token?: string) => {
  const headers = new Headers(init?.headers);
  const authToken = token ?? (await readAuthToken()) ?? "";
  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(payload.error || "Nao foi possivel concluir o pedido.", response.status);
  }

  return response;
};
