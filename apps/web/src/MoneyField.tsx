import { useEffect, useRef, useState } from "react";
import { formatMoneyDisplay, parseMoneyInput } from "./lib";

export function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [displayValue, setDisplayValue] = useState(() => formatMoneyDisplay(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDisplayValue(formatMoneyDisplay(value));
    }
  }, [value]);

  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={displayValue}
        onFocus={(event) => {
          focusedRef.current = true;
          event.currentTarget.select();
        }}
        onBlur={() => {
          focusedRef.current = false;
          setDisplayValue(formatMoneyDisplay(value));
        }}
        onChange={(event) => {
          const next = parseMoneyInput(event.target.value);
          setDisplayValue(next.display);
          onChange(next.value);
        }}
      />
    </label>
  );
}
