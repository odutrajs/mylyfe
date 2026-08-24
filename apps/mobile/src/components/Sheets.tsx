import { useMemo } from "react";
import { useUI } from "../ui-context";
import { ProfileSheet } from "./ProfileSheet";
import { ReminderSheet } from "./ReminderSheet";
import { ShoppingSheet } from "./ShoppingSheet";
import { TaskSheet } from "./TaskSheet";
import { TransactionSheet } from "./TransactionSheet";

export function AppSheets() {
  const { sheet } = useUI();
  const content = useMemo(() => {
    if (sheet === "transaction") return <TransactionSheet />;
    if (sheet === "shopping") return <ShoppingSheet />;
    if (sheet === "reminder") return <ReminderSheet />;
    if (sheet === "task") return <TaskSheet />;
    if (sheet === "account") return <ProfileSheet />;
    return null;
  }, [sheet]);
  return content;
}
