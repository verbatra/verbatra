import { IN_FLIGHT_METHOD } from "./in-flight.js";
import { RETRANSLATE_ENTRIES_METHOD } from "./retranslate-entries.js";
import { REVIEW_APPROVE_MANY_METHOD, REVIEW_REJECT_MANY_METHOD } from "./review-batch.js";
import { REVIEW_APPROVE_METHOD, REVIEW_REJECT_METHOD } from "./review-decision.js";

export const HUMAN_ONLY_METHOD_NAMES = [
  REVIEW_APPROVE_METHOD,
  REVIEW_REJECT_METHOD,
  REVIEW_APPROVE_MANY_METHOD,
  REVIEW_REJECT_MANY_METHOD,
  RETRANSLATE_ENTRIES_METHOD,
  IN_FLIGHT_METHOD,
] as const;

export type HumanOnlyMethodName = (typeof HUMAN_ONLY_METHOD_NAMES)[number];
