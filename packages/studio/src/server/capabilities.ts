import { isMachineTranslationEnabled, type VerbatraConfig } from "@verbatra/sdk";
import type { StudioCapabilities } from "../shared/rpc/snapshot.js";

export function resolveCapabilities(
  spendGranted: boolean,
  config: Pick<VerbatraConfig, "provider">,
): StudioCapabilities {
  if (!spendGranted) {
    return { spend: false, spendWithheld: "flag", writeToDisk: true };
  }
  if (!isMachineTranslationEnabled(config)) {
    return { spend: false, spendWithheld: "policy", writeToDisk: true };
  }
  return { spend: true, writeToDisk: true };
}
