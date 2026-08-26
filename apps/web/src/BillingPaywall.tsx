import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthButton, AuthChrome, AuthFooter } from "./auth-ui";
import { apiRequest } from "./lib";

export type BillingSubscription = {
  status: string;
  trialEnd?: string;
  currentPeriodEnd?: string;
  accessGranted: boolean;
};

export type AuthedSession = {
  userId: string;
  planId: string;
  name: string;
  email: string;
  personalPlanId?: string;
  subscription?: BillingSubscription;
};

export const sessionHasAccess = (session?: AuthedSession | null) => Boolean(session?.subscription?.accessGranted);

export const planPriceLabel = () => import.meta.env.VITE_PLAN_PRICE_LABEL || "R$ 29,90/mês";

const readBillingPayload = async (response: Response) => {
  const text = await response.text();
  try {
    return JSON.parse(text) as { url?: string; error?: string };
  } catch {
    throw new Error("Nao foi possivel abrir o pagamento. A API ainda nao tem as rotas de billing.");
  }
};

export const goToBillingCheckout = (source?: "web" | "mobile") => {
  const query = source === "mobile" ? "?source=mobile" : "";
  window.location.assign(`/billing/checkout${query}`);
};

export const startBillingCheckout = async (source?: "web" | "mobile") => {
  goToBillingCheckout(source);
};

export const startBillingPortal = async () => {
  const response = await apiRequest("/billing/portal", { method: "POST" });
  const payload = await readBillingPayload(response);
  if (!response.ok || !payload.url) {
    throw new Error(payload.error || "Nao foi possivel abrir o portal.");
  }
  window.location.assign(payload.url);
};

export function BillingPaywall({
  session,
  onSignOut
}: {
  session: AuthedSession;
  onSignOut: () => void;
}) {

  return (
    <main>
      <AuthChrome compact>
        <p className="auth-app-kicker">Falta um passo</p>
        <h1 className="auth-app-title">7 dias para testar.</h1>
        <p className="auth-app-body">
          Sua conta já existe, {session.name.split(" ")[0]}. O cartão entra agora e a cobrança de {planPriceLabel()} só
          começa depois do trial. Cancele quando quiser.
        </p>
        <AuthButton label="Liberar meu acesso" onClick={() => goToBillingCheckout()} />
        <AuthFooter muted="Entrou no e-mail errado?" action="Sair" onClick={onSignOut} />
      </AuthChrome>
    </main>
  );
}

export function BillingCanceled({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main>
      <AuthChrome compact>
        <p className="auth-app-kicker">Pagamento interrompido</p>
        <h1 className="auth-app-title">O trial ainda não começou.</h1>
        <p className="auth-app-body">
          Sem o cartão a gente não libera o app. Você pode retomar agora — ainda sem cobrança pelos próximos 7 dias.
        </p>
        <AuthButton label="Retomar liberação" onClick={() => goToBillingCheckout()} />
        <AuthFooter muted="Quer usar outro e-mail?" action="Sair" onClick={onSignOut} />
      </AuthChrome>
    </main>
  );
}

export function BillingSuccess(props: {
  session?: AuthedSession | null;
  onContinue: (session: AuthedSession) => void;
  onSignOut: () => void;
}) {
  return <BillingResult {...props} />;
}

export function BillingResult({
  session,
  onContinue,
  onSignOut
}: {
  session?: AuthedSession | null;
  onContinue: (session: AuthedSession) => void;
  onSignOut: () => void;
}) {
  const params = new URLSearchParams(window.location.search);
  const hinted =
    params.get("status") === "recusado" || params.get("redirect_status") === "failed"
      ? "declined"
      : params.get("status") === "aprovado" || params.get("redirect_status") === "succeeded"
        ? "approved"
        : "pending";
  const fromMobile = params.get("source") === "mobile";
  const [state, setState] = useState<"pending" | "approved" | "declined">(hinted === "declined" ? "declined" : "pending");
  const [readySession, setReadySession] = useState<AuthedSession | null>(session ?? null);

  useEffect(() => {
    if (hinted === "declined") return;
    let active = true;
    let attempts = 0;

    const poll = async () => {
      try {
        await apiRequest("/billing/sync", { method: "POST" }).catch(() => undefined);
        const response = await apiRequest("/auth/me");
        const payload = (await response.json()) as { session?: AuthedSession };
        if (!response.ok || !payload.session) throw new Error("Sessao invalida");
        if (payload.session.subscription?.accessGranted) {
          if (active) {
            setReadySession(payload.session);
            setState("approved");
          }
          return true;
        }
      } catch {
        // continua tentando; no fim vira recusado
      }
      return false;
    };

    const tick = window.setInterval(() => {
      attempts += 1;
      void poll().then((done) => {
        if (done) {
          window.clearInterval(tick);
          return;
        }
        if (attempts >= 12 && active) {
          window.clearInterval(tick);
          setState("declined");
        }
      });
    }, 1500);

    void poll();
    return () => {
      active = false;
      window.clearInterval(tick);
    };
  }, [hinted]);

  if (state === "pending") {
    return (
      <main>
        <AuthChrome compact>
          <p className="auth-app-kicker">Confirmando pedido</p>
          <h1 className="auth-app-title">Estamos checando seu pagamento.</h1>
          <p className="auth-app-body">Isso leva alguns segundos. Em seguida você continua o cadastro completo.</p>
        </AuthChrome>
      </main>
    );
  }

  if (state === "declined") {
    return (
      <main>
        <AuthChrome compact>
          <div className="billing-result-mark billing-result-mark--bad" aria-hidden="true">
            <X size={28} />
          </div>
          <p className="auth-app-kicker">Pedido recusado</p>
          <h1 className="auth-app-title">Não conseguimos liberar o trial.</h1>
          <p className="auth-app-body">
            O cartão não foi aprovado ou a confirmação falhou. Sua conta básica continua salva — é só tentar de novo.
          </p>
          <AuthButton label="Tentar o pagamento de novo" onClick={() => goToBillingCheckout()} />
          <AuthFooter muted="Quer usar outro e-mail?" action="Sair" onClick={onSignOut} />
        </AuthChrome>
      </main>
    );
  }

  return (
    <main>
      <AuthChrome compact>
        <div className="billing-result-mark billing-result-mark--ok" aria-hidden="true">
          <Check size={28} />
        </div>
        <p className="auth-app-kicker">Pedido aprovado</p>
        <h1 className="auth-app-title">Trial liberado. Agora vamos completar seu cadastro.</h1>
        <p className="auth-app-body">
          Os dados básicos já estão na conta. O próximo passo é o cadastro completo — renda, gastos e o que o Zelo
          precisa para te acompanhar.
        </p>
        {fromMobile ? (
          <AuthButton label="Continuar no app" onClick={() => window.location.assign("mylyfe://billing/success")} />
        ) : (
          <AuthButton
            label="Continuar o cadastro"
            onClick={() => readySession && onContinue(readySession)}
            disabled={!readySession}
          />
        )}
      </AuthChrome>
    </main>
  );
}
