import { type FormatId, isCustomFormatId, SUPPORTED_FORMATS } from "@verbatra/core";
import {
  type AdapterRegistry,
  createDefaultRegistry,
  type FormatAdapter,
} from "@verbatra/format-adapters";
import { SdkError } from "../errors.js";
import type { SdkFs } from "../fs.js";
import { toAdapterFs } from "./adapter-fs.js";

function unknownFormatMessage(format: FormatId): string {
  if (isCustomFormatId(format)) {
    return (
      `No adapter is registered for the third-party format "${format}". Build it with ` +
      "createTreeFileAdapter or createFlatFileAdapter, register it on an AdapterRegistry, and " +
      "pass that registry as the adapterRegistry dependency."
    );
  }
  return `No adapter is registered for format "${format}". Supported formats: ${SUPPORTED_FORMATS.join(", ")}.`;
}

export function selectAdapter(
  format: FormatId,
  registry?: AdapterRegistry,
  fs?: SdkFs,
): FormatAdapter {
  const resolved =
    registry ?? createDefaultRegistry(fs === undefined ? undefined : toAdapterFs(fs));
  const resolution = resolved.resolve("", { format });
  if (resolution.status === "resolved") {
    return resolution.adapter;
  }
  throw new SdkError("UNKNOWN_FORMAT", unknownFormatMessage(format));
}
