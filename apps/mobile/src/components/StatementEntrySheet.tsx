import type { AlertFrequency, ExpenseCategory, FinancePlan, IncomeType } from "@mylyfe/domain";
import { removePlanEntry } from "@mylyfe/domain";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { frequencyLabel, preciseCurrency, shortDate } from "../format";
import { usePlan } from "../plan-context";
import { colors, fonts } from "../theme";
import { OverlayModal } from "./OverlayModal";

const muted = "#808080";
const cardBorder = "rgba(0, 0, 0, 0.05)";

const incomeTypeLabel: Record<IncomeType, string> = {
  clt: "CLT",
  pj: "PJ",
  freelance: "Freelance",
  company: "Empresa",
  rent: "Aluguel",
  dividends: "Dividendos",
  pension: "Pensão",
  other: "Outros"
};

export type StatementEntryRef = {
  id: string;
  name: string;
  amount: number;
  date?: string;
  direction: "in" | "out";
  category?: ExpenseCategory | "income";
  kind?: string;
};

const categoryLabel = (plan: FinancePlan | null, category?: string) => {
  if (!category || category === "income") return "Ganho";
  return plan?.expenseCategories.find((item) => item.id === category)?.name ?? category;
};

const entryDetails = (plan: FinancePlan | null, entry: StatementEntryRef) => {
  const transaction = plan?.transactions.find((item) => item.id === entry.id);
  const recurringId = entry.id.startsWith("rec-") ? entry.id.slice(4) : "";
  const recurring = recurringId ? plan?.recurringTransactions.find((item) => item.id === recurringId) : undefined;
  const incomeSource = plan?.incomeSources.find((item) => item.id === entry.id || `income-${item.id}` === entry.id);
  const income =
    entry.direction === "in" || transaction?.type === "income" || Boolean(incomeSource);
  const date = transaction?.date ?? recurring?.startDate ?? incomeSource?.startDate ?? entry.date;
  const fields = [
    { label: "Tipo", value: income ? "Entrada" : "Despesa" },
    { label: "Valor", value: preciseCurrency.format(entry.amount) },
    { label: "Quando", value: date ? shortDate(date) || date.slice(0, 10) : "—" }
  ];

  if (income) {
    const type = incomeSource?.type;
    fields.push({ label: "Origem", value: type ? incomeTypeLabel[type] : "Lançamento" });
    fields.push({
      label: "Recorrência",
      value: incomeSource?.isRecurring
        ? frequencyLabel[(incomeSource.frequency === "single" ? "once" : incomeSource.frequency) as AlertFrequency]
        : transaction?.nature === "recurring"
          ? "Todo mês"
          : "Só desta vez"
    });
  } else {
    fields.push({
      label: "Categoria",
      value: categoryLabel(plan, transaction?.category ?? recurring?.category ?? entry.category)
    });
    if (transaction?.installment) {
      fields.push({
        label: "Prazo",
        value: `${transaction.installment.current}/${transaction.installment.total}x`
      });
    } else if (recurring) {
      fields.push({
        label: "Recorrência",
        value: frequencyLabel[recurring.frequency]
      });
    }
  }

  return {
    title: transaction?.merchant ?? recurring?.name ?? incomeSource?.name ?? entry.name,
    income,
    fields,
    canDelete: Boolean(transaction || recurring || incomeSource)
  };
};

export function StatementEntrySheet({
  entry,
  onClose
}: {
  entry: StatementEntryRef | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { plan, updatePlan } = usePlan();
  const details = useMemo(() => (entry ? entryDetails(plan, entry) : null), [entry, plan]);

  const remove = () => {
    if (!entry || !details?.canDelete) return;
    Alert.alert("Excluir lançamento", `Quer apagar ${details.title}? Isso tira o valor dos ganhos e do orçamento.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          void updatePlan((current) => removePlanEntry(current, entry.id)).then(onClose);
        }
      }
    ]);
  };

  return (
    <OverlayModal visible={Boolean(entry)} onClose={onClose}>
      <StatusBar style="dark" />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12) + 12,
            gap: 16
          }}
        >
          <View style={{ alignSelf: "center", width: 42, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: muted }}>
              {details?.income ? "Detalhes da entrada" : "Detalhes da despesa"}
            </Text>
            <Text style={{ fontSize: 22, fontFamily: fonts.bold, color: colors.text }}>{details?.title ?? entry?.name}</Text>
            <Text
              style={{
                fontSize: 20,
                fontFamily: fonts.semibold,
                color: details?.income ? colors.success : colors.danger
              }}
            >
              {details?.income ? "+" : ""}
              {preciseCurrency.format(entry?.amount ?? 0)}
            </Text>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: cardBorder,
              borderRadius: 20,
              paddingHorizontal: 16
            }}
          >
            {details?.fields.map((field, index) => (
              <View
                key={field.label}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 12,
                  paddingVertical: 14,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: cardBorder
                }}
              >
                <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: muted }}>{field.label}</Text>
                <Text style={{ flex: 1, textAlign: "right", fontSize: 14, fontFamily: fonts.medium, color: colors.text }}>
                  {field.value}
                </Text>
              </View>
            ))}
          </View>

          {details?.canDelete ? (
            <Pressable
              onPress={remove}
              style={{
                height: 54,
                borderRadius: 100,
                backgroundColor: colors.dangerSoft,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: colors.danger }}>Excluir lançamento</Text>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: muted, textAlign: "center" }}>
              Esse item é só uma previsão e não pode ser apagado daqui.
            </Text>
          )}
        </View>
    </OverlayModal>
  );
}
