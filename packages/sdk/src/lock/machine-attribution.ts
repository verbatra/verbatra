import { isMachineProvider, type ProviderConfig } from "../config/provider-config.js";
import type { MachineAttribution } from "./provenance-file.js";

export function machineAttribution(provider: ProviderConfig): MachineAttribution | undefined {
  if (!isMachineProvider(provider)) {
    return undefined;
  }
  const options = provider.options;
  return {
    provider: provider.id,
    ...("model" in options ? { model: options.model } : {}),
  };
}
