import de from "../messages/de.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import ja from "../messages/ja.json";
import ptBR from "../messages/pt-BR.json";
import zhCN from "../messages/zh-CN.json";
import type { Locale } from "./locales";

export type Messages = typeof en;

export const MESSAGE_CATALOGS: Readonly<Record<Locale, Messages>> = {
  en,
  de,
  es,
  fr,
  "zh-CN": zhCN,
  "pt-BR": ptBR,
  ja,
};
