import { Check, Loader2, Smartphone } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "./lib";

export function WhatsAppPhoneField({
  phone,
  verifiedAt,
  personId,
  onPhoneChange,
  onVerified
}: {
  phone: string;
  verifiedAt?: string;
  personId?: string;
  onPhoneChange: (phone: string, verifiedAt?: string) => void;
  onVerified?: (phone: string, verifiedAt: string) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"start" | "confirm" | "">("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const verified = Boolean(verifiedAt);

  const start = async () => {
    setBusy("start");
    setError("");
    setInfo("");
    try {
      const response = await apiRequest("/secretary/phone/start", {
        method: "POST",
        body: JSON.stringify({ phone, personId })
      });
      const payload = (await response.json()) as { error?: string; phone?: string };
      if (!response.ok) {
        setError(payload.error || "Nao consegui enviar o codigo.");
        return;
      }
      onPhoneChange(payload.phone || phone);
      setInfo("Mandei um codigo de 6 digitos neste WhatsApp. Confirma aqui ou responde a mensagem.");
    } catch {
      setError("Nao consegui falar com o servidor.");
    } finally {
      setBusy("");
    }
  };

  const confirm = async () => {
    setBusy("confirm");
    setError("");
    try {
      const response = await apiRequest("/secretary/phone/confirm", {
        method: "POST",
        body: JSON.stringify({ phone, code })
      });
      const payload = (await response.json()) as { error?: string; phone?: string; whatsappVerifiedAt?: string };
      if (!response.ok || !payload.whatsappVerifiedAt) {
        setError(payload.error || "Codigo invalido.");
        return;
      }
      const nextPhone = payload.phone || phone;
      onPhoneChange(nextPhone, payload.whatsappVerifiedAt);
      onVerified?.(nextPhone, payload.whatsappVerifiedAt);
      setCode("");
      setInfo("WhatsApp confirmado. A secretaria ja te reconhece neste numero.");
    } catch {
      setError("Nao consegui confirmar o codigo.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="form-grid single">
      <label className="field">
        <span>Seu WhatsApp pessoal</span>
        <input
          value={phone}
          placeholder="41 99999-0000"
          inputMode="tel"
          autoComplete="tel"
          onChange={(event) => {
            setInfo("");
            setError("");
            onPhoneChange(event.target.value);
          }}
        />
      </label>
      {verified ? (
        <p className="form-note">
          <Check size={14} /> Numero confirmado. Gastos, reunioes e consultas deste WhatsApp vao para a sua conta.
        </p>
      ) : (
        <>
          <div className="wizard-actions">
            <button className="secondary-button" type="button" onClick={() => void start()} disabled={!phone.trim() || Boolean(busy)}>
              {busy === "start" ? <Loader2 className="spin" size={16} /> : <Smartphone size={16} />}
              {busy === "start" ? "Enviando..." : "Enviar codigo"}
            </button>
          </div>
          <label className="field">
            <span>Codigo de 6 digitos</span>
            <input
              value={code}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          <button className="primary-button" type="button" onClick={() => void confirm()} disabled={code.length !== 6 || Boolean(busy)}>
            {busy === "confirm" ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
            Confirmar WhatsApp
          </button>
        </>
      )}
      {info && <p className="form-note">{info}</p>}
      {error && <p className="form-note warn">{error}</p>}
    </div>
  );
}
