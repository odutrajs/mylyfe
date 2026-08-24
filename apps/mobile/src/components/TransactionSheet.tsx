import type { ExpenseCategory, FinancialTransaction, Frequency, IncomeSource, IncomeType } from "@mylyfe/domain";
import { formatMonthKey, monthlyizeIncome } from "@mylyfe/domain";
import { StatusBar } from "expo-status-bar";
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  Bus,
  Calendar,
  ChevronLeft,
  Clock,
  CreditCard,
  GraduationCap,
  Heart,
  Home,
  Landmark,
  Pencil,
  Repeat,
  ShoppingBag,
  Sparkles,
  Tag,
  Ticket,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { todayKey } from "../format";
import { usePlan } from "../plan-context";
import { colors, fonts, inputReset } from "../theme";
import { useUI } from "../ui-context";
import { SelectSheet } from "./SelectSheet";

type Step = "amount" | "details" | "category";
type Kind = "expense" | "income";
type Payment = "credit" | "debit" | "pix" | "cash";
type Term = "cash" | "installment";
type Picker = "when" | "payment" | "term" | "incomeType" | "incomeFrequency";

const muted = colors.textMuted;
const cardBorder = colors.border;
const iconAction = colors.accent;
const iconBlack = "#000000";

const payments: Array<{ id: Payment; label: string }> = [
  { id: "credit", label: "Crédito (Padrão)" },
  { id: "debit", label: "Débito" },
  { id: "pix", label: "Pix" },
  { id: "cash", label: "Dinheiro" }
];

const incomeTypes: Array<{ id: IncomeType; label: string }> = [
  { id: "clt", label: "CLT" },
  { id: "pj", label: "PJ" },
  { id: "freelance", label: "Freelance" },
  { id: "company", label: "Empresa" },
  { id: "rent", label: "Aluguel" },
  { id: "dividends", label: "Dividendos" },
  { id: "pension", label: "Pensão" },
  { id: "other", label: "Outros" }
];

const incomeFrequencies: Array<{ id: Frequency; label: string }> = [
  { id: "monthly", label: "Todo mês" },
  { id: "single", label: "Só desta vez" },
  { id: "weekly", label: "Toda semana" },
  { id: "biweekly", label: "Quinzenal" },
  { id: "quarterly", label: "Trimestral" },
  { id: "annual", label: "Anual" }
];

const parcelOptions = [2, 3, 4, 6, 10, 12, 18, 24];

const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const incomeStability = (type: IncomeType) =>
  type === "clt" || type === "pj" || type === "pension" ? 8 : type === "rent" || type === "dividends" ? 6 : 5;

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const categoryIcon = (category: string, name: string) => {
  const key = normalize(`${category} ${name}`);
  if (category === "housing") return Home;
  if (category === "shopping") return ShoppingBag;
  if (category === "food" || /comida|aliment|restaurante|ifood|mercado|padaria|lanche/.test(key)) return UtensilsCrossed;
  if (category === "transport") return Bus;
  if (category === "health") return Heart;
  if (category === "education") return GraduationCap;
  if (category === "travel") return Ticket;
  if (category === "taxes") return Landmark;
  if (category === "subscriptions") return Repeat;
  if (category === "debt") return Wallet;
  if (category === "company") return Briefcase;
  if (category === "thirdParty") return Users;
  if (category === "investments") return TrendingUp;
  return Sparkles;
};

const formatCents = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const monthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(year ?? 1970, (month ?? 1) - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const shiftMonthKey = (monthKey: string, delta: number) => {
  const [year, month] = monthKey.split("-").map(Number);
  return formatMonthKey(new Date(year ?? 1970, (month ?? 1) - 1 + delta, 15));
};

const dateInMonth = (monthKey: string, fallbackDay = 1) => {
  const today = todayKey();
  if (today.startsWith(monthKey)) return today;
  const [year, month] = monthKey.split("-").map(Number);
  const last = new Date(year ?? 1970, month ?? 1, 0).getDate();
  return `${monthKey}-${String(Math.min(fallbackDay, last)).padStart(2, "0")}`;
};

export function TransactionSheet() {
  const insets = useSafeAreaInsets();
  const { closeSheet } = useUI();
  const { plan, updatePlan } = usePlan();
  const amountRef = useRef<TextInput>(null);
  const [step, setStep] = useState<Step>("amount");
  const [kind, setKind] = useState<Kind>("expense");
  const [cents, setCents] = useState(0);
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayKey());
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [payment, setPayment] = useState<Payment>("credit");
  const [term, setTerm] = useState<Term>("cash");
  const [installmentTotal, setInstallmentTotal] = useState(2);
  const [incomeType, setIncomeType] = useState<IncomeType>("other");
  const [incomeFrequency, setIncomeFrequency] = useState<Frequency>("monthly");
  const [picker, setPicker] = useState<Picker | null>(null);
  const categories = plan?.expenseCategories?.filter((item) => item.isActive) ?? [];
  const selectedCategory = categories.find((item) => item.id === category);
  const thisMonth = formatMonthKey(new Date());
  const dateMonth = date.slice(0, 7);
  const whenLabel =
    dateMonth === thisMonth
      ? `Desse mês (${monthLabel(dateMonth)})`
      : dateMonth === shiftMonthKey(thisMonth, -1)
        ? `Mês passado (${monthLabel(dateMonth)})`
        : `Em ${monthLabel(dateMonth)}`;
  const paymentLabel = payments.find((item) => item.id === payment)?.label ?? "Crédito (Padrão)";
  const termLabel = term === "installment" ? `${installmentTotal}x` : "À vista";
  const incomeTypeLabel = incomeTypes.find((item) => item.id === incomeType)?.label ?? "Outros";
  const incomeFrequencyLabel = incomeFrequencies.find((item) => item.id === incomeFrequency)?.label ?? "Todo mês";
  const canContinue = cents > 0;
  const canFinish = Boolean(plan && name.trim() && cents > 0 && (kind === "income" || category));

  const whenOptions = useMemo(
    () => [
      { id: thisMonth, label: `Desse mês (${monthLabel(thisMonth)})` },
      { id: shiftMonthKey(thisMonth, -1), label: `Mês passado (${monthLabel(shiftMonthKey(thisMonth, -1))})` },
      { id: shiftMonthKey(thisMonth, 1), label: `Próximo mês (${monthLabel(shiftMonthKey(thisMonth, 1))})` }
    ],
    [thisMonth]
  );

  const submit = async () => {
    if (!canFinish || !plan) return;
    const amount = cents / 100;
    const title = name.trim();
    await updatePlan((currentPlan) => {
      const updatedAt = new Date().toISOString();
      if (kind === "income") {
        const recurring = incomeFrequency !== "single";
        const source: IncomeSource = {
          id: nextId("income"),
          name: title,
          type: incomeType,
          ownerId: currentPlan.profile.people.find((person) => person.role === "primary")?.id,
          netAmount: amount,
          frequency: incomeFrequency,
          isRecurring: recurring,
          stabilityScore: incomeStability(incomeType),
          startDate: `${date.slice(0, 7)}-01`
        };
        const transaction: FinancialTransaction = {
          id: nextId("tx"),
          date,
          merchant: title,
          amount,
          type: "income",
          audience: "personal",
          nature: recurring ? "recurring" : "extraordinary",
          category: "other",
          confidence: 1,
          source: "manual",
          reviewed: true
        };
        const monthlyAmount = recurring ? monthlyizeIncome(source) : 0;
        const currentTarget = currentPlan.budget.monthlyExpenseTarget;
        return {
          ...currentPlan,
          incomeSources: recurring ? [...currentPlan.incomeSources, source] : currentPlan.incomeSources,
          transactions: [...currentPlan.transactions, transaction],
          budget:
            recurring && currentTarget
              ? { ...currentPlan.budget, monthlyExpenseTarget: currentTarget + monthlyAmount }
              : currentPlan.budget,
          updatedAt
        };
      }
      const parcelado = term === "installment" && installmentTotal > 1;
      const transaction: FinancialTransaction = {
        id: nextId("tx"),
        date,
        merchant: title,
        amount,
        type: "expense",
        audience: "personal",
        nature: parcelado ? "debtPayment" : "variable",
        category: category ?? "other",
        confidence: 1,
        source: "manual",
        reviewed: true,
        installment: parcelado ? { current: 1, total: installmentTotal } : undefined
      };
      return {
        ...currentPlan,
        transactions: [...currentPlan.transactions, transaction],
        updatedAt
      };
    });
    closeSheet();
  };

  useEffect(() => {
    if (step !== "amount") return;
    const timer = setTimeout(() => amountRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [step]);

  const goBack = () => {
    if (picker) {
      setPicker(null);
      return;
    }
    if (step === "category") {
      setStep("details");
      return;
    }
    if (step === "details") {
      setStep("amount");
      return;
    }
    closeSheet();
  };

  return (
    <Modal animationType="slide" onRequestClose={goBack} statusBarTranslucent>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 24, paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Pressable onPress={goBack} hitSlop={12} accessibilityLabel="Voltar" style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={20} color={colors.text} />
            </Pressable>
            {step === "amount" ? (
              <View style={{ flex: 1, alignItems: "center", paddingRight: 32 }}>
                <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: muted }}>Nova transação</Text>
                <Text style={{ fontSize: 22, fontFamily: fonts.regular, color: colors.text }}>Qual valor?</Text>
              </View>
            ) : (
              <Text style={{ flex: 1, fontSize: 22, fontFamily: fonts.regular, color: colors.text }}>
                {step === "category" ? "Categoria" : kind === "income" ? "Defina sua entrada" : "Defina sua despesa"}
              </Text>
            )}
          </View>
        </View>

        {step === "amount" ? (
          <View style={{ flex: 1, paddingHorizontal: 24, gap: 16 }}>
            <TextInput
              ref={amountRef}
              value={`R$ ${formatCents(cents)}`}
              onChangeText={(value) => setCents(Number(value.replace(/\D/g, "").slice(0, 9) || 0))}
              keyboardType="number-pad"
              inputMode="numeric"
              showSoftInputOnFocus
              selectionColor={colors.accent}
              style={{ fontSize: 44, fontFamily: fonts.semibold, color: colors.text, paddingVertical: 8, ...inputReset }}
            />
            <View style={{ flexDirection: "row", gap: 16 }}>
              <KindCard
                label="Despesa"
                Icon={ArrowDown}
                active={kind === "expense"}
                onPress={() => {
                  setKind("expense");
                  setPicker(null);
                }}
              />
              <KindCard
                label="Entrada"
                Icon={ArrowUp}
                active={kind === "income"}
                onPress={() => {
                  setKind("income");
                  setPicker(null);
                }}
              />
            </View>
          </View>
        ) : null}

        {step === "details" ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <DetailRow
              label="Valor"
              value={`R$ ${formatCents(cents)}`}
              valueColor={colors.success}
              icon={Pencil}
              onPress={() => setStep("amount")}
            />
            <DetailRow label="Título" icon={Pencil}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={kind === "income" ? "Dê um nome para sua entrada" : "Dê um nome para sua despesa"}
                placeholderTextColor={muted}
                selectionColor={colors.accent}
                style={{ fontSize: 16, fontFamily: fonts.regular, color: colors.text, padding: 0, ...inputReset }}
              />
            </DetailRow>
            <DetailRow label="A partir de quando" value={whenLabel} icon={Calendar} onPress={() => setPicker("when")} />
            {kind === "expense" ? (
              <>
                <DetailRow
                  label="Categoria"
                  value={selectedCategory?.name ?? "Escolha uma categoria"}
                  valueColor={selectedCategory ? colors.text : muted}
                  icon={Tag}
                  onPress={() => setStep("category")}
                />
                <DetailRow label="Forma de pagamento" value={paymentLabel} icon={CreditCard} onPress={() => setPicker("payment")} />
                <DetailRow label="Prazo" value={termLabel} icon={Clock} onPress={() => setPicker("term")} last />
              </>
            ) : (
              <>
                <DetailRow label="Tipo da entrada" value={incomeTypeLabel} icon={Briefcase} onPress={() => setPicker("incomeType")} />
                <DetailRow label="Recorrência" value={incomeFrequencyLabel} icon={Repeat} onPress={() => setPicker("incomeFrequency")} last />
              </>
            )}
          </ScrollView>
        ) : null}

        {step === "category" ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8 }}>
            {categories.map((item, index) => {
              const Icon = categoryIcon(item.id, item.name);
              const active = category === item.id;
              return (
                <View key={item.id}>
                  <Pressable
                    onPress={() => {
                      setCategory(item.id);
                      setStep("details");
                    }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16 }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: colors.accentSoft,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Icon size={18} color={iconBlack} strokeWidth={2} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 16, fontFamily: fonts.regular, color: colors.text }}>{item.name}</Text>
                    {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} /> : null}
                  </Pressable>
                  {index < categories.length - 1 ? <View style={{ height: 1, backgroundColor: cardBorder }} /> : null}
                </View>
              );
            })}
          </ScrollView>
        ) : null}

        {step !== "category" ? (
          <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 8 }}>
            {step === "amount" ? (
              <PrimaryButton label="Continuar" disabled={!canContinue} onPress={() => setStep("details")} />
            ) : (
              <PrimaryButton label="Concluir" disabled={!canFinish} onPress={() => void submit()} />
            )}
          </View>
        ) : null}

      </KeyboardAvoidingView>
      <SelectSheet
        visible={picker === "when"}
        title="A partir de quando"
        options={whenOptions.map((item) => ({ value: item.id, label: item.label }))}
        selected={dateMonth}
        onSelect={(value) => setDate(dateInMonth(value))}
        onClose={() => setPicker(null)}
      />
      <SelectSheet
        visible={picker === "payment"}
        title="Forma de pagamento"
        options={payments.map((item) => ({ value: item.id, label: item.label }))}
        selected={payment}
        onSelect={setPayment}
        onClose={() => setPicker(null)}
      />
      <SelectSheet
        visible={picker === "term"}
        title="Prazo"
        options={[
          { value: "cash", label: "À vista" },
          ...parcelOptions.map((total) => ({ value: String(total), label: `${total}x` }))
        ]}
        selected={term === "installment" ? String(installmentTotal) : "cash"}
        onSelect={(value) => {
          if (value === "cash") {
            setTerm("cash");
            return;
          }
          setTerm("installment");
          setInstallmentTotal(Number(value));
        }}
        onClose={() => setPicker(null)}
      />
      <SelectSheet
        visible={picker === "incomeType"}
        title="Tipo da entrada"
        options={incomeTypes.map((item) => ({ value: item.id, label: item.label }))}
        selected={incomeType}
        onSelect={setIncomeType}
        onClose={() => setPicker(null)}
      />
      <SelectSheet
        visible={picker === "incomeFrequency"}
        title="Recorrência"
        options={incomeFrequencies.map((item) => ({ value: item.id, label: item.label }))}
        selected={incomeFrequency}
        onSelect={setIncomeFrequency}
        onClose={() => setPicker(null)}
      />
      </View>
    </Modal>
  );
}

function KindCard({
  label,
  Icon,
  active,
  onPress
}: {
  label: string;
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 96,
        borderRadius: 24,
        backgroundColor: active ? colors.accent : colors.accentSoft,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 16
      }}
    >
      <Icon size={18} color={active ? "#FFFFFF" : colors.accent} strokeWidth={2} />
      <Text style={{ fontSize: 15, fontFamily: fonts.regular, color: active ? "#FFFFFF" : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

function DetailRow({
  label,
  value,
  valueColor = colors.text,
  icon: Icon,
  onPress,
  last = false,
  children
}: {
  label: string;
  value?: string;
  valueColor?: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress?: () => void;
  last?: boolean;
  children?: ReactNode;
}) {
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16, gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: muted }}>{label}</Text>
        {children ?? (
          <Text style={{ fontSize: 16, fontFamily: fonts.regular, color: valueColor }} numberOfLines={1}>
            {value}
          </Text>
        )}
      </View>
      <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
        <Icon size={18} color={iconAction} strokeWidth={2} />
      </View>
    </View>
  );

  return (
    <View>
      {onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content}
      {last ? null : <View style={{ height: 1, backgroundColor: cardBorder }} />}
    </View>
  );
}

function PrimaryButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        height: 54,
        borderRadius: 100,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : 1
      }}
    >
      <Text style={{ fontSize: 16, fontFamily: fonts.bold, color: "#FFFFFF" }}>{label}</Text>
    </Pressable>
  );
}
