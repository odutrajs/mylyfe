import { Bell, Lock, Mail, MessageCircle, Smartphone, User, WalletCards } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { AuthButton, AuthChrome, AuthFooter, FloatingField, zeloMascotSrc } from "./auth-ui";
import { goToBillingCheckout, planPriceLabel, sessionHasAccess, type AuthedSession } from "./BillingPaywall";
import { apiRequest, writeAuthToken } from "./lib";

const proofs = [
  {
    icon: MessageCircle,
    title: "Secretaria no WhatsApp",
    text: "Ela cobra contas, prazos e confirmações no lugar onde você já responde."
  },
  {
    icon: WalletCards,
    title: "Diagnóstico financeiro",
    text: "O dinheiro deixa de ser planilha solta e vira um retrato que muda com você."
  },
  {
    icon: Bell,
    title: "Rotina e lembretes",
    text: "Agenda, avisos e o que vence hoje, no mesmo app que você viu no vídeo."
  }
] as const;

const steps = [
  { n: "1", title: "Dados básicos", text: "Nome, WhatsApp, e-mail e senha. Menos de um minuto." },
  { n: "2", title: "Libera o trial", text: "Cartão agora, sem cobrança por 7 dias. Pedido aprovado ou recusado na hora." },
  { n: "3", title: "Cadastro completo", text: "Com o acesso liberado, você conta renda, gastos e o que o app precisa saber." }
] as const;

const faqs = [
  {
    q: "Quando o cartão é cobrado?",
    a: "Só depois dos 7 dias de trial. Nesta etapa a gente só confirma o cartão para liberar o acesso."
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. No perfil, em Gerenciar assinatura, você cancela e o acesso segue até o fim do período já pago ou do trial."
  },
  {
    q: "E se eu não quiser continuar?",
    a: "Cancele antes do trial acabar. Sem cobrança, sem app — a conta fica aí se você voltar."
  },
  {
    q: "A secretaria no WhatsApp já entra no trial?",
    a: "Sim. Trial libera o Zelo inteiro: financeiro, secretaria, rotina e o app no celular."
  }
] as const;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function displayNameFromEmail(email: string) {
  const localPart = normalizeEmail(email).split("@")[0] ?? "";
  const words = localPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) return "Usuario Zelo";
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function ConversionLanding({
  onAuthenticated
}: {
  onAuthenticated: (session: AuthedSession, token: string) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    formRef.current?.querySelector("input")?.focus();
  };

  const goToLogin = () => {
    window.location.assign("/");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = normalizeEmail(email);

    if (name.trim().length < 2) {
      setError("Informe seu nome para liberar o acesso.");
      return;
    }

    if (!normalizedEmail.includes("@") || password.length < 6) {
      setError("Informe e-mail valido e senha com pelo menos 6 caracteres.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || displayNameFromEmail(normalizedEmail),
          email: normalizedEmail,
          password,
          phone: phone.trim() || undefined
        })
      });
      const payload = (await response.json()) as { error?: string; token?: string; session?: AuthedSession };
      if (!response.ok || !payload.token || !payload.session) {
        setError(
          response.status === 409
            ? "Este e-mail ja tem conta. Entre para liberar o acesso."
            : payload.error || "Nao foi possivel criar a conta."
        );
        return;
      }

      writeAuthToken(payload.token);

      if (sessionHasAccess(payload.session)) {
        if (window.location.pathname === "/comece") {
          window.history.replaceState({}, "", "/");
        }
        onAuthenticated(payload.session, payload.token);
        return;
      }

      goToBillingCheckout();
    } catch {
      setError("Nao foi possivel falar com o servidor. Tente de novo em instantes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="conversion">
      <AuthChrome compact>
        <p className="auth-app-kicker">Você viu no Instagram</p>
        <h1 className="auth-app-title">7 dias para colocar a vida no lugar. Depois, só se fizer sentido.</h1>
        <p className="auth-app-body">
          Você veio do vídeo. Cria a conta, libera o trial com o cartão — sem cobrança agora — e o Zelo destrava:
          financeiro, secretaria no WhatsApp e rotina no mesmo lugar.
        </p>
        <form id="cadastro" ref={formRef} onSubmit={(event) => void submit(event)}>
          <FloatingField
            label="Nome"
            icon={<User size={20} color="#808080" strokeWidth={1.8} />}
            value={name}
            onChange={setName}
            autoComplete="name"
            placeholder="Seu nome"
          />
          <FloatingField
            label="E-mail"
            icon={<Mail size={20} color="#808080" strokeWidth={1.8} />}
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder="email@gmail.com"
          />
          <FloatingField
            label="Senha"
            icon={<Lock size={20} color="#808080" strokeWidth={1.8} />}
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="Digite sua senha"
          />
          <FloatingField
            label="WhatsApp"
            icon={<Smartphone size={20} color="#808080" strokeWidth={1.8} />}
            type="tel"
            value={phone}
            onChange={setPhone}
            autoComplete="tel"
            inputMode="tel"
            placeholder="41 99999-0000"
          />
          <p className="auth-app-note">
            Trial de 7 dias. Cartão agora, cobrança de {planPriceLabel()} só depois. Cancele quando quiser.
          </p>
          {error && <p className="auth-app-error">{error}</p>}
          <AuthButton type="submit" busy={busy} label="Liberar meu acesso" />
        </form>
        <AuthFooter muted="Já tem uma conta?" action="Entrar" onClick={goToLogin} />
      </AuthChrome>

      <div className="conversion-below">
        <section className="conversion-proofs" aria-label="O que você viu no vídeo">
          {proofs.map((proof) => {
            const Icon = proof.icon;
            return (
              <article key={proof.title} className="conversion-proof">
                <span className="conversion-proof-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <h3>{proof.title}</h3>
                <p>{proof.text}</p>
              </article>
            );
          })}
        </section>

        <section className="conversion-stage">
          <img src={zeloMascotSrc} alt="Zelo te recebe" className="conversion-mascot-art" />
          <p>Oi, eu sou o Zelo. Assim que o trial começa, eu te recebo do outro lado.</p>
        </section>

        <section className="conversion-steps" aria-label="Como funciona">
          {steps.map((step) => (
            <article key={step.n} className="conversion-step">
              <span>{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </section>

        <section className="conversion-faq" aria-label="Dúvidas">
          {faqs.map((item) => (
            <article key={item.q} className="conversion-faq-item">
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </section>

        <section className="conversion-close">
          <h2>Pronto para liberar o app?</h2>
          <p>Cadastro, trial de 7 dias, acesso no web e no Zelo. {planPriceLabel()} só depois.</p>
          <AuthButton label="Liberar meu acesso" onClick={scrollToForm} />
        </section>

        <footer className="conversion-footer">
          <a href="/termos.html">Termos</a>
          <a href="/privacidade.html">Privacidade</a>
        </footer>
      </div>
    </main>
  );
}
