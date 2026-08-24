import { Bell, Lock, Mail, MessageCircle, Smartphone, User, WalletCards } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { AuthButton, AuthChrome, AuthFooter, FloatingField, zeloMascotSrc } from "./auth-ui";
import { apiRequest } from "./lib";

type UserSession = {
  userId: string;
  planId: string;
  name: string;
  email: string;
  personalPlanId?: string;
};

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
  { n: "1", title: "Preenche o cadastro", text: "Nome, WhatsApp, e-mail e senha. Menos de um minuto." },
  { n: "2", title: "Acesso liberado", text: "A conta nasce no servidor e o MyLyfe destrava pra você." },
  { n: "3", title: "O app acompanha", text: "Financeiro, secretaria e rotina passam a viver no mesmo lugar." }
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

  if (words.length === 0) return "Usuario MyLyfe";
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function ConversionLanding({
  onAuthenticated
}: {
  onAuthenticated: (session: UserSession, token: string) => void;
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
      setError("Informe seu nome para desbloquear o acesso.");
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
      const payload = (await response.json()) as { error?: string; token?: string; session?: UserSession };
      if (!response.ok || !payload.token || !payload.session) {
        setError(
          response.status === 409
            ? "Este e-mail ja tem conta. Entre para desbloquear o acesso."
            : payload.error || "Nao foi possivel criar a conta."
        );
        return;
      }

      if (window.location.pathname === "/comece") {
        window.history.replaceState({}, "", "/");
      }
      onAuthenticated(payload.session, payload.token);
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
        <h1 className="auth-app-title">Preencha o cadastro para desbloquear seu acesso ao app.</h1>
        <p className="auth-app-body">
          Você viu o MyLyfe no vídeo. Conta criada, acesso liberado — financeiro, secretaria no WhatsApp e rotina no
          mesmo lugar.
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
          <p className="auth-app-note">Leva menos de um minuto. Sem cartão nesta etapa.</p>
          {error && <p className="auth-app-error">{error}</p>}
          <AuthButton type="submit" busy={busy} label="Desbloquear meu acesso" />
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
          <img src={zeloMascotSrc} alt="Zelo te recebe no MyLyfe" className="conversion-mascot-art" />
          <p>Oi, eu sou o Lyfo. Assim que o cadastro fecha, eu te recebo do outro lado.</p>
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

        <section className="conversion-close">
          <h2>Pronto para entrar no app?</h2>
          <p>Cadastro feito, acesso desbloqueado. Sem cartão agora.</p>
          <AuthButton label="Desbloquear meu acesso" onClick={scrollToForm} />
        </section>

        <footer className="conversion-footer">
          <a href="/termos.html">Termos</a>
          <a href="/privacidade.html">Privacidade</a>
        </footer>
      </div>
    </main>
  );
}
