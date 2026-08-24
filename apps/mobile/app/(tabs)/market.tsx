import type { ShoppingItem, ShoppingSector } from "@mylyfe/domain";
import {
  addDaysToKey,
  canAccessSharedHome,
  clearBoughtShoppingItems,
  dateFromMonthKey,
  DEFAULT_SHOPPING_LIST_ID,
  defaultShoppingListOf,
  formatMonthKey,
  formatShoppingItem,
  groupShoppingItemsBySector,
  groupShoppingPurchasesByDay,
  normalizeHomeModuleState,
  removeShoppingItem,
  setShoppingItemStatus,
  shoppingPurchaseMonths,
  shoppingPurchasesInMonth,
  summarizeShoppingPurchases
} from "@mylyfe/domain";
import type { LucideIcon } from "lucide-react-native";
import {
  Apple,
  Bath,
  Beef,
  Check,
  ChevronLeft,
  ChevronRight,
  Croissant,
  CupSoda,
  Milk,
  Package,
  PawPrint,
  ShoppingBag,
  ShoppingCart,
  Snowflake,
  SprayCan,
  Wheat
} from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Pressable, Text, View } from "react-native";
import { useAuth } from "../../src/auth-context";
import { AppHeader } from "../../src/components/AppHeader";
import { MascotEmpty } from "../../src/components/Mascot";
import { Screen } from "../../src/components/Screen";
import { monthTitle, todayKey } from "../../src/format";
import { usePlan } from "../../src/plan-context";
import { colors, fonts } from "../../src/theme";
import { useUI } from "../../src/ui-context";

const mascotMercado = require("../../assets/finance/mascote-header-mercado.png");

const iconBlack = "#000000";
const cardBorder = "rgba(0, 0, 0, 0.05)";
const muted = "#808080";
const checkboxBorder = "#D1D5DB";

const sectorIcon: Record<ShoppingSector, LucideIcon> = {
  hortifruti: Apple,
  padaria: Croissant,
  acougue: Beef,
  frios: Milk,
  congelados: Snowflake,
  mercearia: Wheat,
  bebidas: CupSoda,
  higiene: Bath,
  limpeza: SprayCan,
  pets: PawPrint,
  bazar: Package,
  outros: ShoppingBag
};

const sectorBadge: Record<ShoppingSector, string> = {
  hortifruti: "#EBFBF3",
  padaria: "#FFF7EB",
  acougue: "#FFEBEB",
  frios: "#EBF5FF",
  congelados: "#E8F4FC",
  mercearia: "#FFF4E8",
  bebidas: "#EBF5FF",
  higiene: "#EEE9FF",
  limpeza: "#F5EFFF",
  pets: "#FFF4E8",
  bazar: "#F3F4F6",
  outros: "#F3F4F6"
};

const cardShadow = {
  shadowColor: "#5C5C5C",
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2
};

const shiftMonth = (month: string, delta: number) => {
  const asOf = dateFromMonthKey(month);
  return formatMonthKey(new Date(asOf.getFullYear(), asOf.getMonth() + delta, 15));
};

const prettyMonthName = (month: string) => {
  const name = monthTitle(month);
  return name.charAt(0).toUpperCase() + name.slice(1);
};

const formatDayMonth = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const mon = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
  return `${String(day).padStart(2, "0")} ${mon.slice(0, 1).toUpperCase()}${mon.slice(1, 3)}`;
};

const dayGroupLabel = (key: string, today: string) => {
  if (key === today) return `Hoje, ${formatDayMonth(key)}`;
  if (key === addDaysToKey(today, -1)) return `Ontem, ${formatDayMonth(key)}`;
  return formatDayMonth(key);
};

export default function MarketScreen() {
  const { session } = useAuth();
  const { plan, loading, refresh, updatePlan } = usePlan();
  const { openSheet } = useUI();
  const canSeeMarket = !plan || canAccessSharedHome(plan, session?.email);
  const home = useMemo(() => normalizeHomeModuleState(plan?.home), [plan?.home]);
  const list = defaultShoppingListOf(home);
  const listId = list?.id ?? DEFAULT_SHOPPING_LIST_ID;
  const items = list?.items ?? [];
  const [tab, setTab] = useState<"list" | "history">("list");
  const [month, setMonth] = useState(() => formatMonthKey(new Date()));
  const currentMonth = formatMonthKey(new Date());
  const today = todayKey();
  const [leavingIds, setLeavingIds] = useState<Record<string, true>>({});
  const hideTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const swept = useRef(false);
  const leaving = useCallback((itemId: string) => Boolean(leavingIds[itemId]), [leavingIds]);
  const visibleItems = useMemo(
    () => items.filter((item) => item.status === "open" || leaving(item.id)),
    [items, leaving]
  );
  const remaining = items.filter((item) => item.status === "open").length;
  const monthDone = useMemo(() => shoppingPurchasesInMonth(home, currentMonth).length, [currentMonth, home]);
  const progressTotal = monthDone + remaining;
  const progressPercent = progressTotal > 0 ? monthDone / progressTotal : 0;
  const sectors = useMemo(() => groupShoppingItemsBySector(visibleItems), [visibleItems]);
  const monthPurchases = useMemo(() => shoppingPurchasesInMonth(home, month), [home, month]);
  const purchaseDays = useMemo(() => groupShoppingPurchasesByDay(monthPurchases), [monthPurchases]);
  const purchaseSummary = useMemo(() => summarizeShoppingPurchases(monthPurchases), [monthPurchases]);
  const historyMonths = useMemo(() => shoppingPurchaseMonths(home), [home]);
  const oldestMonth = historyMonths.at(-1);
  const canPrevMonth = !oldestMonth || month > oldestMonth;
  const canNextMonth = month < currentMonth;

  useEffect(() => {
    if (swept.current || !plan) return;
    const currentList = defaultShoppingListOf(normalizeHomeModuleState(plan.home));
    if (!currentList) return;
    swept.current = true;
    if (currentList.items.some((item) => item.status === "bought")) {
      void updatePlan((current) => clearBoughtShoppingItems(current, currentList.id));
    }
  }, [plan, updatePlan]);

  useEffect(
    () => () => {
      for (const timer of hideTimers.current.values()) clearTimeout(timer);
      hideTimers.current.clear();
    },
    []
  );

  const cancelHide = useCallback((itemId: string) => {
    const timer = hideTimers.current.get(itemId);
    if (timer) clearTimeout(timer);
    hideTimers.current.delete(itemId);
    setLeavingIds((current) => {
      if (!current[itemId]) return current;
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }, []);

  const toggle = useCallback(
    (itemId: string) => {
      const currentItem = items.find((entry) => entry.id === itemId);
      if (!currentItem) return;

      if (currentItem.status === "bought" || leavingIds[itemId]) {
        cancelHide(itemId);
        void updatePlan((current) => setShoppingItemStatus(current, listId, itemId, "open"));
        return;
      }

      void updatePlan((current) => setShoppingItemStatus(current, listId, itemId, "bought"));
      setLeavingIds((current) => ({ ...current, [itemId]: true }));
      hideTimers.current.set(
        itemId,
        setTimeout(() => {
          hideTimers.current.delete(itemId);
          setLeavingIds((current) => {
            if (!current[itemId]) return current;
            const next = { ...current };
            delete next[itemId];
            return next;
          });
          void updatePlan((current) => removeShoppingItem(current, listId, itemId));
        }, 450)
      );
    },
    [cancelHide, items, leavingIds, listId, updatePlan]
  );

  const confirmDelete = useCallback(
    (item: ShoppingItem) => {
      Alert.alert("Excluir item", `Remover "${formatShoppingItem(item)}" da lista?`, [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            cancelHide(item.id);
            void updatePlan((current) => removeShoppingItem(current, listId, item.id));
          }
        }
      ]);
    },
    [cancelHide, listId, updatePlan]
  );

  return (
    <Screen
      header={
        <AppHeader
          title="Mercado"
          mascot={mascotMercado}
          wideMascot
          action={
            canSeeMarket
              ? {
                  label: "Adicionar item",
                  icon: ShoppingCart,
                  onPress: () => openSheet("shopping")
                }
              : undefined
          }
        />
      }
      refreshing={loading}
      onRefresh={() => void refresh()}
      padded={false}
    >
      <View style={{ paddingHorizontal: 20, gap: 20 }}>
          {!canSeeMarket ? (
            <MascotEmpty
              title="Mercado particular"
              caption="Quem te convidou ainda nao compartilhou a lista de mercado."
              mood="think"
            />
          ) : (
            <>
              <View style={{ backgroundColor: "#F3F4F6", borderRadius: 14, padding: 4, flexDirection: "row" }}>
                <MarketTab label="Lista" active={tab === "list"} onPress={() => setTab("list")} />
                <MarketTab label="Este mês" active={tab === "history"} onPress={() => setTab("history")} />
              </View>

              {tab === "list" ? (
                <>
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: cardBorder,
                      borderRadius: 24,
                      padding: 20,
                      gap: 12,
                      ...cardShadow
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 16, fontFamily: fonts.regular, color: colors.text }}>Lista ativa</Text>
                      <View style={{ backgroundColor: "#EBFBF3", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
                        <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: colors.success }}>
                          {remaining} {remaining === 1 ? "item" : "itens"}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: muted }}>
                      {remaining === 0 ? "Nada pendente por aqui." : "O que você marcar some da lista e fica no mês."}
                    </Text>
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 12, fontFamily: fonts.semibold, color: colors.text }}>Progresso do mês</Text>
                        <Text style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.success }}>
                          {progressTotal === 0 ? "0%" : `${monthDone} de ${progressTotal} concluídos`}
                        </Text>
                      </View>
                      <View style={{ height: 8, borderRadius: 100, backgroundColor: "#E0E8F0", overflow: "hidden" }}>
                        <View
                          style={{
                            height: 8,
                            borderRadius: 100,
                            width: `${Math.round(progressPercent * 100)}%`,
                            backgroundColor: colors.success
                          }}
                        />
                      </View>
                    </View>
                  </View>

                  {visibleItems.length === 0 ? (
                    <View
                      style={{
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: cardBorder,
                        borderRadius: 24,
                        ...cardShadow
                      }}
                    >
                      <MascotEmpty title="Lista vazia" caption="Toque no + para montar o mercado." mood="wave" />
                    </View>
                  ) : (
                    <View
                      style={{
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: cardBorder,
                        borderRadius: 24,
                        padding: 20,
                        gap: 24,
                        ...cardShadow
                      }}
                    >
                      {sectors.map((group) => {
                        const Icon = sectorIcon[group.sector];
                        return (
                          <View key={group.sector} style={{ gap: 12 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <View
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 16,
                                  backgroundColor: sectorBadge[group.sector],
                                  alignItems: "center",
                                  justifyContent: "center"
                                }}
                              >
                                <Icon size={16} color={iconBlack} strokeWidth={2} />
                              </View>
                              <Text style={{ fontSize: 14, fontFamily: fonts.semibold, color: colors.text }}>{group.label}</Text>
                            </View>
                            <View>
                              {group.items.map((item, index) => (
                                <ShoppingItemRow
                                  key={item.id}
                                  item={item}
                                  leaving={leaving(item.id)}
                                  showDivider={index > 0}
                                  onToggle={toggle}
                                  onDelete={confirmDelete}
                                />
                              ))}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              ) : (
                <MarketHistory
                  month={month}
                  currentMonth={currentMonth}
                  today={today}
                  canPrev={canPrevMonth}
                  canNext={canNextMonth}
                  summary={purchaseSummary}
                  days={purchaseDays}
                  onShift={(delta) => setMonth((current) => shiftMonth(current, delta))}
                />
              )}
            </>
          )}
      </View>
    </Screen>
  );
}

function MarketTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 8,
        alignItems: "center",
        borderRadius: 10,
        backgroundColor: active ? colors.surface : "transparent",
        shadowColor: "#000000",
        shadowOpacity: active ? 0.04 : 0,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 2 }
      }}
    >
      <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: active ? colors.text : muted }}>{label}</Text>
    </Pressable>
  );
}

function MarketHistory({
  month,
  currentMonth,
  today,
  canPrev,
  canNext,
  summary,
  days,
  onShift
}: {
  month: string;
  currentMonth: string;
  today: string;
  canPrev: boolean;
  canNext: boolean;
  summary: { total: number; unique: number; days: number };
  days: Array<{ day: string; items: ShoppingItem[] }>;
  onShift: (delta: -1 | 1) => void;
}) {
  const monthLabel = prettyMonthName(month);
  const currentLabel = prettyMonthName(currentMonth).split(" ")[0] ?? "este mês";

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 4, gap: 18 }}>
        <Pressable
          onPress={() => canPrev && onShift(-1)}
          hitSlop={12}
          disabled={!canPrev}
          accessibilityLabel="Mês anterior"
          style={{ opacity: canPrev ? 1 : 0.28 }}
        >
          <ChevronLeft size={14} color={iconBlack} />
        </Pressable>
        <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: colors.text, minWidth: 160, textAlign: "center" }}>
          {monthLabel}
        </Text>
        <Pressable
          onPress={() => canNext && onShift(1)}
          hitSlop={12}
          disabled={!canNext}
          accessibilityLabel="Próximo mês"
          style={{ opacity: canNext ? 1 : 0.28 }}
        >
          <ChevronRight size={14} color={iconBlack} />
        </Pressable>
      </View>

      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: cardBorder,
          borderRadius: 24,
          padding: 20,
          gap: 12,
          ...cardShadow
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.regular, color: colors.text }}>
            {month === currentMonth ? `O que compramos em ${currentLabel}` : `Compras de ${monthLabel.split(" ")[0]}`}
          </Text>
          <View style={{ backgroundColor: "#EBF5FF", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 }}>
            <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: colors.accent }}>
              {summary.total} {summary.total === 1 ? "item" : "itens"}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: muted }}>
          {summary.total === 0
            ? "Nada marcado como comprado neste mês."
            : `${summary.unique} ${summary.unique === 1 ? "produto" : "produtos"} em ${summary.days} ${summary.days === 1 ? "dia" : "dias"}.`}
        </Text>
      </View>

      {days.length === 0 ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: cardBorder,
            borderRadius: 24,
            ...cardShadow
          }}
        >
          <MascotEmpty
            title="Sem histórico"
            caption="Os itens que você marcar na lista passam a aparecer aqui."
            mood="think"
          />
        </View>
      ) : (
        days.map((group) => (
          <View
            key={group.day}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: cardBorder,
              borderRadius: 24,
              padding: 20,
              gap: 12,
              ...cardShadow
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: fonts.semibold, color: colors.text }}>
              {dayGroupLabel(group.day, today)}
            </Text>
            <View>
              {group.items.map((item, index) => {
                const Icon = sectorIcon[item.sector] ?? ShoppingBag;
                return (
                  <View key={item.id}>
                    {index > 0 ? <View style={{ height: 1, backgroundColor: cardBorder }} /> : null}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: sectorBadge[item.sector] ?? sectorBadge.outros,
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        <Icon size={16} color={iconBlack} strokeWidth={2} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 14, fontFamily: fonts.regular, color: colors.text }}>
                        {formatShoppingItem(item)}
                      </Text>
                      <Check size={16} color={colors.success} strokeWidth={2.5} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))
      )}
    </>
  );
}

const ShoppingItemRow = memo(function ShoppingItemRow({
  item,
  leaving,
  showDivider,
  onToggle,
  onDelete
}: {
  item: ShoppingItem;
  leaving: boolean;
  showDivider: boolean;
  onToggle: (itemId: string) => void;
  onDelete: (item: ShoppingItem) => void;
}) {
  const bought = item.status === "bought" || leaving;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: leaving ? 0 : 1,
      duration: leaving ? 280 : 160,
      useNativeDriver: true
    }).start();
  }, [fade, leaving]);

  return (
    <Animated.View style={{ opacity: fade }}>
      {showDivider ? <View style={{ height: 1, backgroundColor: cardBorder }} /> : null}
      <Pressable
        onPress={() => onToggle(item.id)}
        onLongPress={() => onDelete(item)}
        delayLongPress={350}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: bought ? colors.success : "transparent",
            borderWidth: bought ? 0 : 1.5,
            borderColor: checkboxBorder,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {bought ? <Check size={14} color="#FFFFFF" strokeWidth={2.5} /> : null}
        </View>
        <Text
          style={{
            flex: 1,
            fontSize: 14,
            fontFamily: fonts.regular,
            color: bought ? muted : colors.text,
            textDecorationLine: bought ? "line-through" : "none"
          }}
        >
          {formatShoppingItem(item)}
        </Text>
      </Pressable>
    </Animated.View>
  );
});
