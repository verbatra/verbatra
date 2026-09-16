import { INTEGRITY_GATE_REASONS } from "@verbatra/sdk";
import { z } from "zod";

export const integrityGateReasonSchema = z.enum(INTEGRITY_GATE_REASONS);
