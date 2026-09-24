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

function textInfoDirection(locale: Intl.Locale & LocaleTextInfo): string | undefined {
  const info = typeof locale.getTextInfo === "function" ? locale.getTextInfo() : locale.textInfo;
  return info?.direction;
}

function scriptDirectionIsRtl(locale: Intl.Locale): boolean {
  const script = locale.maximize().script;
  return script !== undefined && RTL_SCRIPTS.has(script);
}

export function isRtlLocale(tag: string): boolean {
  const locale = parseLocale(tag);
  if (locale === undefined) {
    return false;
  }
  try {
    const direction = textInfoDirection(locale);
    if (direction === "rtl" || direction === "ltr") {
      return direction === "rtl";
    }
    return scriptDirectionIsRtl(locale);
  } catch {
    return false;
  }
}
