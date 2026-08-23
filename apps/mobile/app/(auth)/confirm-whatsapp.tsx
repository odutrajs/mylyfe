import { findPersonByEmail, isValidWhatsappPhone, type FinancePlan } from "@mylyfe/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Check, Smartphone } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { apiRequest, ApiError } from "../../src/api";
import { useAuth, useAuthSession } from "../../src/auth-context";
import { AuthButton, AuthScreen, FloatingField, authPlaceholder, authStyles } from "../../src/components/auth-ui";
import { formatWhatsappDisplay, maskWhatsapp } from "../../src/format";
import { colors, fonts } from "../../src/theme";

function CodeBoxes({
  value,
  onChange,
  invalid
}: {
  value: string;
  onChange: (next: string) => void;
  invalid: boolean;
}) {
  const inputRef = useRef<TextInput>(null);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.row}>
      {Array.from({ length: 6 }, (_, index) => (
        <View
          key={index}
          style={[
            styles.box,
            value.length === index ? styles.boxActive : null,
            invalid ? styles.boxInvalid : null
          ]}
        >
          <Text style={styles.digit}>{value[index] ?? ""}</Text>
        </View>
      ))}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(next) => onChange(next.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        caretHidden
        style={styles.hidden}
      />
    </Pressable>
  );
}

export default function ConfirmWhatsAppScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const { enterApp } = useAuth();
  const session = useAuthSession();
  const [phone, setPhone] = useState(formatWhatsappDisplay(params.phone) || "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(Boolean(params.phone && isValidWhatsappPhone(String(params.phone))));
  const [busy, setBusy] = useState<"start" | "confirm" | "">("");
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const startedRef = useRef(false);

  const goIn = () => {
    enterApp();
    router.replace("/(tabs)/home");
  };

  const goConfirmed = () => {
    setVerified(true);
    router.replace("/(auth)/whatsapp-confirmed");
  };

  const start = async (nextPhone = phone) => {
    if (!isValidWhatsappPhone(nextPhone)) {
      setError("Informe um WhatsApp válido com DDD. Ex: 41 99999-0000.");
      return;
    }
    setBusy("start");
    setError("");
    try {
      await apiRequest("/secretary/phone/start", {
        method: "POST",
        body: JSON.stringify({ phone: nextPhone })
      });
      setSent(true);
      setCode("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não consegui enviar o código no WhatsApp.");
    } finally {
      setBusy("");
    }
  };

  const confirm = async () => {
    if (code.length !== 6) return;
    setBusy("confirm");
    setError("");
    try {
      const response = await apiRequest("/secretary/phone/confirm", {
        method: "POST",
        body: JSON.stringify({ phone, code })
      });
      const payload = (await response.json()) as { whatsappVerifiedAt?: string };
      if (!payload.whatsappVerifiedAt) {
        setError("Código inválido ou vencido.");
        return;
      }
      goConfirmed();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Código inválido ou vencido.");
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    const hydrate = async () => {
      if (!session?.planId) {
        if (sent && !startedRef.current) {
          startedRef.current = true;
          void start();
        }
        return;
      }
      try {
        const response = await apiRequest(`/plans/${session.planId}`);
        const plan = (await response.json()) as FinancePlan;
        const person =
          findPersonByEmail(plan, session.email) ?? plan.profile.people.find((item) => item.role === "primary");
        if (person?.whatsappVerifiedAt) {
          goConfirmed();
          return;
        }
        if (person?.phone && !params.phone) setPhone(formatWhatsappDisplay(person.phone));
      } catch {
        /* keep the form usable */
      }
      if (sent && !startedRef.current) {
        startedRef.current = true;
        void start();
      }
    };
    void hydrate();
  }, []);

  useEffect(() => {
    const planId = session?.planId;
    if (!planId || verified) return;
    let active = true;
    const tick = async () => {
      try {
        const response = await apiRequest(`/plans/${planId}`);
        const plan = (await response.json()) as FinancePlan;
        const person =
          findPersonByEmail(plan, session?.email) ?? plan.profile.people.find((item) => item.role === "primary");
        if (active && person?.whatsappVerifiedAt) goConfirmed();
      } catch {
        /* keep waiting for the WhatsApp reply */
      }
    };
    const timer = setInterval(() => void tick(), 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session?.email, session?.planId, verified]);

  if (verified) {
    return (
      <AuthScreen compact>
        <StatusBar style="light" />
        <View style={styles.check}>
          <Check size={36} color="#FFFFFF" strokeWidth={2.6} />
        </View>
        <View style={styles.badge}>
          <Check size={14} color={colors.success} strokeWidth={2.4} />
          <Text style={styles.badgeText}>Número confirmado</Text>
        </View>
        <Text style={authStyles.title}>WhatsApp confirmado</Text>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen compact>
      <StatusBar style="light" />
      <Text style={authStyles.title}>Confirme seu WhatsApp</Text>
      {sent ? (
        <Text style={authStyles.body}>
          Mandei um código de 6 dígitos para {formatWhatsappDisplay(phone) || phone}. Confirma aqui ou responde a
          mensagem.
        </Text>
      ) : (
        <Text style={authStyles.body}>Com o número confirmado, a secretária junta gastos e reuniões à sua conta.</Text>
      )}

      {!sent ? (
        <FloatingField label="WhatsApp" icon={<Smartphone size={20} color={authPlaceholder} strokeWidth={1.8} />}>
          <TextInput
            value={phone}
            onChangeText={(value) => setPhone(maskWhatsapp(value))}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            placeholder="41 99999-0000"
            placeholderTextColor={authPlaceholder}
            style={authStyles.input}
          />
        </FloatingField>
      ) : (
        <CodeBoxes value={code} onChange={(next) => { setCode(next); setError(""); }} invalid={Boolean(error)} />
      )}

      {error ? <Text style={[authStyles.error, { textAlign: "center" }]}>{error}</Text> : null}

      {sent ? (
        <Pressable onPress={() => void start()} disabled={Boolean(busy)}>
          <Text style={authStyles.linkCenter}>Reenviar código</Text>
        </Pressable>
      ) : null}

      <AuthButton
        label={sent ? "Confirmar WhatsApp" : "Enviar código"}
        onPress={() => void (sent ? confirm() : start())}
        busy={busy === "confirm" || busy === "start"}
        disabled={sent ? code.length !== 6 : !isValidWhatsappPhone(phone)}
      />

      <Pressable onPress={goIn}>
        <Text style={authStyles.linkCenter}>Agora não. Fazer depois</Text>
      </Pressable>

      <Text style={[authStyles.note, { textAlign: "center", marginTop: "auto" }]}>
        Sem confirmar, a secretária não reconhece gastos e reuniões deste número.
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  box: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center"
  },
  boxActive: {
    borderColor: colors.accent,
    borderWidth: 1.5
  },
  boxInvalid: {
    borderColor: colors.danger
  },
  digit: {
    fontSize: 22,
    lineHeight: 28,
    color: colors.text,
    fontFamily: fonts.semibold
  },
  hidden: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.02
  },
  check: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center"
  },
  badge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.successSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  badgeText: {
    color: colors.success,
    fontSize: 13,
    fontFamily: fonts.semibold
  }
});
