import { ProviderError } from "./errors.js";

export function sdkLoadFailedMessage(packageName: string): string {
  return `The provider package ${packageName} could not be loaded. Reinstall @verbatra/sdk.`;
}

export async function loadSdkModule<T>(
  packageName: string,
  importer: () => Promise<T>,
): Promise<T> {
  try {
    return await importer();
  } catch {
    throw new ProviderError("PROVIDER_ERROR", sdkLoadFailedMessage(packageName));
  }
}

export function memoizeAsync<T>(build: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= build().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
