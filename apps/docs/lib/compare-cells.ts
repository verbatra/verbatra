import type { CompareRowId, CompareTool } from "./landing-compare";
import {
  MACHINE_PROVIDER_IDS,
  type MachineProviderId,
  SUPPORTED_FORMAT_IDS,
} from "./landing-facts";
import { providerShortLabel } from "./landing-providers";
import { providerReleaseBadge } from "./release-badge";

type CellTranslator = (key: string, values?: Record<string, string | number>) => string;

export type CompareProviderName = {
  readonly id: MachineProviderId;
  readonly label: string;
  readonly since: string | null;
};

export const PROVIDER_LIST_SLOT = "";

export function compareProviderNames(): ReadonlyArray<CompareProviderName> {
  return MACHINE_PROVIDER_IDS.map((id) => ({
    id,
    label: providerShortLabel(id),
    since: providerReleaseBadge(id),
  }));
}

export function compareCellText(
  t: CellTranslator,
  row: CompareRowId,
  tool: CompareTool,
  providers: string,
): string {
  const key = `rows.${row}.${tool}`;
  if (tool !== "verbatra") return t(key);
  if (row === "providers") return t(key, { providers });
  if (row === "formats") return t(key, { count: SUPPORTED_FORMAT_IDS.length });
  return t(key);
}
