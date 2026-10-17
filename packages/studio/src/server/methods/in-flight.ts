import { RETRANSLATE_ENTRIES_METHOD } from "../../shared/rpc/retranslate-entries.js";
import { RETRANSLATE_ENTRY_METHOD } from "../../shared/rpc/retranslate-entry.js";
import type { RpcHandler } from "../rpc.js";

const RETRANSLATE_METHODS: ReadonlySet<string> = new Set([
  RETRANSLATE_ENTRY_METHOD,
  RETRANSLATE_ENTRIES_METHOD,
]);

export const inFlightHandler: RpcHandler<"translation.inFlight"> = async (_params, deps) => ({
  retranslating: (deps.inFlightEntries?.() ?? [])
    .filter((entry) => RETRANSLATE_METHODS.has(entry.method))
    .map(({ locale, key, elapsedMs }) => ({ locale, key, elapsedMs })),
});
