import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import {
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthButton } from "../../src/components/auth-ui";
import { useOnboardingSeen } from "../../src/onboarding";
import { colors, fonts } from "../../src/theme";

const pages = [
  {
    key: "welcome",
    mascot: require("../../assets/finance/mascote-login.png"),
    kicker: "Zelo",
    title: "Quem cuida da sua vida",
    body: "Dinheiro, casa, prazos e a secretária no WhatsApp. Você para de carregar tudo sozinho."
  },
  {
    key: "finance",
    mascot: require("../../assets/finance/mascot-header.png"),
    kicker: "Financeiro",
    title: "Seu dinheiro no lugar",
    body: "Gastos, categorias e extrato em um só lugar. Sem banco, sem enrolação."
  },
  {
    key: "home",
    mascot: require("../../assets/finance/mascote-header-mercado.png"),
    kicker: "Casa",
    title: "Mercado e lembretes juntos",
    body: "Lista do supermercado por setor e avisos do que não pode passar."
  },
  {
    key: "secretary",
    mascot: require("../../assets/finance/mascote-header-lembretes.png"),
    kicker: "Secretária",
    title: "O Zelo no WhatsApp",
    body: "Confirme seu número e a secretária cobra contas, consultas e prazos por mensagem."
  }
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { markSeen } = useOnboardingSeen();
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === pages.length - 1;

  const finish = async (href: "/(auth)/register" | "/(auth)/login") => {
    await markSeen();
    router.replace(href);
  };

  const goNext = () => {
    if (last) {
      void finish("/(auth)/register");
      return;
    }
    const next = page + 1;
    pager.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <Pressable
        onPress={() => void finish("/(auth)/login")}
        hitSlop={12}
        style={{ position: "absolute", top: insets.top + 12, right: 24, zIndex: 3 }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: fonts.regular }}>Pular</Text>
      </Pressable>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {pages.map((item) => (
          <View key={item.key} style={{ width, flex: 1 }}>
            <View style={{ height: insets.top + 268, overflow: "hidden" }}>
              <LinearGradient
                colors={["#0878F9", "#599EEB"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  borderBottomLeftRadius: 200,
                  borderBottomRightRadius: 200
                }}
              />
              <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
                <Image
                  source={item.mascot}
                  resizeMode="contain"
                  style={{ width: width * 0.78, height: 250, marginBottom: -8 }}
                />
              </View>
            </View>
            <View style={{ paddingHorizontal: 28, paddingTop: 28 }}>
              <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: colors.accent }}>{item.kicker}</Text>
              <Text
                style={{
                  marginTop: 8,
                  fontSize: 28,
                  lineHeight: 34,
                  letterSpacing: 0.2,
                  fontFamily: fonts.bold,
                  color: colors.text
                }}
              >
                {item.title}
              </Text>
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 15,
                  lineHeight: 22,
                  fontFamily: fonts.regular,
                  color: colors.textMuted
                }}
              >
                {item.body}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 28, paddingBottom: Math.max(insets.bottom, 16), gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {pages.map((item, index) => (
            <View
              key={item.key}
              style={{
                width: index === page ? 22 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: index === page ? colors.accent : colors.border
              }}
            />
          ))}
        </View>
        <AuthButton label={last ? "Criar conta" : "Continuar"} onPress={goNext} />
        {last ? (
          <AuthButton label="Já tenho conta" ghost onPress={() => void finish("/(auth)/login")} />
        ) : (
          <Pressable onPress={() => void finish("/(auth)/login")} style={{ alignItems: "center", paddingVertical: 10 }}>
            <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.regular }}>Já tenho conta</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
