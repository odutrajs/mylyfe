import {
  buildSpendCoachBrief,
  resolveLocalSpendCoachTurn,
  type SpendCoachMessage,
  type SpendCoachTurn
} from "@mylyfe/domain";
import { StatusBar } from "expo-status-bar";
import { Sparkles, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest } from "../api";
import { useAuth } from "../auth-context";
import { preciseCurrency } from "../format";
import { usePlan } from "../plan-context";
import { colors, fonts, inputReset } from "../theme";
import { Mascot } from "./Mascot";
import { OverlayModal } from "./OverlayModal";

const muted = "#808080";
const cardBorder = "rgba(0, 0, 0, 0.05)";

export function SpendCoachSheet({
  month,
  visible,
  onClose
}: {
  month: string;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { plan } = usePlan();
  const [messages, setMessages] = useState<SpendCoachMessage[]>([]);
  const [turn, setTurn] = useState<SpendCoachTurn | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);
  const requestId = useRef(0);
  const remoteReady = useRef<boolean | null>(null);

  const localTurn = (history: SpendCoachMessage[]) => {
    if (!plan) throw new Error("Não encontrei seus dados financeiros.");
    return resolveLocalSpendCoachTurn(buildSpendCoachBrief(plan, month), history);
  };

  const ask = async (history: SpendCoachMessage[]) => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      let next: SpendCoachTurn | null = null;
      if (remoteReady.current !== false && session?.planId) {
        try {
          const response = await apiRequest(`/plans/${session.planId}/spend-coach`, {
            method: "POST",
            body: JSON.stringify({ month, messages: history })
          });
          next = (await response.json()) as SpendCoachTurn;
          remoteReady.current = true;
        } catch {
          remoteReady.current = false;
        }
      }
      if (!next) next = localTurn(history);
      if (id !== requestId.current) return;
      setTurn(next);
      if (next.status === "question" && next.question) {
        setMessages([...history, { role: "assistant", content: next.question, status: "question" }]);
      } else if (next.summary) {
        setMessages([...history, { role: "assistant", content: next.summary, status: "advice" }]);
      }
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : "Não consegui analisar seus custos agora.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) {
      started.current = false;
      requestId.current += 1;
      setMessages([]);
      setTurn(null);
      setDraft("");
      setError("");
      setLoading(false);
      return;
    }
    if (started.current) return;
    started.current = true;
    void ask([]);
  }, [visible]);

  const reply = (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    const history = [...messages, { role: "user" as const, content }];
    setMessages(history);
    setDraft("");
    setTurn(null);
    void ask(history);
  };

  return (
    <OverlayModal visible={visible} onClose={onClose}>
      <StatusBar style="dark" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: "92%",
              paddingHorizontal: 24,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 12) + 8
            }}
          >
            <View style={{ alignSelf: "center", width: 42, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Sparkles size={16} color={colors.accent} />
                <Text style={{ fontSize: 16, fontFamily: fonts.semibold, color: colors.text }}>Análise de custos</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fechar">
                <X size={18} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 16, paddingBottom: 12 }}
              style={{ maxHeight: 520 }}
            >
              {loading && !turn ? (
                <View style={{ alignItems: "center", paddingVertical: 20, gap: 10 }}>
                  <Mascot size={72} mood="think" interactive={false} />
                  <ActivityIndicator color={colors.accent} />
                  <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: muted, textAlign: "center" }}>
                    Estou lendo ganhos, gastos e quanto você está poupando…
                  </Text>
                </View>
              ) : null}

              {error ? (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: 14, fontFamily: fonts.regular, color: colors.danger }}>{error}</Text>
                  <Pressable
                    onPress={() => void ask(messages)}
                    style={{
                      height: 48,
                      borderRadius: 100,
                      backgroundColor: colors.accentSoft,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Text style={{ fontSize: 15, fontFamily: fonts.semibold, color: colors.accent }}>Tentar de novo</Text>
                  </Pressable>
                </View>
              ) : null}

              {turn?.status === "question" ? (
                <View style={{ gap: 12 }}>
                  <Mascot size={64} mood="search" interactive={false} />
                  <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: colors.accent }}>Preciso de um contexto</Text>
                  <Text style={{ fontSize: 18, fontFamily: fonts.semibold, color: colors.text, lineHeight: 26 }}>
                    {turn.question}
                  </Text>
                  {turn.about ? (
                    <View
                      style={{
                        alignSelf: "flex-start",
                        backgroundColor: colors.accentSoft,
                        borderRadius: 100,
                        paddingHorizontal: 12,
                        paddingVertical: 6
                      }}
                    >
                      <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: colors.accent }}>
                        {turn.about.name}
                        {typeof turn.about.amount === "number" ? ` · ${preciseCurrency.format(turn.about.amount)}` : ""}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {turn?.status === "advice" ? (
                <View style={{ gap: 16 }}>
                  <Mascot size={64} mood="work" interactive={false} />
                  <Text style={{ fontSize: 16, fontFamily: fonts.regular, color: colors.text, lineHeight: 24 }}>
                    {turn.summary}
                  </Text>
                  {turn.hotspots.map((item) => (
                    <View
                      key={`${item.title}-${item.amount}`}
                      style={{
                        borderWidth: 1,
                        borderColor: cardBorder,
                        borderRadius: 20,
                        padding: 14,
                        gap: 4
                      }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: muted }}>Onde mais pesa</Text>
                      <Text style={{ fontSize: 15, fontFamily: fonts.semibold, color: colors.text }}>{item.title}</Text>
                      <Text style={{ fontSize: 16, fontFamily: fonts.semibold, color: colors.danger }}>
                        {preciseCurrency.format(item.amount)}
                      </Text>
                      <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: muted }}>{item.why}</Text>
                    </View>
                  ))}
                  {turn.cuts.map((item) => (
                    <View
                      key={`${item.title}-${item.monthlySave}`}
                      style={{
                        borderWidth: 1,
                        borderColor: cardBorder,
                        borderRadius: 20,
                        padding: 14,
                        gap: 4,
                        backgroundColor: colors.successSoft
                      }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: colors.success }}>Dá para reduzir</Text>
                      <Text style={{ fontSize: 15, fontFamily: fonts.semibold, color: colors.text }}>{item.title}</Text>
                      {item.monthlySave > 0 ? (
                        <Text style={{ fontSize: 16, fontFamily: fonts.semibold, color: colors.success }}>
                          até {preciseCurrency.format(item.monthlySave)} / mês
                        </Text>
                      ) : null}
                      <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: muted }}>{item.how}</Text>
                    </View>
                  ))}
                  {turn.nextStep ? (
                    <Text style={{ fontSize: 14, fontFamily: fonts.medium, color: colors.text, lineHeight: 22 }}>
                      Próximo passo: {turn.nextStep}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            {turn && !loading ? (
              <View style={{ gap: 10, paddingTop: 8 }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={turn.status === "question" ? "Responda aqui" : "Quer detalhar alguma conta?"}
                  placeholderTextColor={muted}
                  multiline
                  style={{
                    minHeight: 52,
                    maxHeight: 100,
                    borderWidth: 1,
                    borderColor: cardBorder,
                    borderRadius: 18,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    fontSize: 15,
                    fontFamily: fonts.regular,
                    color: colors.text,
                    ...inputReset
                  }}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {turn.status === "question" ? (
                    <Pressable
                      onPress={() => reply("Pode seguir sem essa resposta.")}
                      style={{
                        flex: 1,
                        height: 50,
                        borderRadius: 100,
                        backgroundColor: colors.background,
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Text style={{ fontSize: 15, fontFamily: fonts.medium, color: colors.text }}>Pular</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => reply(draft)}
                    disabled={!draft.trim()}
                    style={{
                      flex: 2,
                      height: 50,
                      borderRadius: 100,
                      backgroundColor: draft.trim() ? colors.accent : colors.accentSoft,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <Text style={{ fontSize: 15, fontFamily: fonts.bold, color: draft.trim() ? "#FFFFFF" : colors.accent }}>
                      {turn.status === "question" ? "Responder" : "Perguntar"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
    </OverlayModal>
  );
}
