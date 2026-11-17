// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { i18n, type Locale } from "@/lib/i18n";
import { IMPRINT_PROVIDER_LINES } from "@/lib/legal-imprint";
import { PACKAGE_MANAGER_GROUP } from "@/lib/package-manager-tabs";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { ANALYTICS_CHOICE_COOKIE, LEGACY_OPT_OUT_COOKIE } from "@/lib/umami-config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = join(HERE, "../../../../messages");

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: loadMessages(locale), namespace: namespace as never }),
}));

const { default: PrivacyPage } = await import("./page");

async function renderPrivacy(locale: Locale): Promise<Document> {
  const page = await PrivacyPage({ params: Promise.resolve({ lang: locale }) });
  return new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
}

function sectionText(doc: Document, heading: RegExp): string {
  const h2 = Array.from(doc.querySelectorAll("h2")).find((node) =>
    heading.test(node.textContent ?? ""),
  );
  return h2?.closest("section")?.textContent?.replace(/\s+/g, " ") ?? "";
}

function expectedHref(locale: Locale, path: string): string {
  return locale === "en" ? path : `/${locale}${path}`;
}

function sectionNumbered(doc: Document, n: number): Element | null {
  return (
    Array.from(doc.querySelectorAll("h2"))
      .find((node) => node.textContent?.startsWith(`${n}. `))
      ?.closest("section") ?? null
  );
}

const IMPRINT_NAME_IN_TEXT: Record<Locale, string> = {
  en: "legal notice (Impressum)",
  de: "Impressum",
  es: "aviso legal (Impressum)",
  fr: "mentions légales (Impressum)",
  "zh-CN": "法律声明（Impressum）",
  "pt-BR": "aviso legal (Impressum)",
  ja: "運営者情報（Impressum）",
};

const NO_DPO_PHRASE: Record<Locale, RegExp> = {
  en: /No data protection officer has been appointed/,
  de: /Ein Datenschutzbeauftragter ist nicht benannt/,
  es: /No se ha designado un delegado de protección de datos/,
  fr: /Aucun délégué à la protection des données n’a été désigné/,
  "zh-CN": /我们没有指定数据保护官/,
  "pt-BR": /Nenhum encarregado de proteção de dados foi nomeado/,
  ja: /データ保護オフィサーは指名していません/,
};

const OBJECTION_CROSS_REFERENCE: Record<Locale, RegExp> = {
  en: /\bsection 9\b/,
  de: /\bAbschnitt 9\b/,
  es: /\bsección 9\b/,
  fr: /\bsection 9\b/,
  "zh-CN": /第 9 节/,
  "pt-BR": /\bseção 9\b/,
  ja: /第 9 節/,
};

const ARCJET_RETENTION: Record<Locale, RegExp> = {
  en: /retains this request data for 30 days and retains aggregated data derived from it for longer/,
  de: /speichert Arcjet diese Anfragedaten 30 Tage lang und daraus abgeleitete aggregierte Daten länger/,
  es: /conserva estos datos de la solicitud durante 30 días y conserva durante más tiempo los datos agregados/,
  fr: /conserve ces données de requête pendant 30 jours et conserve plus longtemps les données agrégées/,
  "zh-CN": /Arcjet 会将这些请求数据保留 30 天，并将由其派生的汇总数据保留更长时间/,
  "pt-BR":
    /retém esses dados da requisição por 30 dias e retém por mais tempo os dados agregados derivados deles/,
  ja: /Arcjet はこのリクエストデータを 30 日間保持し、そこから得た集計データはそれより長く保持します/,
};

const ARCJET_THIRD_COUNTRY: Record<Locale, RegExp> = {
  en: /transferred to the United States, a third country \(Art\. 44 ff\. GDPR\)/,
  de: /in die USA, ein Drittland, übermittelt werden \(Art\. 44 ff\. DSGVO\)/,
  es: /transferirse a Estados Unidos, un tercer país \(art\. 44 y ss\. del RGPD\)/,
  fr: /transférées vers les États-Unis, un pays tiers \(art\. 44 et suivants du RGPD\)/,
  "zh-CN": /传输到美国这个第三国（GDPR 第 44 条及以下）/,
  "pt-BR": /transferidos para os Estados Unidos, um país terceiro \(art\. 44 e seguintes do GDPR\)/,
  ja: /第三国である米国に移転される可能性があります（GDPR 第 44 条以下）/,
};

const ARCJET_SAFEGUARD: Record<Locale, RegExp> = {
  en: /not certified under the EU-U\.S\. Data Privacy Framework.*EU Standard Contractual Clauses \(Art\. 46\(2\)\(c\) GDPR\)/,
  de: /nicht unter dem EU-US-Datenschutzrahmen zertifiziert.*EU-Standardvertragsklauseln \(Art\. 46 Abs\. 2 lit\. c DSGVO\)/,
  es: /no está certificada en el marco del EU-U\.S\. Data Privacy Framework.*cláusulas contractuales tipo de la UE \(art\. 46\.2\.c\) del RGPD\)/,
  fr: /n’est pas certifiée au titre de l’EU-U\.S\. Data Privacy Framework.*clauses contractuelles types de l’UE \(art\. 46, paragraphe 2, point c\) du RGPD\)/,
  "zh-CN":
    /未获得欧盟-美国数据隐私框架（EU-U\.S\. Data Privacy Framework）认证.*欧盟标准合同条款（GDPR 第 46\(2\)\(c\) 条）/,
  "pt-BR":
    /não é certificada no EU-U\.S\. Data Privacy Framework.*Cláusulas Contratuais Padrão da UE \(art\. 46\(2\)\(c\) do GDPR\)/,
  ja: /EU-U\.S\. Data Privacy Framework の認証を受けていない.*EU 標準契約条項（GDPR 第 46\(2\)\(c\) 条）/,
};

const UMAMI_NOT_STORED: Record<Locale, RegExp> = {
  en: /Your IP address and user-agent string themselves are not stored\./,
  de: /Deine IP-Adresse und deine User-Agent-Zeichenkette selbst werden nicht gespeichert\./,
  es: /Tu dirección IP y tu cadena de user-agent en sí no se almacenan\./,
  fr: /Ton adresse IP et ta chaîne user-agent elles-mêmes ne sont pas conservées\./,
  "zh-CN": /你的 IP 地址和 user-agent 字符串本身不会存储。/,
  "pt-BR": /Seu endereço IP e sua string de user-agent em si não são armazenados\./,
  ja: /IP アドレスと user-agent 文字列そのものは保存しません。/,
};

const UMAMI_PSEUDONYMOUS: Record<Locale, RegExp> = {
  en: /pseudonymous session identifier by hashing/,
  de: /pseudonyme Sitzungskennung/,
  es: /identificador de sesión seudónimo/,
  fr: /identifiant de session pseudonyme/,
  "zh-CN": /计算出一个假名化的会话标识符/,
  "pt-BR": /identificador de sessão pseudônimo/,
  ja: /仮名化されたセッション識別子を計算します/,
};

const UMAMI_SAME_SERVER: Record<Locale, RegExp> = {
  en: /same server as this site \(see section 3\)/,
  de: /demselben Server wie diese Seite hosten \(siehe Abschnitt 3\)/,
  es: /mismo servidor que este sitio \(ver la sección 3\)/,
  fr: /même serveur que ce site \(voir la section 3\)/,
  "zh-CN": /与本站相同的服务器上（见第 3 节）/,
  "pt-BR": /mesmo servidor deste site \(veja a seção 3\)/,
  ja: /このサイトと同じサーバー（第 3 節を参照）で自前運用しているオープンソースの分析ツール Umami/,
};

const UMAMI_SERVER_FORWARD: Record<Locale, RegExp> = {
  en: /For this count, no analytics script runs in your browser, and nothing is written to your device for counting page views\..*our web server forwards .*: your IP address, your browser's user-agent string, the first language tag of your browser's Accept-Language header .*, the referring page \(without its query string\) and the path of the page you loaded/,
  de: /Für dieses Zählen läuft in deinem Browser kein Analyseskript, und zum Zählen der Seitenaufrufe wird nichts auf deinem Gerät gespeichert\..*leitet unser Webserver.*deine IP-Adresse, die User-Agent-Zeichenkette deines Browsers, das erste Sprachkürzel aus dem Accept-Language-Header deines Browsers .*, die verweisende Seite \(ohne ihre Query-Parameter\) und den Pfad der geladenen Seite/,
  es: /Para este recuento, en tu navegador no se ejecuta ningún script de analítica, y para contar las visitas no se escribe nada en tu dispositivo\..*nuestro servidor web reenvía .*: tu dirección IP, la cadena de user-agent de tu navegador, la primera etiqueta de idioma de la cabecera Accept-Language de tu navegador .*, la página de referencia \(sin sus parámetros de consulta\) y la ruta de la página que cargaste/,
  fr: /Pour ce comptage, aucun script de statistiques ne s’exécute dans ton navigateur, et rien n’est écrit sur ton appareil pour compter les pages vues\..*notre serveur web transmet .*: ton adresse IP, la chaîne user-agent de ton navigateur, la première balise de langue de l’en-tête Accept-Language de ton navigateur .*, la page référente \(sans ses paramètres de requête\) et le chemin de la page chargée/,
  "zh-CN":
    /对于这种统计，你的浏览器中不运行任何分析脚本，统计页面浏览量也不会向你的设备写入任何内容。.*我们的 Web 服务器会把该请求的以下信息转发给我们的 Umami 服务器：你的 IP 地址，你浏览器的 user-agent 字符串，浏览器 Accept-Language 请求头中的第一个语言标签.*，来源页面（不含其查询字符串），以及你加载的页面路径/,
  "pt-BR":
    /Para essa contagem, nenhum script de análise é executado no seu navegador, e nada é gravado no seu dispositivo para contar visualizações de página\..*nosso servidor web encaminha .*: seu endereço IP, a string de user-agent do seu navegador, a primeira etiqueta de idioma do cabeçalho Accept-Language do seu navegador .*, a página de referência \(sem a query string\) e o caminho da página que você carregou/,
  ja: /この集計では、ブラウザーで分析スクリプトは動作せず、ページビューの集計のためにデバイスへ書き込むものもありません。.*Web サーバーがそのリクエストの次の情報を Umami サーバーに転送します。IP アドレス、ブラウザーの user-agent 文字列、ブラウザーの Accept-Language ヘッダーの最初の言語タグ.*、参照元ページ（クエリ文字列を除く）、読み込んだページのパス/,
};

const UMAMI_SESSION_HASH: Record<Locale, RegExp> = {
  en: /hashing the website ID, your IP address, your user-agent string, a value that changes every month and a secret key of the server/,
  de: /indem er die Website-ID, deine IP-Adresse, deine User-Agent-Zeichenkette, einen monatlich wechselnden Wert und einen geheimen Schlüssel des Servers hasht/,
  es: /aplicando un hash al ID del sitio web, tu dirección IP, tu cadena de user-agent, un valor que cambia cada mes y una clave secreta del servidor/,
  fr: /en hachant l’identifiant du site, ton adresse IP, ta chaîne user-agent, une valeur qui change chaque mois et une clé secrète du serveur/,
  "zh-CN":
    /对网站 ID、你的 IP 地址、你的 user-agent 字符串、每月变化的一个值和服务器的一个密钥做哈希/,
  "pt-BR":
    /aplicando um hash ao ID do site, ao seu endereço IP, à sua string de user-agent, a um valor que muda todo mês e a uma chave secreta do servidor/,
  ja: /ウェブサイト ID、IP アドレス、user-agent 文字列、毎月変わる値、サーバーの秘密鍵をハッシュ化して/,
};

const UMAMI_GEOLITE: Record<Locale, RegExp> = {
  en: /country, region and city, which it looks up from your IP address in a GeoLite2 database on the same server/,
  de: /Land, Region und Stadt, die er aus deiner IP-Adresse in einer GeoLite2-Datenbank auf demselben Server ermittelt/,
  es: /país, región y ciudad, que obtiene a partir de tu dirección IP en una base de datos GeoLite2 del mismo servidor/,
  fr: /ton pays, ta région et ta ville, qu’il détermine à partir de ton adresse IP dans une base de données GeoLite2 sur le même serveur/,
  "zh-CN":
    /你的国家、地区和城市，这些信息由它在同一服务器上的 GeoLite2 数据库中根据你的 IP 地址查出/,
  "pt-BR":
    /país, região e cidade, que ele obtém a partir do seu endereço IP em um banco de dados GeoLite2 no mesmo servidor/,
  ja: /国、地域、都市は、同じサーバー上の GeoLite2 データベースで IP アドレスから調べ/,
};

const UMAMI_LEGAL_BASIS: Record<Locale, RegExp> = {
  en: /\(§ 25\(2\) no\. 2 TDDDG\), no consent under § 25 TDDDG is required for it\. The legal basis for the processing is Art\. 6\(1\)\(f\) GDPR/,
  de: /\(§ 25 Abs\. 2 Nr\. 2 TDDDG\), ist dafür keine Einwilligung nach § 25 TDDDG erforderlich\. Rechtsgrundlage der Verarbeitung ist Art\. 6 Abs\. 1 lit\. f DSGVO/,
  es: /\(§ 25, apartado 2, n\.º 2 de la TDDDG\), no se necesita para ello ningún consentimiento según el § 25 de la TDDDG\. La base jurídica del tratamiento es el art\. 6\.1\.f\) del RGPD/,
  fr: /\(§ 25, alinéa 2, point 2 du TDDDG\), aucun consentement au titre du § 25 TDDDG n’est nécessaire pour cela\. La base légale du traitement est l’art\. 6, paragraphe 1, point f\) du RGPD/,
  "zh-CN":
    /（§ 25 第 2 款第 2 项 TDDDG），因此依据 § 25 TDDDG 无需征得同意。处理的法律依据是 GDPR 第 6\(1\)\(f\) 条/,
  "pt-BR":
    /\(§ 25, parágrafo 2, nº 2 da TDDDG\), não é necessário consentimento nos termos do § 25 da TDDDG para isso\. A base legal do tratamento é o art\. 6\(1\)\(f\) do GDPR/,
  ja: /（§ 25 第 2 項第 2 号 TDDDG）、§ 25 TDDDG に基づく同意は不要です。処理の法的根拠は GDPR 第 6\(1\)\(f\) 条/,
};

const UMAMI_LANGUAGE_TAG_PER_PAGEVIEW: Record<Locale, RegExp> = {
  en: /first language tag of your browser's Accept-Language header \(for example en-US\), which is forwarded with each page view/,
  de: /erste Sprachkürzel aus dem Accept-Language-Header deines Browsers \(zum Beispiel de-DE\), das bei jedem Seitenaufruf weitergeleitet wird/,
  es: /primera etiqueta de idioma de la cabecera Accept-Language de tu navegador \(por ejemplo, es-ES\), que se reenvía con cada visita a una página/,
  fr: /première balise de langue de l’en-tête Accept-Language de ton navigateur \(par exemple fr-FR\), transmise à chaque page vue/,
  "zh-CN": /Accept-Language 请求头中的第一个语言标签（例如 en-US，每次页面浏览都会转发）/,
  "pt-BR":
    /primeira etiqueta de idioma do cabeçalho Accept-Language do seu navegador \(por exemplo, pt-BR\), que é encaminhada a cada visualização de página/,
  ja: /Accept-Language ヘッダーの最初の言語タグ（例：en-US、ページビューごとに転送されます）/,
};

const UMAMI_UTM_ONLY: Record<Locale, RegExp> = {
  en: /together with the five UTM parameters of the page address \(utm_source, utm_medium, utm_campaign, utm_term and utm_content, each shortened to 255 characters\); all other query parameters, such as advertising click identifiers, and the fragment are discarded and not forwarded\./,
  de: /zusammen mit den fünf UTM-Parametern der Seitenadresse \(utm_source, utm_medium, utm_campaign, utm_term und utm_content, jeweils auf 255 Zeichen gekürzt\); alle anderen Query-Parameter, etwa Klick-Kennungen von Werbenetzwerken, und das Fragment werden verworfen und nicht weitergeleitet\./,
  es: /junto con los cinco parámetros UTM de la dirección de la página \(utm_source, utm_medium, utm_campaign, utm_term y utm_content, cada uno acortado a 255 caracteres\); todos los demás parámetros de consulta, como los identificadores de clic publicitarios, y el fragmento se descartan y no se reenvían\./,
  fr: /avec les cinq paramètres UTM de l’adresse de la page \(utm_source, utm_medium, utm_campaign, utm_term et utm_content, chacun raccourci à 255 caractères\) ; tous les autres paramètres de requête, comme les identifiants de clic publicitaires, ainsi que le fragment sont écartés et ne sont pas transmis\./,
  "zh-CN":
    /连同页面地址中的五个 UTM 参数（utm_source、utm_medium、utm_campaign、utm_term 和 utm_content，每个截断为 255 个字符）；其他所有查询参数（例如广告点击标识符）和片段都会丢弃，不会转发。/,
  "pt-BR":
    /junto com os cinco parâmetros UTM do endereço da página \(utm_source, utm_medium, utm_campaign, utm_term e utm_content, cada um limitado a 255 caracteres\); todos os outros parâmetros de consulta, como identificadores de clique de publicidade, e o fragmento são descartados e não são encaminhados\./,
  ja: /ページアドレスの 5 つの UTM パラメーター（utm_source、utm_medium、utm_campaign、utm_term、utm_content。それぞれ 255 文字に切り詰め）です。広告のクリック ID などそれ以外のクエリパラメーターとフラグメントは破棄し、転送しません。/,
};

const NO_COOKIES_NO_SCRIPTS: Record<Locale, string> = {
  en: "loads no third-party script and no Umami script in your browser, runs no cross-site tracking, sets no cookies",
  de: "lädt kein Skript von Dritten und kein Umami-Skript in deinen Browser, betreibt kein seitenübergreifendes Tracking, setzt keine Cookies",
  es: "No carga ningún script de terceros ni ningún script de Umami en tu navegador, no realiza seguimiento entre sitios, no establece cookies",
  fr: "ne charge aucun script tiers et aucun script Umami dans ton navigateur, ne fait aucun suivi intersites, ne dépose aucun cookie",
  "zh-CN":
    "不会在你的浏览器中加载任何第三方脚本，也不加载 Umami 脚本，不做跨站跟踪，不设置任何 Cookie",
  "pt-BR":
    "não carrega nenhum script de terceiros nem nenhum script do Umami no seu navegador, não faz rastreamento entre sites, não define cookies",
  ja: "ブラウザーにサードパーティのスクリプトも Umami のスクリプトも読み込まず、サイトをまたぐトラッキングは行わず、Cookie も設定せず",
};

const COUNT_READS_AND_SETS_NOTHING: Record<Locale, string> = {
  en: "No cookie is set for it (section 5). Apart from the request details listed below, our server reads only the two cookies named in section 5, solely to honour an objection, which § 25(2) no. 2 TDDDG (German Telecommunications Digital Services Data Protection Act) permits without consent",
  de: "Dafür wird kein Cookie gesetzt (Abschnitt 5). Abgesehen von den unten aufgeführten Angaben aus der Anfrage liest unser Server nur die beiden in Abschnitt 5 genannten Cookies, und zwar ausschließlich, um einen Widerspruch zu beachten, was § 25 Abs. 2 Nr. 2 TDDDG (Telekommunikation-Digitale-Dienste-Datenschutz-Gesetz) ohne Einwilligung erlaubt",
  es: "Para ello no se establece ninguna cookie (sección 5). Aparte de los datos de la solicitud que se enumeran más abajo, nuestro servidor solo lee las dos cookies mencionadas en la sección 5, únicamente para respetar una oposición, lo que el § 25, apartado 2, n.º 2 de la TDDDG (ley alemana de protección de datos en telecomunicaciones y servicios digitales) permite sin consentimiento",
  fr: "Aucun cookie n’est déposé pour cela (section 5). Hormis les informations de la requête énumérées ci-dessous, notre serveur ne lit que les deux cookies nommés à la section 5, uniquement pour respecter une opposition, ce que le § 25, alinéa 2, point 2 du TDDDG (loi allemande sur la protection des données dans les télécommunications et les services numériques) autorise sans consentement",
  "zh-CN":
    "不会为此设置 Cookie（见第 5 节）。除下文列出的请求信息外，我们的服务器只读取第 5 节中提到的两个 Cookie，且仅用于遵从反对，依据 § 25 第 2 款第 2 项 TDDDG（德国《电信数字服务数据保护法》），这无需征得同意",
  "pt-BR":
    "Nenhum cookie é definido para isso (seção 5). Além dos detalhes da requisição listados abaixo, nosso servidor lê apenas os dois cookies citados na seção 5, somente para respeitar uma oposição, o que o § 25, parágrafo 2, nº 2 da TDDDG (Lei alemã de Proteção de Dados em Telecomunicações e Serviços Digitais) permite sem consentimento",
  ja: "この集計のために Cookie は設定しません（第 5 節を参照）。以下に挙げるリクエストの情報を除き、当方のサーバーが読み取るのは第 5 節の 2 つの Cookie だけで、異議を尊重するためにのみ読み取ります。これは § 25 第 2 項第 2 号 TDDDG（ドイツ電気通信デジタルサービスデータ保護法）により、同意なしに認められています",
};

const SIGNAL_IS_AN_OBJECTION: Record<Locale, string> = {
  en: "treated as an objection to this analytics: while your browser sends it, nothing is forwarded, and section 9 explains how else to object",
  de: "wird das als Widerspruch gegen diese Analyse behandelt: Solange dein Browser es sendet, wird nichts weitergeleitet; in Abschnitt 9 steht, wie du sonst widersprechen kannst",
  es: "se trata como una oposición a esta analítica: mientras tu navegador la envíe, no se reenvía nada; la sección 9 explica cómo oponerte de otro modo",
  fr: "il est traité comme une opposition à ces statistiques : tant que ton navigateur l’envoie, rien n’est transmis ; la section 9 explique comment t’opposer autrement",
  "zh-CN":
    "它会被视为对这种分析的反对：只要你的浏览器发送该信号，就不会转发任何内容；第 9 节说明了还可以如何提出反对",
  "pt-BR":
    "ele é tratado como uma oposição a essa análise: enquanto seu navegador o enviar, nada é encaminhado; a seção 9 explica como se opor de outra forma",
  ja: "それはこの分析への異議として扱われます。ブラウザーがシグナルを送っている間は何も転送せず、ほかの異議の述べ方は第 9 節で説明します",
};

const EVENTS_CLOSED_LIST: Record<Locale, string> = {
  en: "never the text you copied, typed or searched for, form values, query strings or page titles",
  de: "niemals den Text, den du kopiert, eingegeben oder gesucht hast, Formularwerte, Query-Parameter oder Seitentitel",
  es: "nunca el texto que has copiado, escrito o buscado, valores de formularios, cadenas de consulta ni títulos de página",
  fr: "jamais le texte que tu as copié, saisi ou recherché, ni valeurs de formulaire, ni chaînes de requête, ni titres de page",
  "zh-CN": "绝不包含你复制、输入或搜索的文本、表单值、查询字符串或页面标题",
  "pt-BR":
    "nunca o texto que você copiou, digitou ou buscou, valores de formulário, query strings nem títulos de página",
  ja: "コピー、入力、検索したテキスト、フォームの値、クエリ文字列、ページタイトルは決して含まれません",
};

const EVENTS_READ_ONLY_THE_PATH: Record<Locale, string> = {
  en: "Our script reads only the path of the page you are on, and no local storage, no screen size, no referrer and no page title; our server reads from the request only the two cookies named in section 5, solely to honour an objection",
  de: "Unser Skript liest nur den Pfad der Seite, auf der du dich befindest, und keinen lokalen Speicher, keine Bildschirmgröße, keinen Referrer und keinen Seitentitel; unser Server liest aus der Anfrage nur die beiden in Abschnitt 5 genannten Cookies, und zwar ausschließlich, um einen Widerspruch zu beachten",
  es: "Nuestro script solo lee la ruta de la página en la que estás, y ningún almacenamiento local, ningún tamaño de pantalla, ningún referente y ningún título de página; nuestro servidor solo lee de la solicitud las dos cookies mencionadas en la sección 5, únicamente para respetar una oposición",
  fr: "Notre script ne lit que le chemin de la page où tu te trouves, et ni stockage local, ni taille d’écran, ni référent, ni titre de page ; notre serveur ne lit dans la requête que les deux cookies nommés à la section 5, uniquement pour respecter une opposition",
  "zh-CN":
    "我们的脚本只读取你所在页面的路径，不读取本地存储、屏幕尺寸、来源页面或页面标题；我们的服务器只从请求中读取第 5 节中提到的两个 Cookie，且仅用于遵从反对",
  "pt-BR":
    "Nosso script lê apenas o caminho da página em que você está, e nenhum armazenamento local, nenhum tamanho de tela, nenhum referenciador e nenhum título de página; nosso servidor lê da requisição apenas os dois cookies citados na seção 5, somente para respeitar uma oposição",
  ja: "当方のスクリプトが読み取るのは、今いるページのパスだけです。ローカルストレージ、画面サイズ、リファラー、ページタイトルは使いません。当方のサーバーがリクエストから読み取るのは、第 5 節の 2 つの Cookie だけで、異議を尊重するためにのみ読み取ります",
};

const NO_REPLAY_HEATMAPS_PERFORMANCE: Record<Locale, string> = {
  en: "Sessions are not recorded as replays, and there are no heatmaps and no performance measurements",
  de: "Sitzungen werden nicht als Wiedergaben aufgezeichnet, es gibt keine Heatmaps und keine Leistungsmessungen",
  es: "Las sesiones no se graban como reproducciones, y no hay mapas de calor ni mediciones de rendimiento",
  fr: "Les sessions ne sont pas enregistrées sous forme de relectures, et il n’y a ni cartes de chaleur ni mesures de performance",
  "zh-CN": "会话不会被录制为回放，也没有热力图和性能测量",
  "pt-BR":
    "As sessões não são gravadas como reproduções, e não há mapas de calor nem medições de desempenho",
  ja: "セッションをリプレイとして記録することはなく、ヒートマップやパフォーマンス計測もありません",
};

const EVENTS_FORWARDED_LIKE_PAGE_VIEWS: Record<Locale, string> = {
  en: "Both kinds are forwarded to our Umami server in the same way as page views, with your IP address, your user-agent string and the first language tag of your browser's Accept-Language header from that request",
  de: "Beide Arten werden auf dieselbe Weise wie Seitenaufrufe an unseren Umami-Server weitergeleitet, mit deiner IP-Adresse, deiner User-Agent-Zeichenkette und dem ersten Sprachkürzel aus dem Accept-Language-Header deines Browsers aus dieser Anfrage",
  es: "Ambos tipos se reenvían a nuestro servidor de Umami igual que las visitas a páginas, con tu dirección IP, tu cadena de user-agent y la primera etiqueta de idioma de la cabecera Accept-Language de tu navegador de esa petición",
  fr: "Les deux types sont transmis à notre serveur Umami de la même manière que les pages vues, avec ton adresse IP, ta chaîne user-agent et la première balise de langue de l’en-tête Accept-Language de ton navigateur issues de cette requête",
  "zh-CN":
    "这两类事件都与页面浏览一样转发给我们的 Umami 服务器，并附上该请求中的你的 IP 地址、user-agent 字符串和浏览器 Accept-Language 请求头中的第一个语言标签",
  "pt-BR":
    "Os dois tipos são encaminhados ao nosso servidor Umami da mesma forma que as visualizações de página, com seu endereço IP, sua string de user-agent e a primeira etiqueta de idioma do cabeçalho Accept-Language do seu navegador dessa requisição",
  ja: "どちらもページビューと同じ方法で当方の Umami サーバーに転送され、そのリクエストの IP アドレス、user-agent 文字列、ブラウザーの Accept-Language ヘッダーの最初の言語タグが付く",
};

const EVENTS_LEGAL_BASIS: Record<Locale, string> = {
  en: "The legal basis is Art. 6(1)(f) GDPR (our legitimate interest in understanding how the site is used), and no consent under § 25 TDDDG is required because nothing is stored on your device, our script reads only the page path, and the two cookies are read solely to honour an objection (§ 25(2) no. 2 TDDDG)",
  de: "Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (unser berechtigtes Interesse daran zu verstehen, wie die Seite genutzt wird); eine Einwilligung nach § 25 TDDDG ist nicht erforderlich, weil nichts auf deinem Gerät gespeichert wird, unser Skript nur den Seitenpfad ausliest und die beiden Cookies ausschließlich gelesen werden, um einen Widerspruch zu beachten (§ 25 Abs. 2 Nr. 2 TDDDG)",
  es: "La base jurídica es el art. 6.1.f) del RGPD (nuestro interés legítimo en entender cómo se usa el sitio), y no se necesita consentimiento según el § 25 de la TDDDG porque no se almacena nada en tu dispositivo, nuestro script solo lee la ruta de la página y las dos cookies se leen únicamente para respetar una oposición (§ 25, apartado 2, n.º 2 de la TDDDG)",
  fr: "La base légale est l’art. 6, paragraphe 1, point f) du RGPD (notre intérêt légitime à comprendre comment le site est utilisé), et aucun consentement au titre du § 25 TDDDG n’est nécessaire, car rien n’est stocké sur ton appareil, notre script ne lit que le chemin de la page et les deux cookies ne sont lus que pour respecter une opposition (§ 25, alinéa 2, point 2 du TDDDG)",
  "zh-CN":
    "法律依据是 GDPR 第 6(1)(f) 条（我们了解本站使用情况的合法利益）；无需依据 § 25 TDDDG 征得同意，因为没有向你的设备存储任何内容，我们的脚本只读取页面路径，而那两个 Cookie 仅用于遵从反对（§ 25 第 2 款第 2 项 TDDDG）",
  "pt-BR":
    "A base legal é o art. 6(1)(f) do GDPR (nosso interesse legítimo em entender como o site é usado), e não é necessário consentimento nos termos do § 25 da TDDDG, porque nada é armazenado no seu dispositivo, nosso script lê apenas o caminho da página e os dois cookies são lidos somente para respeitar uma oposição (§ 25, parágrafo 2, nº 2 da TDDDG)",
  ja: "法的根拠は GDPR 第 6(1)(f) 条（サイトの利用状況を把握するという正当な利益）です。デバイスには何も保存せず、当方のスクリプトが読み取るのはページのパスだけで、2 つの Cookie は異議を尊重するためにのみ読み取るため（§ 25 第 2 項第 2 号 TDDDG）、§ 25 TDDDG に基づく同意は不要です",
};

const SETS_NO_COOKIES: Record<Locale, string> = {
  en: "This site sets no cookies.",
  de: "Diese Seite setzt keine Cookies.",
  es: "Este sitio no establece cookies.",
  fr: "Ce site ne dépose aucun cookie.",
  "zh-CN": "本站不设置任何 Cookie。",
  "pt-BR": "Este site não define cookies.",
  ja: "このサイトは Cookie を設定しません。",
};

const LEGACY_COOKIES_HONOURED: Record<Locale, string> = {
  en: "reads them only to honour an objection: if your browser still sends verbatra_analytics with the value off or verbatra_analytics_optout with the value 1, nothing is counted or forwarded for you, while the values full and default have no effect",
  de: "nur noch, um einen Widerspruch zu beachten: Sendet dein Browser noch verbatra_analytics mit dem Wert off oder verbatra_analytics_optout mit dem Wert 1, wird für dich nichts gezählt oder weitergeleitet; die Werte full und default haben keine Wirkung",
  es: "solo para respetar una oposición: si tu navegador sigue enviando verbatra_analytics con el valor off o verbatra_analytics_optout con el valor 1, no se cuenta ni se reenvía nada para ti, mientras que los valores full y default no tienen ningún efecto",
  fr: "que pour respecter une opposition : si ton navigateur envoie encore verbatra_analytics avec la valeur off ou verbatra_analytics_optout avec la valeur 1, rien n’est compté ni transmis pour toi, tandis que les valeurs full et default n’ont aucun effet",
  "zh-CN":
    "只为遵从反对而读取它们：如果你的浏览器仍发送值为 off 的 verbatra_analytics，或值为 1 的 verbatra_analytics_optout，就不会为你统计或转发任何内容，而值 full 和 default 没有任何作用",
  "pt-BR":
    "só os lê para respeitar uma oposição: se seu navegador ainda enviar verbatra_analytics com o valor off ou verbatra_analytics_optout com o valor 1, nada é contado nem encaminhado para você, enquanto os valores full e default não têm efeito",
  ja: "異議を尊重するためにだけ読み取ります。ブラウザーが値 off の verbatra_analytics または値 1 の verbatra_analytics_optout をまだ送っている場合、集計も転送も行いません。値 full と default には効力がありません",
};

const OWN_SCRIPT_REPORTS_IN_OVERVIEW: Record<Locale, string> = {
  en: "A small script of the site's own reports page changes and clicks on a few controls to the site's own server (section 4)",
  de: "Ein kleines Skript der Seite selbst meldet Seitenwechsel und Klicks auf einige Bedienelemente an den eigenen Server der Seite (Abschnitt 4)",
  es: "Un pequeño script del propio sitio informa de los cambios de página y de los clics en algunos controles al propio servidor del sitio (sección 4)",
  fr: "Un petit script du site lui-même signale les changements de page et les clics sur quelques contrôles au propre serveur du site (section 4)",
  "zh-CN": "本站自己的一个小脚本会把页面切换和对少数控件的点击报告给本站自己的服务器（见第 4 节）",
  "pt-BR":
    "Um pequeno script do próprio site informa mudanças de página e cliques em alguns controles ao servidor do próprio site (seção 4)",
  ja: "サイト自身の小さなスクリプトが、ページの切り替えといくつかの操作部品へのクリックを、サイト自身のサーバーに報告します（第 4 節を参照）",
};

const NO_ANALYTICS_SCRIPT: Record<Locale, string> = {
  en: "no Umami script loads in your browser. A small script of this site's own reports page changes and clicks to this site's own server (section 4).",
  de: "Im Browser wird kein Umami-Skript geladen. Ein kleines Skript dieser Website meldet Seitenwechsel und Klicks an den eigenen Server dieser Website (Abschnitt 4).",
  es: "En tu navegador no se carga ningún script de Umami. Un pequeño script de este sitio informa de los cambios de página y de los clics al propio servidor de este sitio (sección 4).",
  fr: "Aucun script Umami ne se charge dans ton navigateur. Un petit script de ce site signale les changements de page et les clics au propre serveur de ce site (section 4).",
  "zh-CN":
    "你的浏览器中不加载 Umami 脚本。本站自己的一个小脚本会把页面切换和点击报告给本站自己的服务器（见第 4 节）。",
  "pt-BR":
    "Nenhum script do Umami é carregado no seu navegador. Um pequeno script deste site informa mudanças de página e cliques ao servidor deste próprio site (seção 4).",
  ja: "ブラウザーに Umami のスクリプトは読み込まれません。このサイト自身の小さなスクリプトが、ページの切り替えやクリックを、このサイト自身のサーバーに報告します（第 4 節を参照）。",
};

const OBJECTION_SIGNAL: Record<Locale, string> = {
  en: "we treat a Global Privacy Control (Sec-GPC) or Do Not Track signal sent by your browser as an objection to the analytics described in section 4: while your browser sends it, nothing is counted or forwarded for you",
  de: "Ein Global-Privacy-Control-Signal (Sec-GPC) oder Do-Not-Track-Signal deines Browsers behandeln wir als Widerspruch gegen die in Abschnitt 4 beschriebene Analyse: Solange dein Browser es sendet, wird für dich nichts gezählt oder weitergeleitet",
  es: "tratamos una señal Global Privacy Control (Sec-GPC) o Do Not Track enviada por tu navegador como una oposición a la analítica descrita en la sección 4: mientras tu navegador la envíe, no se cuenta ni se reenvía nada para ti",
  fr: "nous traitons un signal Global Privacy Control (Sec-GPC) ou Do Not Track envoyé par ton navigateur comme une opposition aux statistiques décrites à la section 4 : tant que ton navigateur l’envoie, rien n’est compté ni transmis pour toi",
  "zh-CN":
    "我们把你的浏览器发送的 Global Privacy Control（Sec-GPC）或 Do Not Track 信号视为对第 4 节所述分析的反对：只要你的浏览器发送该信号，就不会为你统计或转发任何内容",
  "pt-BR":
    "tratamos um sinal Global Privacy Control (Sec-GPC) ou Do Not Track enviado pelo seu navegador como uma oposição à análise descrita na seção 4: enquanto seu navegador o enviar, nada é contado nem encaminhado para você",
  ja: "ブラウザーが送る Global Privacy Control（Sec-GPC）または Do Not Track のシグナルは、第 4 節で説明した分析への異議として扱います。ブラウザーがシグナルを送っている間は、集計も転送も行いません",
};

const OBJECTION_IGNORE_LIST: Record<Locale, string> = {
  en: "please tell us your IP address and, if you can, the user-agent string of your browser and the period concerned, so that we can add the IP address to the ignore list of our Umami server",
  de: "Bitte nenne uns deine IP-Adresse und, wenn möglich, die User-Agent-Zeichenkette deines Browsers sowie den betroffenen Zeitraum, damit wir die IP-Adresse in die Ignorierliste unseres Umami-Servers aufnehmen können",
  es: "indícanos tu dirección IP y, si puedes, la cadena de user-agent de tu navegador y el período en cuestión, para que podamos añadir la dirección IP a la lista de exclusión de nuestro servidor de Umami",
  fr: "indique-nous ton adresse IP et, si tu le peux, la chaîne user-agent de ton navigateur ainsi que la période concernée, afin que nous puissions ajouter l’adresse IP à la liste d’exclusion de notre serveur Umami",
  "zh-CN":
    "请告知你的 IP 地址，如可能，还有你浏览器的 user-agent 字符串和相关时间段，以便我们把该 IP 地址加入 Umami 服务器的忽略列表",
  "pt-BR":
    "informe seu endereço IP e, se puder, a string de user-agent do seu navegador e o período em questão, para que possamos adicionar o endereço IP à lista de exclusão do nosso servidor Umami",
  ja: "IP アドレスと、可能であればブラウザーの user-agent 文字列、対象期間をお知らせください。その IP アドレスを Umami サーバーの無視リストに追加し",
};

const OBJECTION_ART_11: Record<Locale, string> = {
  en: "(Art. 11(2) GDPR)",
  de: "(Art. 11 Abs. 2 DSGVO)",
  es: "(art. 11.2 del RGPD)",
  fr: "(art. 11, paragraphe 2 du RGPD)",
  "zh-CN": "（GDPR 第 11(2) 条）",
  "pt-BR": "(art. 11(2) do GDPR)",
  ja: "（GDPR 第 11(2) 条）",
};

const RETENTION_13_MONTHS: Record<Locale, string> = {
  en: "Page view and event records are kept for 13 months.",
  de: "Seitenaufruf- und Ereignisdatensätze werden für 13 Monate aufbewahrt.",
  es: "Los registros de visitas a páginas y de eventos se conservan durante 13 meses.",
  fr: "Les enregistrements de pages vues et d’événements sont conservés pendant 13 mois.",
  "zh-CN": "页面浏览和事件记录保留 13 个月。",
  "pt-BR": "Os registros de visualizações de página e de eventos são mantidos por 13 meses.",
  ja: "ページビューとイベントの記録は 13 か月間保持されます。",
};

const THEME_STORAGE: Record<Locale, RegExp> = {
  en: /light and dark theme, your choice is saved in local storage under the key theme\./,
  de: /hellem und dunklem Design wechselst, wird deine Wahl im lokalen Speicher \(Local Storage\) unter dem Schlüssel theme abgelegt\./,
  es: /tema claro y el oscuro, tu elección se guarda en el almacenamiento local con la clave theme\./,
  fr: /thème clair au thème sombre ou inversement, ton choix est enregistré dans le stockage local sous la clé theme\./,
  "zh-CN":
    /在浅色和深色主题之间切换时，你的选择会以 theme 为键名保存在本地存储（local storage）中。/,
  "pt-BR": /tema claro e o escuro, sua escolha é salva no armazenamento local com a chave theme\./,
  ja: /ライトテーマとダークテーマを切り替えると、その選択はローカルストレージ（local storage）にキー theme で保存されます。/,
};

const PACKAGE_MANAGER_STORAGE: Record<Locale, RegExp> = {
  en: /package manager \(npm, pnpm, yarn or bun\) on the tabs above an install command, your choice is saved under the key package-manager in both local storage and session storage/,
  de: /Paketmanager \(npm, pnpm, yarn oder bun\) auswählst, wird deine Wahl unter dem Schlüssel package-manager sowohl im lokalen Speicher als auch im Sitzungsspeicher \(Session Storage\) abgelegt/,
  es: /gestor de paquetes \(npm, pnpm, yarn o bun\) en las pestañas encima de un comando de instalación, tu elección se guarda con la clave package-manager tanto en el almacenamiento local como en el almacenamiento de sesión/,
  fr: /gestionnaire de paquets \(npm, pnpm, yarn ou bun\) dans les onglets au-dessus d’une commande d’installation, ton choix est enregistré sous la clé package-manager, à la fois dans le stockage local et dans le stockage de session/,
  "zh-CN":
    /选择包管理器（npm、pnpm、yarn 或 bun）时，你的选择会以 package-manager 为键名同时保存在本地存储和会话存储（session storage）中/,
  "pt-BR":
    /gerenciador de pacotes \(npm, pnpm, yarn ou bun\) nas abas acima de um comando de instalação, sua escolha é salva com a chave package-manager tanto no armazenamento local quanto no armazenamento de sessão/,
  ja: /パッケージマネージャー（npm、pnpm、yarn、bun）を選ぶと、その選択はローカルストレージとセッションストレージ（session storage）の両方にキー package-manager で保存され/,
};

const STORAGE_NEVER_SENT: Record<Locale, RegExp> = {
  en: /Neither entry is written before you make that choice; both stay in your browser, are never sent to our server or anyone else/,
  de: /Keiner der beiden Einträge wird geschrieben, bevor du diese Wahl triffst; beide bleiben in deinem Browser, werden nie an unseren Server oder an andere gesendet/,
  es: /Ninguna de las dos entradas se escribe antes de que hagas esa elección; ambas se quedan en tu navegador, nunca se envían a nuestro servidor ni a nadie más/,
  fr: /Aucune de ces deux entrées n’est écrite avant que tu fasses ce choix ; toutes deux restent dans ton navigateur, ne sont jamais envoyées à notre serveur ni à qui que ce soit/,
  "zh-CN":
    /在你做出该选择之前，这两项都不会写入；它们只保留在你的浏览器中，绝不会发送到我们的服务器或其他任何方/,
  "pt-BR":
    /Nenhuma das duas entradas é gravada antes de você fazer essa escolha; ambas ficam no seu navegador, nunca são enviadas ao nosso servidor nem a mais ninguém/,
  ja: /どちらの項目も、選択する前には書き込まれません。どちらもブラウザー内にとどまり、このサーバーにもほかの誰にも送られず/,
};

const HOSTING_PROCESSOR: Record<Locale, RegExp> = {
  en: /Contabo GmbH, Welfenstraße 22, 81541 Munich, Germany.*as a processor \(Art\. 28 GDPR\)/,
  de: /Contabo GmbH, Welfenstraße 22, 81541 München, Deutschland.*als Auftragsverarbeiter \(Art\. 28 DSGVO\)/,
  es: /Contabo GmbH, Welfenstraße 22, 81541 Múnich, Alemania.*como encargado del tratamiento \(art\. 28 del RGPD\)/,
  fr: /Contabo GmbH, Welfenstraße 22, 81541 Munich, Allemagne.*en tant que sous-traitant \(art\. 28 du RGPD\)/,
  "zh-CN": /Contabo GmbH，Welfenstraße 22, 81541 München，德国.*作为处理者（GDPR 第 28 条）/,
  "pt-BR":
    /Contabo GmbH, Welfenstraße 22, 81541 Munique, Alemanha.*como operador \(art\. 28 do GDPR\)/,
  ja: /Contabo GmbH, Welfenstraße 22, 81541 München, ドイツ.*処理者として（GDPR 第 28 条）処理します/,
};

const CONTAINER_LOG_ROTATION: Record<Locale, RegExp> = {
  en: /container log is rotated automatically and limited to \d+ files of \d+ MB each/,
  de: /Container-Log wird automatisch rotiert und ist auf \d+ Dateien mit je \d+ MB begrenzt/,
  es: /registro del contenedor se rota automáticamente y está limitado a \d+ archivos de \d+ MB cada uno/,
  fr: /journal du conteneur fait l’objet d’une rotation automatique et est limité à \d+ fichiers de \d+ Mo chacun/,
  "zh-CN": /容器日志自动轮转，最多保留 \d+ 个文件，每个 \d+ MB/,
  "pt-BR":
    /log do contêiner é rotacionado automaticamente e limitado a \d+ arquivos de \d+ MB cada/,
  ja: /コンテナーログは自動でローテーションされ、\d+ 個のファイル（各 \d+ MB）までに制限されます/,
};

const ARCJET_ONLY_OTHER_PROCESSOR: Record<Locale, RegExp> = {
  en: /Besides the hosting provider \(see section 3\), the only processor involved under Art\. 28 GDPR is Arcjet/,
  de: /Neben dem Hosting-Anbieter \(siehe Abschnitt 3\) ist der einzige beteiligte Auftragsverarbeiter nach Art\. 28 DSGVO Arcjet/,
  es: /Aparte del proveedor de alojamiento \(ver la sección 3\), el único encargado del tratamiento en el sentido del art\. 28 del RGPD es Arcjet/,
  fr: /Outre l’hébergeur \(voir la section 3\), le seul sous-traitant au sens de l’art\. 28 du RGPD est Arcjet/,
  "zh-CN": /除托管提供商（见第 3 节）外，GDPR 第 28 条下涉及的唯一处理者是 Arcjet/,
  "pt-BR":
    /Além do provedor de hospedagem \(veja a seção 3\), o único operador envolvido nos termos do art\. 28 do GDPR é a Arcjet/,
  ja: /ホスティングプロバイダー（第 3 節を参照）のほかに、GDPR 第 28 条の処理者として関与するのは Arcjet/,
};

const ACCESS_LOG_DELETION: Record<Locale, RegExp> = {
  en: /access logs are deleted as soon as they are no longer needed/,
  de: /Zugriffs-Logs des Webservers werden gelöscht, sobald sie für diese Zwecke nicht mehr benötigt werden/,
  es: /registros de acceso del servidor web se eliminan en cuanto dejan de ser necesarios/,
  fr: /journaux d’accès du serveur web sont supprimés dès qu’ils ne sont plus nécessaires/,
  "zh-CN": /访问日志在不再需要用于这些目的时立即删除/,
  "pt-BR": /logs de acesso do servidor web são excluídos assim que deixam de ser necessários/,
  ja: /Web サーバーのアクセスログは、これらの目的に不要になり次第削除します/,
};

const AI_TRANSLATION_PIPELINE: Record<Locale, RegExp> = {
  en: /machine-translated into every language other than English, either by verbatra with Google's Gemini or Anthropic's Claude language models or by an AI coding agent working in the repository whose output is imported with verbatra/,
  de: /maschinell in jede andere Sprache als Englisch übersetzt, entweder von verbatra mit den Sprachmodellen Gemini von Google oder Claude von Anthropic oder von einem KI-Coding-Agenten, der im Repository arbeitet und dessen Ergebnis mit verbatra importiert wird/,
  es: /se traducen automáticamente a todos los idiomas distintos del inglés, bien con verbatra y los modelos de lenguaje Gemini de Google o Claude de Anthropic, bien con un agente de programación con IA que trabaja en el repositorio y cuyo resultado se importa con verbatra/,
  fr: /traduits automatiquement dans toutes les langues autres que l’anglais, soit par verbatra avec les modèles de langage Gemini de Google ou Claude d’Anthropic, soit par un agent de code IA qui travaille dans le dépôt et dont le résultat est importé avec verbatra/,
  "zh-CN":
    /会自动翻译为英语以外的所有语言：要么由 verbatra 使用 Google 的 Gemini 或 Anthropic 的 Claude 语言模型完成，要么由在仓库中工作的 AI 编码智能体完成，其输出再通过 verbatra 导入/,
  "pt-BR":
    /traduzido automaticamente para todos os idiomas diferentes do inglês, seja pelo verbatra com os modelos de linguagem Gemini do Google ou Claude da Anthropic, seja por um agente de programação com IA que trabalha no repositório e cuja saída é importada com o verbatra/,
  ja: /英語以外のすべての言語に機械翻訳されます。翻訳は、verbatra が Google の Gemini または Anthropic の Claude の言語モデルで行うか、リポジトリで作業する AI コーディングエージェントが行い、その出力を verbatra でインポートします/,
};

const AI_TRANSLATION_BEST_EFFORT: Record<Locale, RegExp> = {
  en: /checked on a best-effort basis: not every translated text is reviewed by a person/,
  de: /nach bestem Bemühen geprüft: Nicht jeder übersetzte Text wird .* von einem Menschen/,
  es: /se revisan en la medida de lo posible: no todos los textos traducidos los revisa una persona/,
  fr: /vérifiées dans la mesure du possible : tous les textes traduits ne sont pas relus par une personne/,
  "zh-CN": /译文会尽力检查：并非每段译文在发布前都经过人工审校/,
  "pt-BR": /verificadas na medida do possível: nem todo texto traduzido é revisado por uma pessoa/,
  ja: /訳文はできる範囲で確認していますが、すべての訳文を公開前に人がレビューしているわけではないため/,
};

function imprintFacts(): string[] {
  const street = IMPRINT_PROVIDER_LINES.find((line) => /Mönchfeldstraße \d+/.test(line));
  const city = IMPRINT_PROVIDER_LINES.find((line) => /\d{5} Stuttgart/.test(line));
  return [street ?? "missing street", city ?? "missing city"];
}

const EQUALLY_BINDING: Record<Locale, RegExp> = {
  en: /All language versions have the same content and are equally binding\./,
  de: /Alle Sprachfassungen sind inhaltlich gleich und gleichermaßen verbindlich\./,
  es: /Todas las versiones lingüísticas tienen el mismo contenido y son igualmente vinculantes\./,
  fr: /Toutes les versions linguistiques ont le même contenu et font également foi\./,
  "zh-CN": /所有语言版本内容相同，具有同等效力。/,
  "pt-BR": /Todas as versões de idioma têm o mesmo conteúdo e são igualmente vinculantes\./,
  ja: /すべての言語版は内容が同じで、同等の効力を持ちます。/,
};

const BDSG_SECTION_38 = /§ 38 (de la |da )?BDSG/;
const OBJECTION_SECTION_LIST = /3, 4,? (and|und|y|et|e) 12|3、4 和 12|第 3 節、第 4 節、第 12 節/;

describe("privacy page section reference patterns", () => {
  it("accepts the Portuguese contraction before BDSG and still rejects a missing section number", () => {
    expect("nos termos do § 38 da BDSG").toMatch(BDSG_SECTION_38);
    expect("nos termos do § 38 de la BDSG").toMatch(BDSG_SECTION_38);
    expect("nos termos do § 38 BDSG").toMatch(BDSG_SECTION_38);
    expect("nos termos do § 39 da BDSG").not.toMatch(BDSG_SECTION_38);
    expect("nos termos do § 38 do BDSG").not.toMatch(BDSG_SECTION_38);
  });

  it("accepts the Portuguese conjunction in the objection section list and rejects other lists", () => {
    expect("seções 3, 4 e 12").toMatch(OBJECTION_SECTION_LIST);
    expect("secciones 3, 4 y 12").toMatch(OBJECTION_SECTION_LIST);
    expect("seções 3, 4 ou 12").not.toMatch(OBJECTION_SECTION_LIST);
    expect("seções 3, 5 e 12").not.toMatch(OBJECTION_SECTION_LIST);
  });

  it("accepts the Japanese section list and rejects a Japanese list that skips a section", () => {
    expect("第 3 節、第 4 節、第 12 節").toMatch(OBJECTION_SECTION_LIST);
    expect("第 3 節、第 5 節、第 12 節").not.toMatch(OBJECTION_SECTION_LIST);
    expect("第 3 節、第 4 節および第 12 節").not.toMatch(OBJECTION_SECTION_LIST);
  });
});

describe.each(i18n.languages)("privacy page (%s)", (locale) => {
  it("states that every language version is equally binding", async () => {
    const doc = await renderPrivacy(locale);
    const beforeSections = Array.from(
      doc.querySelectorAll("article > p"),
      (node) => node.textContent,
    )
      .slice(0, 2)
      .join(" ");

    expect(beforeSections).toMatch(EQUALLY_BINDING[locale]);
  });

  it("numbers its thirteen headings in order", async () => {
    const doc = await renderPrivacy(locale);
    const numbers = Array.from(doc.querySelectorAll("h2")).map((node) =>
      Number.parseInt(node.textContent ?? "", 10),
    );

    expect(numbers).toEqual(Array.from({ length: 13 }, (_, index) => index + 1));
  });

  it("names the controller with the same postal address as the imprint and links to it", async () => {
    const doc = await renderPrivacy(locale);
    const controller = sectionText(doc, /^1\. /);

    for (const fact of imprintFacts()) {
      expect(controller).toContain(fact);
    }
    expect(
      sectionNumbered(doc, 1)?.querySelector(`a[href="${expectedHref(locale, "/imprint")}"]`)
        ?.textContent,
    ).toBe(IMPRINT_NAME_IN_TEXT[locale]);
  });

  it("states that no data protection officer is appointed", async () => {
    const controller = sectionText(await renderPrivacy(locale), /^1\. /);

    expect(controller).toMatch(NO_DPO_PHRASE[locale]);
    expect(controller).toMatch(
      locale === "zh-CN" || locale === "ja" ? /第 37 条/ : /Art\. 37|art\. 37/,
    );
    expect(controller).toMatch(BDSG_SECTION_38);
  });

  it("names the competent supervisory authority with its address and website", async () => {
    const doc = await renderPrivacy(locale);
    const rights = sectionText(doc, /^8\. /);

    expect(rights).toContain(
      "Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg",
    );
    expect(rights).toContain("Heilbronner Straße 35, 70191 Stuttgart");
    expect(
      sectionNumbered(doc, 8)?.querySelector(
        'a[href="https://www.baden-wuerttemberg.datenschutz.de"]',
      ),
    ).not.toBeNull();
    expect(rights).toMatch(/Art\. 77|art\. 77|第 77 条/);
  });

  it("renders the right to object as its own highlighted section right after the rights", async () => {
    const doc = await renderPrivacy(locale);
    const heading = doc.getElementById("right-to-object");
    const section = heading?.closest("section");

    expect(heading?.textContent).toMatch(/^9\. .*21/);
    expect(section?.getAttribute("aria-labelledby")).toBe("right-to-object");
    expect(section?.querySelector(".vk-callout")).not.toBeNull();
    expect(section?.querySelector("strong")).not.toBeNull();
    expect(section?.querySelector('a[href="mailto:info@kreitz-webdev.de"]')).not.toBeNull();
    expect(section?.previousElementSibling?.querySelector("h2")?.textContent).toMatch(/^8\. /);
  });

  it("keeps the section numbers the right to object refers to pointing at the right sections", async () => {
    const doc = await renderPrivacy(locale);
    const objection = sectionText(doc, /^9\. /);
    const byNumber = (n: number) => sectionNumbered(doc, n);

    expect(objection).toMatch(OBJECTION_SECTION_LIST);
    for (const n of [3, 4, 12]) {
      expect(byNumber(n)?.textContent).toMatch(
        /6(\(1\)\(f\)| Abs\. 1 lit\. f|\.1\.f\)|, paragraphe 1, point f\))/,
      );
    }
    expect(
      byNumber(12)?.querySelector(`a[href="${expectedHref(locale, "/contact")}"]`),
    ).not.toBeNull();
    expect(sectionText(doc, /^8\. /)).toMatch(OBJECTION_CROSS_REFERENCE[locale]);
  });

  it("names Contabo as the hosting processor with its legal entity and address", async () => {
    const doc = await renderPrivacy(locale);
    const hosting = sectionText(doc, /^3\. /);

    expect(hosting).toMatch(HOSTING_PROCESSOR[locale]);
    expect(
      sectionNumbered(doc, 3)?.querySelector('a[href^="https://contabo.com/"]'),
    ).not.toBeNull();
  });

  it("states a size-bounded container log and when the access logs are deleted", async () => {
    const hosting = sectionText(await renderPrivacy(locale), /^3\. /);

    expect(hosting).toMatch(CONTAINER_LOG_ROTATION[locale]);
    expect(hosting).toMatch(ACCESS_LOG_DELETION[locale]);
  });

  it("describes the server-side pageview and what Umami derives and keeps", async () => {
    const analytics = sectionText(await renderPrivacy(locale), /^4\. /);

    expect(analytics).toMatch(UMAMI_SERVER_FORWARD[locale]);
    expect(analytics).toMatch(UMAMI_PSEUDONYMOUS[locale]);
    expect(analytics).toMatch(UMAMI_SESSION_HASH[locale]);
    expect(analytics).toMatch(UMAMI_GEOLITE[locale]);
    expect(analytics).toMatch(UMAMI_NOT_STORED[locale]);
    expect(analytics).toMatch(UMAMI_SAME_SERVER[locale]);
    expect(analytics).toMatch(UMAMI_LEGAL_BASIS[locale]);
    expect(analytics).toMatch(
      /Global Privacy Control \(GPC\)|Global-Privacy-Control-Signal \(GPC\)/,
    );
    expect(analytics).toMatch(/Do[ -]Not[ -]Track/);
  });

  it("forwards only the five utm parameters and the first Accept-Language tag", async () => {
    const analytics = sectionText(await renderPrivacy(locale), /^4\. /);

    expect(analytics).toMatch(UMAMI_UTM_ONLY[locale]);
    expect(analytics).toMatch(UMAMI_LANGUAGE_TAG_PER_PAGEVIEW[locale]);
  });

  it("says the count reads nothing from the device and sets no cookie, and treats GPC and DNT as an objection", async () => {
    const analytics = sectionText(await renderPrivacy(locale), /^4\. /);

    expect(analytics).toContain(COUNT_READS_AND_SETS_NOTHING[locale]);
    expect(analytics).toContain(SIGNAL_IS_AN_OBJECTION[locale]);
    expect(analytics).not.toContain("umami.disabled");
  });

  it("describes the events reported by the browser and noted by the server without any content", async () => {
    const analytics = sectionText(await renderPrivacy(locale), /^4\. /);

    for (const table of [
      EVENTS_CLOSED_LIST,
      EVENTS_READ_ONLY_THE_PATH,
      EVENTS_FORWARDED_LIKE_PAGE_VIEWS,
      EVENTS_LEGAL_BASIS,
      NO_REPLAY_HEATMAPS_PERFORMANCE,
    ]) {
      expect(analytics).toContain(table[locale]);
    }
  });

  it("renders no consent prompt, form or switch anywhere on the page", async () => {
    const doc = await renderPrivacy(locale);

    expect(doc.querySelectorAll("form, button, input")).toHaveLength(0);
    expect(doc.body.innerHTML).not.toContain("/api/analytics");
    expect(sectionNumbered(doc, 4)?.querySelector("h2")?.id).toBe("analytics");
  });

  it("keeps the page view and event retention in its own paragraph and pins no other period", async () => {
    const section = sectionNumbered(await renderPrivacy(locale), 4);
    const paragraphs = Array.from(section?.querySelectorAll(":scope > p") ?? []);

    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[2]?.textContent).toBe(RETENTION_13_MONTHS[locale]);
    expect(section?.textContent).not.toMatch(/\b30\b/);
  });

  it("says in section 2 and section 6 that no analytics script and no cookie are involved", async () => {
    const doc = await renderPrivacy(locale);

    expect(sectionText(doc, /^2\. /)).toContain(NO_COOKIES_NO_SCRIPTS[locale]);
    expect(sectionText(doc, /^2\. /)).toContain(OWN_SCRIPT_REPORTS_IN_OVERVIEW[locale]);
    expect(sectionText(doc, /^6\. /)).toContain(NO_ANALYTICS_SCRIPT[locale]);
  });

  it("puts the objection to the analytics, its e-mail route and its ignore list in the highlighted section", async () => {
    const section = (await renderPrivacy(locale))
      .getElementById("right-to-object")
      ?.closest("section");
    const objection = section?.textContent?.replace(/\s+/g, " ") ?? "";

    expect(section?.querySelector(".vk-callout")).not.toBeNull();
    for (const table of [OBJECTION_SIGNAL, OBJECTION_IGNORE_LIST, OBJECTION_ART_11]) {
      expect(objection).toContain(table[locale]);
    }
    expect(section?.querySelector('a[href="mailto:info@kreitz-webdev.de"]')).not.toBeNull();
  });

  it("has no event retention placeholder left in the policy text", async () => {
    const text = (await renderPrivacy(locale)).body.textContent ?? "";

    expect(text).not.toMatch(/\[EVENT_RETENTION\]/);
  });

  it("sets no cookie, honours the old opt-out cookies, and names every browser storage entry", async () => {
    const cookies = sectionText(await renderPrivacy(locale), /^5\. /);

    expect(cookies).toContain(SETS_NO_COOKIES[locale]);
    expect(cookies).toContain(LEGACY_COOKIES_HONOURED[locale]);
    expect(cookies).toMatch(THEME_STORAGE[locale]);
    expect(cookies).toMatch(PACKAGE_MANAGER_STORAGE[locale]);
    expect(cookies).toMatch(STORAGE_NEVER_SENT[locale]);
  });

  it("names the cookie and the storage keys under the names the site code writes", async () => {
    const cookies = sectionText(await renderPrivacy(locale), /^5\. /);

    for (const name of [
      ANALYTICS_CHOICE_COOKIE,
      LEGACY_OPT_OUT_COOKIE,
      THEME_STORAGE_KEY,
      PACKAGE_MANAGER_GROUP,
    ]) {
      expect(cookies).toMatch(new RegExp(`(^|\\s)${name}[\\s.,]`));
    }
  });

  it("states Arcjet's documented 30-day retention and links to its privacy documentation", async () => {
    const doc = await renderPrivacy(locale);
    const contactForm = sectionText(doc, /^12\. /);

    expect(contactForm).toMatch(ARCJET_RETENTION[locale]);
    expect(
      sectionNumbered(doc, 12)?.querySelector('a[href="https://docs.arcjet.com/privacy"]'),
    ).not.toBeNull();
  });

  it("names Arcjet as the only processor besides the hosting provider", async () => {
    const contactForm = sectionText(await renderPrivacy(locale), /^12\. /);

    expect(contactForm).toMatch(ARCJET_ONLY_OTHER_PROCESSOR[locale]);
  });

  it("discloses the transfer to the United States and the safeguard it relies on", async () => {
    const doc = await renderPrivacy(locale);
    const contactForm = sectionText(doc, /^12\. /);

    expect(contactForm).toContain("Arcjet Labs, Inc., San Francisco");
    expect(contactForm).toMatch(ARCJET_THIRD_COUNTRY[locale]);
    expect(contactForm).toMatch(ARCJET_SAFEGUARD[locale]);
    expect(
      sectionNumbered(doc, 12)?.querySelector('a[href="mailto:info@kreitz-webdev.de"]'),
    ).not.toBeNull();
  });
  it("describes the actual translation process and its best-effort review", async () => {
    const doc = await renderPrivacy(locale);
    const aiTranslation = sectionText(doc, /^13\. /);

    expect(aiTranslation).toMatch(AI_TRANSLATION_PIPELINE[locale]);
    expect(aiTranslation).toMatch(AI_TRANSLATION_BEST_EFFORT[locale]);
    expect(
      sectionNumbered(doc, 13)?.querySelector(`a[href="${expectedHref(locale, "/contact")}"]`),
    ).not.toBeNull();
  });
});
