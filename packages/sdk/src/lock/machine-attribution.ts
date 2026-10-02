import { isMachineProvider, type ProviderConfig } from "../config/provider-config.js";
import type { MachineAttribution } from "./provenance-file.js";

export function machineAttribution(
  provider: ProviderConfig,
  resolvedId: string = provider.id,
): MachineAttribution | undefined {
  if (!isMachineProvider(provider)) {
    return undefined;
  }
  if (resolvedId !== provider.id) {
    return { provider: resolvedId };
  }
  const options = provider.options;
  return {
    provider: provider.id,
    ...("model" in options ? { model: options.model } : {}),
  };
}
