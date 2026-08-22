import type { ShoppingSector, ShoppingSectorMemory } from "./types.js";

export const shoppingSectors: ShoppingSector[] = [
  "hortifruti",
  "padaria",
  "acougue",
  "frios",
  "congelados",
  "mercearia",
  "bebidas",
  "higiene",
  "limpeza",
  "pets",
  "bazar",
  "outros"
];

export const shoppingSectorLabels: Record<ShoppingSector, string> = {
  hortifruti: "Hortifruti",
  padaria: "Padaria",
  acougue: "Acougue",
  frios: "Frios e Laticinios",
  congelados: "Congelados",
  mercearia: "Mercearia",
  bebidas: "Bebidas",
  higiene: "Higiene",
  limpeza: "Limpeza",
  pets: "Pets",
  bazar: "Bazar",
  outros: "Outros"
};

const sectorRank = Object.fromEntries(shoppingSectors.map((sector, index) => [sector, index])) as Record<
  ShoppingSector,
  number
>;

export const foldShoppingName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[•–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const isShoppingSector = (value: unknown): value is ShoppingSector =>
  typeof value === "string" && (shoppingSectors as readonly string[]).includes(value);

export const shoppingSectorLabel = (sector?: ShoppingSector | string) =>
  isShoppingSector(sector) ? shoppingSectorLabels[sector] : shoppingSectorLabels.outros;

const rules: Array<{ sector: ShoppingSector; keywords: string[] }> = [
  {
    sector: "congelados",
    keywords: [
      "congelad",
      "nugget",
      "empanado",
      "fishburger",
      "petit gateau",
      "sorvete",
      "acai",
      "picole",
      "gelo"
    ]
  },
  {
    sector: "bebidas",
    keywords: [
      "cafe gelado",
      "cha gelado",
      "agua com gas",
      "agua sem gas",
      "agua de coco",
      "agua",
      "suco",
      "refri",
      "refrigerante",
      "coca",
      "guarana",
      "fanta",
      "sprite",
      "pepsi",
      "schweppes",
      "tonica",
      "cerveja",
      "vinho",
      "espumante",
      "whisky",
      "vodka",
      "gin",
      "energetico",
      "isotonic",
      "gatorade",
      "h2oh",
      "dell vale",
      "del valle",
      "prats",
      "tang"
    ]
  },
  {
    sector: "hortifruti",
    keywords: [
      "fruta",
      "verdura",
      "legume",
      "banana",
      "maca",
      "mamao",
      "laranja",
      "limao",
      "abacate",
      "mamao",
      "uva",
      "morango",
      "melancia",
      "melao",
      "abacaxi",
      "kiwi",
      "pera",
      "manga",
      "goiaba",
      "caqui",
      "alface",
      "rucula",
      "agriao",
      "couve",
      "repolho",
      "brocolis",
      "couve flor",
      "tomate",
      "cebola",
      "alho",
      "batata",
      "cenoura",
      "beterraba",
      "abobrinha",
      "berinjela",
      "pepino",
      "pimentao",
      "chuchu",
      "inhame",
      "mandioca",
      "aipim",
      "milho verde",
      "hortela",
      "salsa",
      "salsinha",
      "cebolinha",
      "coentro",
      "manjericao",
      "gengibre",
      "cheiro verde",
      "ovo"
    ]
  },
  {
    sector: "padaria",
    keywords: [
      "pao",
      "baguete",
      "baguette",
      "bisnaguinha",
      "bisnaga",
      "tosta",
      "torrada",
      "bolo",
      "sonho",
      "croissant",
      "padeiro",
      "rosca",
      "cueca virada",
      "massa folhada",
      "pao de queijo"
    ]
  },
  {
    sector: "acougue",
    keywords: [
      "carne",
      "alcatra",
      "patinho",
      "coxao",
      "picanha",
      "maminha",
      "contra file",
      "file mignon",
      "costela",
      "acem",
      "fraldinha",
      "linguiça",
      "linguica",
      "salsicha",
      "frango",
      "peito de frango",
      "coxa",
      "sobrecoxa",
      "asa de frango",
      "bacon",
      "lombo",
      "pernil",
      "porco",
      "bovina",
      "moída",
      "moida",
      "hamburguer",
      "steak",
      "peixe",
      "salmao",
      "tilapia",
      "merluza",
      "camarao"
    ]
  },
  {
    sector: "frios",
    keywords: [
      "leite",
      "iogurte",
      "yogurt",
      "queijo",
      "mussarela",
      "requeijao",
      "cream cheese",
      "manteiga",
      "margarina",
      "nata",
      "creme de leite",
      "danone",
      "activia",
      "batavo",
      "chandelle",
      "pudim",
      "danette",
      "petit suisse",
      "coalhada",
      "ricota",
      "cottage",
      "presunto",
      "apresuntado",
      "mortadela",
      "salame",
      "peito de peru",
      "blanquet"
    ]
  },
  {
    sector: "mercearia",
    keywords: [
      "vinagre",
      "azeite",
      "oleo",
      "óleo",
      "arroz",
      "feijao",
      "feijão",
      "macarrao",
      "macarrão",
      "espaguete",
      "penne",
      "parafuso",
      "molho",
      "extrato",
      "catchup",
      "ketchup",
      "mostarda",
      "maionese",
      "shoyu",
      "molho ingles",
      "tempero",
      "sal ",
      "acucar",
      "açúcar",
      "farinha",
      "fuba",
      "amido",
      "fermento",
      "aveia",
      "granola",
      "cereal",
      "sucrilhos",
      "cafe",
      "cha",
      "achocolatado",
      "nescau",
      "toddy",
      "leite em po",
      "atum",
      "sardinha",
      "milho",
      "ervilha",
      "seleta",
      "champignon",
      "azeitona",
      "palmito",
      " conserv",
      "coco ralado",
      "coco",
      "leite de coco",
      "creme de coco",
      "passas",
      "castanha",
      "nozes",
      "amendoim",
      "biscoito",
      "bolacha",
      "cookie",
      "wafer",
      "torrada",
      "snacks",
      "salgadinho",
      "batata palha",
      "pipoca",
      "miojo",
      "instantaneo",
      "enlatado",
      "massa de tomate",
      "barilla",
      "hellmanns",
      "hellmans"
    ]
  },
  {
    sector: "higiene",
    keywords: [
      "shampoo",
      "condicionador",
      "sabonete",
      "sabao em barra",
      "pasta de dente",
      "creme dental",
      "escova de dente",
      "fio dental",
      "enxaguante",
      "desodorante",
      "antitranspirante",
      "papel higienico",
      "papel higiênico",
      "absorvente",
      "protetor diario",
      "fralda",
      "lenco",
      "lenco umedecido",
      "algodao",
      "cotonete",
      "hidratante",
      "protetor solar",
      "barbeador",
      "gilete",
      "gillette",
      "aparelho de barbear",
      "espuma de barbear",
      "anti caspa",
      "anticaspa",
      "head shoulders",
      "colgate",
      "pantene",
      "dove",
      "nivea",
      "rexona"
    ]
  },
  {
    sector: "limpeza",
    keywords: [
      "detergente",
      "desinfetante",
      "agua sanitaria",
      "agua sanitária",
      "alvejante",
      "amaciante",
      "sabao em po",
      "sabao liquido",
      "lava roupa",
      "multiuso",
      "limpa",
      "veja",
      "ypê",
      "ype",
      "ajax",
      "bombril",
      "esponja",
      "saco de lixo",
      "lixo",
      "cheirinho",
      "odorizador",
      "pastilha",
      "desodorizador",
      "banheiro",
      "sanitario",
      "pano de chao",
      "pano de prato",
      "papel toalha",
      "guardanapo",
      "filme plastico",
      "papel aluminio",
      "papel alumínio",
      "fosforo",
      "fosforo"
    ]
  },
  {
    sector: "pets",
    keywords: ["racao", "ração", "petisco", "areia de gato", "areia sanitaria", "sachê", "sache gato", "cachorro", "gato"]
  },
  {
    sector: "bazar",
    keywords: [
      "faixa",
      "pilha",
      "bateria",
      "lampada",
      "lâmpada",
      "tomada",
      "extensao",
      "vela",
      "isqueiro",
      "pano",
      "toalha",
      "utilidade",
      "organizador"
    ]
  }
];

export const classifyShoppingSector = (
  name: string,
  hints?: { memory?: ShoppingSectorMemory; items?: Array<{ name: string; sector?: ShoppingSector }> }
): ShoppingSector => {
  const key = foldShoppingName(name);
  if (!key) return "outros";

  const remembered = hints?.memory?.[key];
  if (isShoppingSector(remembered)) return remembered;

  const previous = [...(hints?.items ?? [])]
    .reverse()
    .find((item) => foldShoppingName(item.name) === key && isShoppingSector(item.sector) && item.sector !== "outros");
  if (previous?.sector) return previous.sector;

  let best: { sector: ShoppingSector; length: number; rank: number } | undefined;
  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      const needle = foldShoppingName(keyword);
      if (!needle || !key.includes(needle)) continue;
      const rank = sectorRank[rule.sector];
      if (!best || needle.length > best.length || (needle.length === best.length && rank < best.rank)) {
        best = { sector: rule.sector, length: needle.length, rank };
      }
    }
  }

  return best?.sector ?? "outros";
};

export const rememberShoppingSector = (memory: ShoppingSectorMemory | undefined, name: string, sector: ShoppingSector) => {
  const key = foldShoppingName(name);
  if (!key || sector === "outros") return memory ?? {};
  return { ...memory, [key]: sector };
};

export const normalizeShoppingSectorMemory = (value: unknown): ShoppingSectorMemory => {
  if (!value || typeof value !== "object") return {};
  const memory: ShoppingSectorMemory = {};
  for (const [rawKey, rawSector] of Object.entries(value as Record<string, unknown>)) {
    const key = foldShoppingName(rawKey);
    if (key && isShoppingSector(rawSector)) memory[key] = rawSector;
  }
  return memory;
};

export const groupShoppingItemsBySector = <T extends { sector?: ShoppingSector }>(items: T[]) =>
  shoppingSectors
    .map((sector) => ({
      sector,
      label: shoppingSectorLabels[sector],
      items: items.filter((item) => (isShoppingSector(item.sector) ? item.sector : "outros") === sector)
    }))
    .filter((group) => group.items.length > 0);
