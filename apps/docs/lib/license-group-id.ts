export function licenseGroupId(license: string): string {
  const slug = license
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `license-${slug}`;
}
