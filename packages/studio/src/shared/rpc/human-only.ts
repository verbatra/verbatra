import { GIT_LOCALE_DIFF_METHOD, GIT_STATUS_METHOD } from "./git.js";
import { IN_FLIGHT_METHOD } from "./in-flight.js";
import { KEY_PREVIEW_ICU_METHOD } from "./key-preview-icu.js";
import { KEY_SET_MAX_LENGTH_METHOD } from "./key-set-max-length.js";
import { RETRANSLATE_ENTRIES_METHOD } from "./retranslate-entries.js";
import { REVIEW_APPROVE_MANY_METHOD, REVIEW_REJECT_MANY_METHOD } from "./review-batch.js";
import { REVIEW_APPROVE_LOCALE_METHOD } from "./review-locale.js";

export const HUMAN_ONLY_METHOD_NAMES = [
  REVIEW_APPROVE_MANY_METHOD,
  REVIEW_REJECT_MANY_METHOD,
  REVIEW_APPROVE_LOCALE_METHOD,
  RETRANSLATE_ENTRIES_METHOD,
  IN_FLIGHT_METHOD,
  KEY_PREVIEW_ICU_METHOD,
  KEY_SET_MAX_LENGTH_METHOD,
  GIT_STATUS_METHOD,
  GIT_LOCALE_DIFF_METHOD,
] as const;

export type HumanOnlyMethodName = (typeof HUMAN_ONLY_METHOD_NAMES)[number];
