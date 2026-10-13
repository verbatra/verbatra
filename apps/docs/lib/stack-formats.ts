import type { SupportedFormat } from "@verbatra/sdk";

type StackFramework = {
  readonly key: string;
  readonly name: string;
  readonly format: SupportedFormat;
};

export const STACK_FRAMEWORKS = [
  { key: "react", name: "React", format: "i18next-json" },
  { key: "next", name: "Next.js", format: "next-intl-json" },
  { key: "vue", name: "Vue", format: "vue-i18n-json" },
  { key: "nuxt", name: "Nuxt", format: "vue-i18n-json" },
  { key: "angular", name: "Angular", format: "ngx-translate-json" },
  { key: "node", name: "Node.js", format: "i18next-json" },
  { key: "svelte", name: "SvelteKit", format: "i18next-json" },
  { key: "astro", name: "Astro", format: "i18next-json" },
  { key: "reactNative", name: "React Native", format: "i18next-json" },
  { key: "flutter", name: "Flutter", format: "arb" },
  { key: "spring", name: "Spring", format: "properties" },
  { key: "apple", name: "iOS and macOS", format: "apple-xcstrings" },
  { key: "android", name: "Android", format: "android-xml" },
  { key: "dotnet", name: ".NET", format: "resx" },
] as const satisfies ReadonlyArray<StackFramework>;
