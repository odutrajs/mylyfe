import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type SheetKind = "transaction" | "shopping" | "reminder" | "task" | "account" | null;

type UIContextValue = {
  sheet: SheetKind;
  openSheet: (sheet: Exclude<SheetKind, null>) => void;
  closeSheet: () => void;
};

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetKind>(null);
  const value = useMemo<UIContextValue>(
    () => ({
      sheet,
      openSheet: setSheet,
      closeSheet: () => setSheet(null)
    }),
    [sheet]
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error("useUI precisa estar dentro de UIProvider");
  return context;
};
