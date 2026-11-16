import { LOCALES } from "@/lib/locales";
import { defineRestSweeps, REST_SWEEP_EARLY_LOCALES } from "./gate-support";

defineRestSweeps(LOCALES.filter((locale) => !REST_SWEEP_EARLY_LOCALES.includes(locale)));
