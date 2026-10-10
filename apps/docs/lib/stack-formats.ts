import type { SupportedFormat } from "@verbatra/sdk";
import type { StackIconKey } from "@/components/stack-icons";

export type StackFramework = {
  readonly key: string;
  readonly name: string;
  readonly icon: StackIconKey;
  readonly format: SupportedFormat;
};

export const STACK_FRAMEWORKS = [
  { key: "react", name: "React", icon: "react", format: "i18next-json" },
  { key: "next", name: "Next.js", icon: "next", format: "next-intl-json" },
  { key: "vue", name: "Vue", icon: "vue", format: "vue-i18n-json" },
  { key: "nuxt", name: "Nuxt", icon: "nuxt", format: "vue-i18n-json" },
  { key: "angular", name: "Angular", icon: "angular", format: "ngx-translate-json" },
  { key: "node", name: "Node.js", icon: "node", format: "i18next-json" },
  { key: "svelte", name: "SvelteKit", icon: "svelte", format: "i18next-json" },
  { key: "astro", name: "Astro", icon: "astro", format: "i18next-json" },
  { key: "reactNative", name: "React Native", icon: "expo", format: "i18next-json" },
  { key: "flutter", name: "Flutter", icon: "flutter", format: "arb" },
  { key: "spring", name: "Spring", icon: "spring", format: "properties" },
  { key: "apple", name: "iOS and macOS", icon: "apple", format: "apple-xcstrings" },
  { key: "android", name: "Android", icon: "android", format: "android-xml" },
  { key: "dotnet", name: ".NET", icon: "dotnet", format: "resx" },
] as const satisfies ReadonlyArray<StackFramework>;
