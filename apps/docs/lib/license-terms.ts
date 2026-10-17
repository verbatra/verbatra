const TERMS_URL = /https:\/\/\S+/;

export function licenseTermsUrl(license: string): string | null {
  const match = TERMS_URL.exec(license)?.[0];
  return match === undefined ? null : match.replace(/[.,;)]+$/, "");
}
