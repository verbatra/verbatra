import type { SupportedFormat } from "@verbatra/sdk";
import type { StackIconKey } from "../components/stack-icons";

export const STACK_IDS = ["react", "nextjs", "vue", "angular", "flutter"] as const;

export type StackId = (typeof STACK_IDS)[number];

export const STACK_BLOCK_NAMES = [
  "source-file",
  "init",
  "translated-file",
  "runtime-install",
  "load",
] as const;

export type StackBlockName = (typeof STACK_BLOCK_NAMES)[number];

export const STACK_TEXT_FIELDS = [
  "name",
  "library",
  "format",
  "pattern",
  "sourceFile",
  "targetFile",
] as const;

export type StackTextField = (typeof STACK_TEXT_FIELDS)[number];

export const CODE_TEXT_FIELDS: ReadonlySet<StackTextField> = new Set([
  "library",
  "format",
  "pattern",
  "sourceFile",
  "targetFile",
]);

export const SOURCE_LOCALE = "en";

export const TARGET_LOCALE = "de";

export type StackCode = {
  readonly lang: string;
  readonly title?: string;
  readonly code: string;
};

export type Stack = {
  readonly id: StackId;
  readonly name: string;
  readonly library: string;
  readonly icon: StackIconKey;
  readonly format: SupportedFormat;
  readonly pattern: string;
  readonly sourceStrings: string;
  readonly translatedStrings: string;
  readonly runtimeInstall: string;
  readonly load: readonly StackCode[];
};

function lines(...rows: string[]): string {
  return rows.join("\n");
}

export const STACKS: Readonly<Record<StackId, Stack>> = {
  react: {
    id: "react",
    name: "React",
    library: "react-i18next",
    icon: "react",
    format: "i18next-json",
    pattern: "locales/{locale}.json",
    sourceStrings: lines(
      "{",
      '  "greeting": "Hello, {{name}}!",',
      '  "cart": {',
      '    "empty": "Your cart is empty."',
      "  }",
      "}",
    ),
    translatedStrings: lines(
      "{",
      '  "greeting": "Hallo, {{name}}!",',
      '  "cart": {',
      '    "empty": "Dein Warenkorb ist leer."',
      "  }",
      "}",
    ),
    runtimeInstall: "npm install i18next react-i18next",
    load: [
      {
        lang: "ts",
        title: "src/i18n.ts",
        code: lines(
          'import i18n from "i18next";',
          'import { initReactI18next } from "react-i18next";',
          'import de from "../locales/de.json";',
          'import en from "../locales/en.json";',
          "",
          "i18n.use(initReactI18next).init({",
          '  lng: "de",',
          '  fallbackLng: "en",',
          "  resources: { en: { translation: en }, de: { translation: de } },",
          "});",
        ),
      },
      {
        lang: "tsx",
        title: "src/Greeting.tsx",
        code: lines(
          'import { useTranslation } from "react-i18next";',
          "",
          "export function Greeting() {",
          "  const { t } = useTranslation();",
          '  return <p>{t("greeting", { name: "Ada" })}</p>;',
          "}",
        ),
      },
      {
        lang: "tsx",
        title: "src/main.tsx",
        code: lines(
          'import { StrictMode } from "react";',
          'import { createRoot } from "react-dom/client";',
          'import { Greeting } from "./Greeting";',
          'import "./i18n";',
          "",
          'createRoot(document.getElementById("root")!).render(',
          "  <StrictMode>",
          "    <Greeting />",
          "  </StrictMode>,",
          ");",
        ),
      },
    ],
  },
  nextjs: {
    id: "nextjs",
    name: "Next.js",
    library: "next-intl",
    icon: "next",
    format: "next-intl-json",
    pattern: "messages/{locale}.json",
    sourceStrings: lines(
      "{",
      '  "greeting": "Hello, {name}!",',
      '  "cart": {',
      '    "empty": "Your cart is empty."',
      "  }",
      "}",
    ),
    translatedStrings: lines(
      "{",
      '  "greeting": "Hallo, {name}!",',
      '  "cart": {',
      '    "empty": "Dein Warenkorb ist leer."',
      "  }",
      "}",
    ),
    runtimeInstall: "npm install next-intl",
    load: [
      {
        lang: "ts",
        title: "next.config.ts",
        code: lines(
          'import type { NextConfig } from "next";',
          'import createNextIntlPlugin from "next-intl/plugin";',
          "",
          "const nextConfig: NextConfig = {};",
          "",
          "export default createNextIntlPlugin()(nextConfig);",
        ),
      },
      {
        lang: "ts",
        title: "i18n/request.ts",
        code: lines(
          "// with a src/ folder: src/i18n/request.ts, importing ../../messages",
          'import { getRequestConfig } from "next-intl/server";',
          "",
          "export default getRequestConfig(async () => {",
          '  const locale = "de";',
          "  return {",
          "    locale,",
          // biome-ignore lint/suspicious/noTemplateCurlyInString: the sample prints a template literal as text
          "    messages: (await import(`../messages/${locale}.json`)).default,",
          "  };",
          "});",
        ),
      },
      {
        lang: "tsx",
        title: "app/page.tsx",
        code: lines(
          'import { useTranslations } from "next-intl";',
          "",
          "export default function Home() {",
          "  const t = useTranslations();",
          '  return <p>{t("greeting", { name: "Ada" })}</p>;',
          "}",
        ),
      },
    ],
  },
  vue: {
    id: "vue",
    name: "Vue",
    library: "vue-i18n",
    icon: "vue",
    format: "vue-i18n-json",
    pattern: "src/locales/{locale}.json",
    sourceStrings: lines(
      "{",
      '  "greeting": "Hello, {name}!",',
      '  "cart": {',
      '    "empty": "Your cart is empty."',
      "  }",
      "}",
    ),
    translatedStrings: lines(
      "{",
      '  "greeting": "Hallo, {name}!",',
      '  "cart": {',
      '    "empty": "Dein Warenkorb ist leer."',
      "  }",
      "}",
    ),
    runtimeInstall: "npm install vue-i18n",
    load: [
      {
        lang: "ts",
        title: "src/main.ts",
        code: lines(
          'import { createApp } from "vue";',
          'import { createI18n } from "vue-i18n";',
          'import App from "./App.vue";',
          'import de from "./locales/de.json";',
          'import en from "./locales/en.json";',
          "",
          "const i18n = createI18n({",
          "  legacy: false,",
          '  locale: "de",',
          '  fallbackLocale: "en",',
          "  messages: { en, de },",
          "});",
          "",
          'createApp(App).use(i18n).mount("#app");',
        ),
      },
      {
        lang: "vue",
        title: "src/App.vue",
        code: lines("<template>", '  <p>{{ $t("greeting", { name: "Ada" }) }}</p>', "</template>"),
      },
    ],
  },
  angular: {
    id: "angular",
    name: "Angular",
    library: "@ngx-translate/core",
    icon: "angular",
    format: "ngx-translate-json",
    pattern: "src/assets/i18n/{locale}.json",
    sourceStrings: lines(
      "{",
      '  "greeting": "Hello, {{name}}!",',
      '  "cart": {',
      '    "empty": "Your cart is empty."',
      "  }",
      "}",
    ),
    translatedStrings: lines(
      "{",
      '  "greeting": "Hallo, {{name}}!",',
      '  "cart": {',
      '    "empty": "Dein Warenkorb ist leer."',
      "  }",
      "}",
    ),
    runtimeInstall: "npm install @ngx-translate/core @ngx-translate/http-loader",
    load: [
      {
        lang: "ts",
        title: "src/app/app.config.ts",
        code: lines(
          'import { provideHttpClient } from "@angular/common/http";',
          'import type { ApplicationConfig } from "@angular/core";',
          'import { provideTranslateService } from "@ngx-translate/core";',
          'import { provideTranslateHttpLoader } from "@ngx-translate/http-loader";',
          "",
          "export const appConfig: ApplicationConfig = {",
          "  providers: [",
          "    // keep the providers the Angular CLI generated, and add:",
          "    provideHttpClient(),",
          "    provideTranslateService({",
          '      lang: "de",',
          '      fallbackLang: "en",',
          '      loader: provideTranslateHttpLoader({ prefix: "./assets/i18n/", suffix: ".json" }),',
          "    }),",
          "  ],",
          "};",
        ),
      },
      {
        lang: "ts",
        title: "src/app/app.ts",
        code: lines(
          'import { Component } from "@angular/core";',
          'import { TranslatePipe } from "@ngx-translate/core";',
          "",
          "@Component({",
          '  selector: "app-root",',
          "  imports: [TranslatePipe],",
          "  template: `<p>{{ 'greeting' | translate: { name: 'Ada' } }}</p>`,",
          "})",
          "export class App {}",
        ),
      },
      {
        lang: "jsonc",
        title: "angular.json",
        code: lines(
          "// projects.<name>.architect.build.options",
          '"assets": [',
          '  { "glob": "**/*", "input": "public" },',
          '  { "glob": "**/*", "input": "src/assets", "output": "assets" }',
          "]",
        ),
      },
    ],
  },
  flutter: {
    id: "flutter",
    name: "Flutter",
    library: "flutter_localizations",
    icon: "flutter",
    format: "arb",
    pattern: "lib/l10n/app_{locale}.arb",
    sourceStrings: lines(
      "{",
      '  "@@locale": "en",',
      '  "greeting": "Hello, {name}!",',
      '  "@greeting": {',
      '    "placeholders": { "name": { "type": "String" } }',
      "  },",
      '  "cartEmpty": "Your cart is empty."',
      "}",
    ),
    translatedStrings: lines(
      "{",
      '  "@@locale": "de",',
      '  "greeting": "Hallo, {name}!",',
      '  "cartEmpty": "Dein Warenkorb ist leer."',
      "}",
    ),
    runtimeInstall: 'flutter pub add flutter_localizations:"{sdk: flutter}" intl:any',
    load: [
      {
        lang: "yaml",
        title: "pubspec.yaml",
        code: lines("flutter:", "  generate: true"),
      },
      {
        lang: "yaml",
        title: "l10n.yaml",
        code: lines(
          "arb-dir: lib/l10n",
          "template-arb-file: app_en.arb",
          "output-localization-file: app_localizations.dart",
        ),
      },
      {
        lang: "dart",
        title: "lib/main.dart",
        code: lines(
          "import 'package:flutter/material.dart';",
          "import 'l10n/app_localizations.dart';",
          "",
          "void main() => runApp(",
          "  MaterialApp(",
          "    locale: const Locale('de'),",
          "    localizationsDelegates: AppLocalizations.localizationsDelegates,",
          "    supportedLocales: AppLocalizations.supportedLocales,",
          "    home: Builder(",
          "      builder: (context) => Text(AppLocalizations.of(context)!.greeting('Ada')),",
          "    ),",
          "  ),",
          ");",
        ),
      },
    ],
  },
};

export function isStackId(value: unknown): value is StackId {
  return typeof value === "string" && (STACK_IDS as readonly string[]).includes(value);
}

export function stackFile(stack: Stack, locale: string): string {
  return stack.pattern.replace("{locale}", locale);
}

export function stackText(stack: Stack, field: StackTextField): string {
  switch (field) {
    case "sourceFile":
      return stackFile(stack, SOURCE_LOCALE);
    case "targetFile":
      return stackFile(stack, TARGET_LOCALE);
    default:
      return stack[field];
  }
}

export function stackInitCommand(stack: Stack): string {
  return `npx @verbatra/cli init --format ${stack.format} --provider gemini --yes`;
}

export function stackBlock(stack: Stack, name: StackBlockName): readonly StackCode[] {
  switch (name) {
    case "source-file":
      return [{ lang: "json", title: stackFile(stack, SOURCE_LOCALE), code: stack.sourceStrings }];
    case "init":
      return [{ lang: "bash", code: stackInitCommand(stack) }];
    case "translated-file":
      return [
        { lang: "json", title: stackFile(stack, TARGET_LOCALE), code: stack.translatedStrings },
      ];
    case "runtime-install":
      return [{ lang: "bash", code: stack.runtimeInstall }];
    case "load":
      return stack.load;
  }
}
