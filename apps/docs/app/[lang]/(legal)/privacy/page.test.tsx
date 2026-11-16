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
import { LEGACY_OPT_OUT_COOKIE } from "@/lib/umami-config.mjs";

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
  en: /No analytics script runs in your browser, and nothing is written to your device for counting page views\..*our web server forwards .*: your IP address, your browser's user-agent string, the first language tag of your browser's Accept-Language header .*, the referring page \(without its query string\) and the path of the page you loaded/,
  de: /In deinem Browser läuft kein Analyseskript, und zum Zählen der Seitenaufrufe wird nichts auf deinem Gerät gespeichert\..*leitet unser Webserver.*deine IP-Adresse, die User-Agent-Zeichenkette deines Browsers, das erste Sprachkürzel aus dem Accept-Language-Header deines Browsers .*, die verweisende Seite \(ohne ihre Query-Parameter\) und den Pfad der geladenen Seite/,
  es: /En tu navegador no se ejecuta ningún script de analítica, y para contar las visitas no se escribe nada en tu dispositivo\..*nuestro servidor web reenvía .*: tu dirección IP, la cadena de user-agent de tu navegador, la primera etiqueta de idioma de la cabecera Accept-Language de tu navegador .*, la página de referencia \(sin sus parámetros de consulta\) y la ruta de la página que cargaste/,
  fr: /Aucun script de statistiques ne s’exécute dans ton navigateur, et rien n’est écrit sur ton appareil pour compter les pages vues\..*notre serveur web transmet .*: ton adresse IP, la chaîne user-agent de ton navigateur, la première balise de langue de l’en-tête Accept-Language de ton navigateur .*, la page référente \(sans ses paramètres de requête\) et le chemin de la page chargée/,
  "zh-CN":
    /你的浏览器中不运行任何分析脚本，统计页面浏览量也不会向你的设备写入任何内容。.*我们的 Web 服务器会把该请求的以下信息转发给我们的 Umami 服务器：你的 IP 地址，你浏览器的 user-agent 字符串，浏览器 Accept-Language 请求头中的第一个语言标签.*，来源页面（不含其查询字符串），以及你加载的页面路径/,
  "pt-BR":
    /Nenhum script de análise é executado no seu navegador, e nada é gravado no seu dispositivo para contar visualizações de página\..*nosso servidor web encaminha .*: seu endereço IP, a string de user-agent do seu navegador, a primeira etiqueta de idioma do cabeçalho Accept-Language do seu navegador .*, a página de referência \(sem a query string\) e o caminho da página que você carregou/,
  ja: /ブラウザーで分析スクリプトは動作せず、ページビューの集計のためにデバイスへ書き込むものもありません。.*Web サーバーがそのリクエストの次の情報を Umami サーバーに転送します。IP アドレス、ブラウザーの user-agent 文字列、ブラウザーの Accept-Language ヘッダーの最初の言語タグ.*、参照元ページ（クエリ文字列を除く）、読み込んだページのパス/,
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
  en: /no consent under § 25 TDDDG .* is required for it\. The legal basis for the processing is Art\. 6\(1\)\(f\) GDPR/,
  de: /keine Einwilligung nach § 25 TDDDG .* erforderlich\. Rechtsgrundlage der Verarbeitung ist Art\. 6 Abs\. 1 lit\. f DSGVO/,
  es: /no se necesita para ello ningún consentimiento según el § 25 de la TDDDG .* La base jurídica del tratamiento es el art\. 6\.1\.f\) del RGPD/,
  fr: /aucun consentement au titre du § 25 TDDDG .* n’est nécessaire pour cela\. La base légale du traitement est l’art\. 6, paragraphe 1, point f\) du RGPD/,
  "zh-CN": /依据 § 25 TDDDG（.*）无需征得同意。处理的法律依据是 GDPR 第 6\(1\)\(f\) 条/,
  "pt-BR":
    /não é necessário consentimento nos termos do § 25 da TDDDG .* para isso\. A base legal do tratamento é o art\. 6\(1\)\(f\) do GDPR/,
  ja: /§ 25 TDDDG（.*）に基づく同意は不要です。処理の法的根拠は GDPR 第 6\(1\)\(f\) 条/,
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

const UMAMI_NO_INTERACTIONS: Record<Locale, RegExp> = {
  en: /Clicks, copied text and other interactions are not recorded\./,
  de: /Klicks, kopierte Texte und andere Interaktionen werden nicht erfasst\./,
  es: /No se registran clics, textos copiados ni otras interacciones\./,
  fr: /Les clics, les textes copiés et les autres interactions ne sont pas enregistrés\./,
  "zh-CN": /点击、复制的文本和其他交互不会记录。/,
  "pt-BR": /Cliques, textos copiados e outras interações não são registrados\./,
  ja: /クリック、コピーしたテキスト、その他の操作は記録しません。/,
};

const UMAMI_OLD_OPT_OUT_IGNORED: Record<Locale, RegExp> = {
  en: /opt-out saved in your browser's local storage under this site's earlier analytics setup is no longer read/,
  de: /Widerspruch, der unter der früheren Analyse-Einrichtung dieser Seite im lokalen Speicher deines Browsers abgelegt wurde, wird nicht mehr ausgelesen/,
  es: /exclusión guardada en el almacenamiento local de tu navegador con la configuración de analítica anterior de este sitio ya no se lee/,
  fr: /opposition enregistrée dans le stockage local de ton navigateur avec l’ancienne configuration statistique de ce site n’est plus lue/,
  "zh-CN": /本站早先的分析设置曾把退出选择保存在你浏览器的本地存储中，现在不再读取/,
  "pt-BR":
    /opt-out salvo no armazenamento local do seu navegador pela configuração de análise anterior deste site não é mais lido/,
  ja: /以前の分析設定でブラウザーのローカルストレージに保存されたオプトアウトは、もう読み取りません/,
};

const OPT_OUT_COOKIE_BASIS: Record<Locale, RegExp> = {
  en: /verbatra_analytics_optout with the value 1, valid for one year.*needs no consent \(§ 25\(2\) no\. 2 TDDDG\)\. Allowing analytics again deletes it\. No other cookies are set\./,
  de: /verbatra_analytics_optout mit dem Wert 1, gültig für ein Jahr.*keine Einwilligung braucht \(§ 25 Abs\. 2 Nr\. 2 TDDDG\)\. Wenn du die Analyse wieder erlaubst, wird es gelöscht\. Andere Cookies werden nicht gesetzt\./,
  es: /verbatra_analytics_optout con el valor 1, válida durante un año.*no requiere consentimiento \(§ 25, apdo\. 2, n\.º 2 de la TDDDG\)\. Si vuelves a permitir la analítica, se elimina\. No se establece ninguna otra cookie\./,
  fr: /verbatra_analytics_optout avec la valeur 1, valable un an.*ne requiert donc aucun consentement \(§ 25, al\. 2, n° 2 TDDDG\)\. Autoriser à nouveau les statistiques le supprime\. Aucun autre cookie n’est déposé\./,
  "zh-CN":
    /名为 verbatra_analytics_optout 的 Cookie，值为 1，有效期一年.*无需征得同意（§ 25 第 2 款第 2 项 TDDDG）。再次允许分析会删除它。本站不设置其他 Cookie。/,
  "pt-BR":
    /verbatra_analytics_optout com o valor 1, válido por um ano.*não requer consentimento \(§ 25\(2\) nº 2 da TDDDG\)\. Permitir a análise de novo o exclui\. Nenhum outro cookie é definido\./,
  ja: /verbatra_analytics_optout で、値は 1、有効期間は 1 年です.*同意は不要です（§ 25 第 2 項第 2 号 TDDDG）。分析を再び許可すると削除されます。ほかの Cookie は設定しません。/,
};

const OPT_OUT_COOKIE_READ_ONLY_TO_HONOUR: Record<Locale, RegExp> = {
  en: /The only thing read from your device in connection with analytics is the opt-out cookie described in section 5, and only to honour your objection\..*Because nothing is stored on your device for counting page views and the opt-out cookie is read only to honour your objection, no consent/,
  de: /Im Zusammenhang mit der Analyse wird von deinem Gerät nur das in Abschnitt 5 beschriebene Widerspruchs-Cookie ausgelesen, und zwar ausschließlich, um deinen Widerspruch zu beachten\..*Weil zum Zählen der Seitenaufrufe nichts auf deinem Gerät gespeichert wird und das Widerspruchs-Cookie nur ausgelesen wird, um deinen Widerspruch zu beachten, ist dafür keine Einwilligung/,
  es: /Lo único que se lee de tu dispositivo en relación con la analítica es la cookie de oposición descrita en la sección 5, y solo para respetar tu oposición\..*Como para contar las visitas no se almacena nada en tu dispositivo y la cookie de oposición solo se lee para respetar tu oposición, no se necesita para ello ningún consentimiento/,
  fr: /La seule chose lue sur ton appareil en lien avec les statistiques est le cookie d’opposition décrit à la section 5, et uniquement pour respecter ton opposition\..*Comme rien n’est stocké sur ton appareil pour compter les pages vues et que le cookie d’opposition n’est lu que pour respecter ton opposition, aucun consentement/,
  "zh-CN":
    /与分析相关、从你的设备读取的唯一内容，是第 5 节所述的退出分析 Cookie，而且只在遵从你的反对时读取。.*由于统计页面浏览量时没有向你的设备存储任何内容，退出分析 Cookie 也只在遵从你的反对时读取，因此依据/,
  "pt-BR":
    /A única coisa lida do seu dispositivo em relação à análise é o cookie de opt-out descrito na seção 5, e apenas para respeitar sua oposição\..*Como nada é armazenado no seu dispositivo para contar visualizações de página e o cookie de opt-out é lido apenas para respeitar sua oposição, não é necessário consentimento/,
  ja: /分析に関連してデバイスから読み取るのは、第 5 節で説明するオプトアウト用 Cookie だけで、異議を尊重する目的でしか読み取りません。.*ページビューの集計のためにデバイスへ何も保存せず、オプトアウト用 Cookie も異議を尊重する目的でしか読み取らないため/,
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
  en: /machine-translated into every language other than English, either by verbatra with Google's Gemini language model or by an AI coding agent working in the repository whose output is imported with verbatra/,
  de: /maschinell in jede andere Sprache als Englisch übersetzt, entweder von verbatra mit dem Sprachmodell Gemini von Google oder von einem KI-Coding-Agenten, der im Repository arbeitet und dessen Ergebnis mit verbatra importiert wird/,
  es: /se traducen automáticamente a todos los idiomas distintos del inglés, bien con verbatra y el modelo de lenguaje Gemini de Google, bien con un agente de programación con IA que trabaja en el repositorio y cuyo resultado se importa con verbatra/,
  fr: /traduits automatiquement dans toutes les langues autres que l’anglais, soit par verbatra avec le modèle de langage Gemini de Google, soit par un agent de code IA qui travaille dans le dépôt et dont le résultat est importé avec verbatra/,
  "zh-CN":
    /会自动翻译为英语以外的所有语言：要么由 verbatra 使用 Google 的 Gemini 语言模型完成，要么由在仓库中工作的 AI 编码智能体完成，其输出再通过 verbatra 导入/,
  "pt-BR":
    /traduzido automaticamente para todos os idiomas diferentes do inglês, seja pelo verbatra com o modelo de linguagem Gemini do Google, seja por um agente de programação com IA que trabalha no repositório e cuja saída é importada com o verbatra/,
  ja: /英語以外のすべての言語に機械翻訳されます。翻訳は、verbatra が Google の Gemini 言語モデルで行うか、リポジトリで作業する AI コーディングエージェントが行い、その出力を verbatra でインポートします/,
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

  it("records no interactions and no longer reads the old local storage opt-out", async () => {
    const analytics = sectionText(await renderPrivacy(locale), /^4\. /);

    expect(analytics).toMatch(UMAMI_NO_INTERACTIONS[locale]);
    expect(analytics).toMatch(UMAMI_OLD_OPT_OUT_IGNORED[locale]);
    expect(analytics).not.toContain("umami.disabled");
  });

  it("renders the analytics choice as three plain forms in the analytics section", async () => {
    const doc = await renderPrivacy(locale);
    const analytics = sectionNumbered(doc, 4);
    const forms = Array.from(analytics?.querySelectorAll("form") ?? []);

    expect(analytics?.querySelector("h2")?.id).toBe("analytics");
    expect(forms).toHaveLength(3);
    for (const form of forms) {
      expect(form.getAttribute("method")).toBe("post");
      expect(form.getAttribute("action")).toBe("/api/analytics");
      expect(form.querySelector<HTMLInputElement>('input[name="lang"]')?.value).toBe(locale);
    }
    for (const choice of ["full", "default", "off"]) {
      expect(analytics?.querySelector(`#analytics-${choice}`)).not.toBeNull();
    }
    expect(doc.querySelectorAll("form")).toHaveLength(3);
  });

  it("names the opt-out cookie as the only cookie and every browser storage entry", async () => {
    const cookies = sectionText(await renderPrivacy(locale), /^5\. /);

    expect(cookies).toMatch(OPT_OUT_COOKIE_BASIS[locale]);
    expect(cookies).toMatch(THEME_STORAGE[locale]);
    expect(cookies).toMatch(PACKAGE_MANAGER_STORAGE[locale]);
    expect(cookies).toMatch(STORAGE_NEVER_SENT[locale]);
  });

  it("names the cookie and the storage keys under the names the site code writes", async () => {
    const cookies = sectionText(await renderPrivacy(locale), /^5\. /);

    for (const name of [LEGACY_OPT_OUT_COOKIE, THEME_STORAGE_KEY, PACKAGE_MANAGER_GROUP]) {
      expect(cookies).toMatch(new RegExp(`(^|\\s)${name}[\\s.,]`));
    }
  });

  it("states that the opt-out cookie is read only to honour the objection", async () => {
    const analytics = sectionText(await renderPrivacy(locale), /^4\. /);

    expect(analytics).toMatch(OPT_OUT_COOKIE_READ_ONLY_TO_HONOUR[locale]);
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
