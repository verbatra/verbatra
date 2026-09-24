const RTL_SCRIPTS: ReadonlySet<string> = new Set([
  "Adlm",
  "Arab",
  "Aran",
  "Armi",
  "Avst",
  "Chrs",
  "Cprt",
  "Elym",
  "Gara",
  "Hatr",
  "Hebr",
  "Hung",
  "Khar",
  "Lydi",
  "Mand",
  "Mani",
  "Mend",
  "Merc",
  "Mero",
  "Narb",
  "Nbat",
  "Nkoo",
  "Orkh",
  "Ougr",
  "Palm",
  "Phli",
  "Phlp",
  "Phnx",
  "Prti",
  "Rohg",
  "Samr",
  "Sarb",
  "Sidt",
  "Sogd",
  "Sogo",
  "Syrc",
  "Syre",
  "Syrj",
  "Syrn",
  "Thaa",
  "Yezi",
]);

interface TextInfo {
  readonly direction?: string;
}

interface LocaleTextInfo {
  getTextInfo?: () => TextInfo;
  readonly textInfo?: TextInfo;
}

function parseLocale(tag: string): Intl.Locale | undefined {
  try {
    return new Intl.Locale(tag.replaceAll("_", "-"));
  } catch {
    return undefined;
  }
}

const directionCache = new Map<string, boolean>();

function textInfoDirection(locale: Intl.Locale & LocaleTextInfo): string | undefined {
  try {
    const info = typeof locale.getTextInfo === "function" ? locale.getTextInfo() : locale.textInfo;
    return info?.direction;
  } catch {
    return undefined;
  }
}

function scriptDirectionIsRtl(locale: Intl.Locale): boolean {
  try {
    const script = locale.maximize().script;
    return script !== undefined && RTL_SCRIPTS.has(script);
  } catch {
    return false;
  }
}

function resolveIsRtl(tag: string): boolean {
  const locale = parseLocale(tag);
  if (locale === undefined) {
    return false;
  }
  const direction = textInfoDirection(locale);
  if (direction === "rtl" || direction === "ltr") {
    return direction === "rtl";
  }
  return scriptDirectionIsRtl(locale);
}

export function isRtlLocale(tag: string): boolean {
  const cached = directionCache.get(tag);
  if (cached !== undefined) {
    return cached;
  }
  const rtl = resolveIsRtl(tag);
  directionCache.set(tag, rtl);
  return rtl;
}
