import {
  isMachineClassOrigin,
  type KeyProvenance,
  keyProvenance,
  type MachineClassOrigin,
} from "../lock/key-provenance.js";
import type { ProvenanceRecord } from "../lock/provenance-file.js";
import type { LocaleDiffResult } from "./diff-locales.js";

export interface MachineClassValue {
  readonly key: string;
  readonly value: string;
  readonly provenance: KeyProvenance & { readonly origin: MachineClassOrigin };
}

function* translatedKeys(result: LocaleDiffResult): Generator<readonly [string, string]> {
  for (const key of result.source.entries.keys()) {
    const entry = result.target.entries.get(key);
    if (entry !== undefined) {
      yield [key, entry.value];
    }
  }
}

export function machineClassValues(
  result: LocaleDiffResult,
  records: ReadonlyMap<string, ProvenanceRecord>,
): MachineClassValue[] {
  const values: MachineClassValue[] = [];
  for (const [key, value] of translatedKeys(result)) {
    const provenance = keyProvenance(records.get(key), value, result.baseline.get(key));
    if (isMachineClassOrigin(provenance.origin)) {
      values.push({ key, value, provenance: { ...provenance, origin: provenance.origin } });
    }
  }
  return values;
}
