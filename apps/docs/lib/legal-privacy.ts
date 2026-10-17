import { type Locale, localizedPath } from "./i18n";
import { PRIVACY_CONTACT_FORM_ANCHOR } from "./site";

const UMAMI_DOCS = "https://umami.is/docs/";
const GITHUB_REPO = "https://github.com/verbatra/verbatra";
const GITHUB_PRIVACY =
  "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement";
const NPM_SCOPE = "https://www.npmjs.com/search?q=%40verbatra";
const NPM_PRIVACY = "https://docs.npmjs.com/policies/privacy";
const CONTABO_URL = "https://contabo.com/de/";
const ARCJET_PRIVACY = "https://docs.arcjet.com/privacy";
const CONTACT_MAILTO = "mailto:info@kreitz-webdev.de";
const SUPERVISORY_AUTHORITY_URL = "https://www.baden-wuerttemberg.datenschutz.de";

export const PRIVACY_OBJECTION_KEY = "objection";
export const PRIVACY_ANALYTICS_KEY = "s4";
export const PRIVACY_OBJECTION_HEADING_ID = "right-to-object";

export const PRIVACY_SECTION_KEYS = [
  "s1",
  "s2",
  "s3",
  PRIVACY_ANALYTICS_KEY,
  "s5",
  "s6",
  "s7",
  "s8",
  PRIVACY_OBJECTION_KEY,
  "s9",
  "s10",
  "s11",
  "s12",
] as const;

type PrivacySectionKey = (typeof PRIVACY_SECTION_KEYS)[number];

export const PRIVACY_HEADING_ANCHORS: Partial<Record<PrivacySectionKey, string>> = {
  [PRIVACY_ANALYTICS_KEY]: "analytics",
  s11: PRIVACY_CONTACT_FORM_ANCHOR,
};

export function privacyLinkHrefs(locale: Locale) {
  return {
    email: CONTACT_MAILTO,
    umami: UMAMI_DOCS,
    repo: GITHUB_REPO,
    ghprivacy: GITHUB_PRIVACY,
    npm: NPM_SCOPE,
    npmprivacy: NPM_PRIVACY,
    contabo: CONTABO_URL,
    arcjetprivacy: ARCJET_PRIVACY,
    contact: localizedPath(locale, "/contact"),
    imprint: localizedPath(locale, "/imprint"),
    lfdi: SUPERVISORY_AUTHORITY_URL,
  } as const;
}
