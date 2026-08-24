import { Eye, EyeOff } from "lucide-react";
import { type InputHTMLAttributes, type ReactNode } from "react";
import { useState } from "react";

import { zeloMascotSrc } from "./Mascot";

export const loginMascotSrc = "/mascots/mascote-login.png";
export { zeloMascotSrc };

export function AuthChrome({
  compact = false,
  children
}: {
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`auth-app${compact ? " auth-app--compact" : ""}`}>
      <div className="auth-app-hero" aria-hidden="true">
        <img src={loginMascotSrc} alt="" className="auth-app-mascot" />
      </div>
      <div className="auth-app-form">{children}</div>
    </div>
  );
}

export function FloatingField({
  label,
  icon,
  trailing,
  type = "text",
  value,
  onChange,
  autoComplete,
  readOnly,
  placeholder,
  inputMode
}: {
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
  type?: string;
  value: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
  readOnly?: boolean;
  placeholder?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <label className="auth-float">
      <span className="auth-float-row">
        {icon}
        <input
          type={isPassword && visible ? "text" : type}
          autoComplete={autoComplete}
          value={value}
          readOnly={readOnly}
          placeholder={placeholder}
          inputMode={inputMode}
          onChange={(event) => onChange?.(event.target.value)}
        />
        {isPassword ? (
          <button
            type="button"
            className="auth-float-reveal"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={visible}
          >
            {visible ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        ) : (
          trailing
        )}
      </span>
      <span className="auth-float-label">{label}</span>
    </label>
  );
}

export function AuthButton({
  label,
  type = "button",
  onClick,
  disabled = false,
  busy = false,
  ghost = false
}: {
  label: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  ghost?: boolean;
}) {
  return (
    <button
      type={type}
      className={`auth-app-submit${ghost ? " auth-app-submit--ghost" : ""}`}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? "Aguarde..." : label}
    </button>
  );
}

export function AuthFooter({
  muted,
  action,
  onClick
}: {
  muted: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <p className="auth-app-footer">
      <span>{muted}</span>{" "}
      <button type="button" onClick={onClick}>
        {action}
      </button>
    </p>
  );
}
