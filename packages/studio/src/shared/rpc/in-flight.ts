import { z } from "zod";

export const IN_FLIGHT_METHOD = "translation.inFlight";

export const inFlightParamsSchema = z.strictObject({});

export type InFlightParams = z.infer<typeof inFlightParamsSchema>;

export interface InFlightRetranslation {
  readonly locale: string;
  readonly key: string;
  readonly elapsedMs: number;
}

export interface InFlightResult {
  readonly retranslating: readonly InFlightRetranslation[];
}
