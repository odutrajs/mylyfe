import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Check, Lock } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AuthButton, AuthChrome, AuthFooter } from "./auth-ui";
import { planPriceLabel, type AuthedSession } from "./BillingPaywall";
import { apiRequest } from "./lib";

type ElementsPayload = {
  clientSecret: string;
  mode: "setup" | "payment";
  publishableKey: string;
  error?: string;
};

const appearance = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#0878F9",
    colorText: "#102a4c",
    colorTextSecondary: "#5b6b86",
    colorBackground: "#ffffff",
    colorDanger: "#e11d48",
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif",
    borderRadius: "16px",
    spacingUnit: "4px"
  },
  rules: {
    ".Input": {
      border: "1px solid #d5e3ec",
      boxShadow: "none",
      padding: "12px 14px"
    },
    ".Input:focus": {
      border: "1px solid #0878F9",
      boxShadow: "0 0 0 3px rgba(8, 120, 249, 0.12)"
    },
    ".Label": {
      fontWeight: "600",
      color: "#5b6b86"
    }
  }
};

const readJson = async <T,>(response: Response) => {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Nao foi possivel iniciar o pagamento. A API precisa estar atualizada.");
  }
};

function CheckoutForm({
  mode,
  onSignOut
}: {
  mode: "setup" | "payment";
  onSignOut: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const fromMobile = new URLSearchParams(window.location.search).get("source") === "mobile";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setBusy(true);

    const extra = fromMobile ? "&source=mobile" : "";
    const approvedUrl = `${window.location.origin}/billing/resultado?status=aprovado${extra}`;
    const declinedUrl = `${window.location.origin}/billing/resultado?status=recusado${extra}`;
    const result =
      mode === "payment"
        ? await stripe.confirmPayment({ elements, confirmParams: { return_url: approvedUrl }, redirect: "if_required" })
        : await stripe.confirmSetup({ elements, confirmParams: { return_url: approvedUrl }, redirect: "if_required" });

    if (result.error) {
      window.location.assign(declinedUrl);
      return;
    }

    try {
      await apiRequest("/billing/sync", { method: "POST" });
    } catch {
      // a tela de resultado confirma a liberacao
    }

    window.location.assign(approvedUrl);
  };

  return (
    <form className="billing-checkout-form" onSubmit={(event) => void submit(event)}>
      <div className="billing-element">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      <AuthButton type="submit" busy={busy || !stripe} label="Liberar meu acesso" />
      <p className="auth-app-note">
        <Lock size={13} /> Cartão protegido pela Stripe. Sem cobrança pelos próximos 7 dias.
      </p>
      <AuthFooter muted="Entrou no e-mail errado?" action="Sair" onClick={onSignOut} />
    </form>
  );
}

export function BillingCheckout({
  session,
  onSignOut
}: {
  session?: AuthedSession | null;
  onSignOut: () => void;
}) {
  const start = new URLSearchParams(window.location.search).get("start") ?? "";
  const [payload, setPayload] = useState<ElementsPayload | null>(null);
  const [error, setError] = useState("");
  const firstName = session?.name.split(" ")[0] ?? "";

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await apiRequest("/billing/elements", {
          method: "POST",
          body: JSON.stringify({ start: start || undefined })
        });
        const next = await readJson<ElementsPayload>(response);
        if (!response.ok || !next.clientSecret || !next.publishableKey) {
          throw new Error(next.error || "Nao foi possivel abrir o checkout.");
        }
        if (active) setPayload(next);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Nao foi possivel abrir o checkout.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [start]);

  const stripePromise = useMemo<Promise<Stripe | null> | null>(
    () => (payload?.publishableKey ? loadStripe(payload.publishableKey) : null),
    [payload?.publishableKey]
  );

  return (
    <main className="billing-checkout">
      <AuthChrome compact>
        <p className="auth-app-kicker">Último passo</p>
        <h1 className="auth-app-title">Libere 7 dias para testar.</h1>
        <p className="auth-app-body">
          {firstName ? `${firstName}, o` : "O"} cartão entra agora só para reservar o trial. A cobrança de{" "}
          {planPriceLabel()} começa depois. Cancele quando quiser.
        </p>

        <ul className="billing-summary">
          <li>
            <Check size={16} /> 7 dias grátis no Zelo, no web e no celular
          </li>
          <li>
            <Check size={16} /> {planPriceLabel()} só depois do trial
          </li>
          <li>
            <Check size={16} /> Cancele no perfil, sem multa
          </li>
        </ul>

        {error ? <p className="auth-app-error">{error}</p> : null}
        {!payload && !error ? <p className="auth-app-note">Preparando o checkout…</p> : null}

        {payload && stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: payload.clientSecret,
              appearance,
              locale: "pt-BR"
            }}
          >
            <CheckoutForm mode={payload.mode} onSignOut={onSignOut} />
          </Elements>
        ) : null}
      </AuthChrome>
    </main>
  );
}
