import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { type KernelIdentity, readKernelIdentity } from "../fs.js";

export type SignalProbe = (pid: number, signal: 0) => void;

export interface LivenessContext extends KernelIdentity {
  readonly host: string;
  readonly probe: SignalProbe;
}

let currentHost: LivenessContext | undefined;

export function currentHostLiveness(): LivenessContext {
  currentHost ??= {
    host: hostname(),
    ...readKernelIdentity(),
    probe: (pid, signal) => {
      process.kill(pid, signal);
    },
  };
  return currentHost;
}

export interface RecordedHolder extends KernelIdentity {
  readonly pid?: number;
  readonly hostname?: string;
}

export function sharesProcessTable(holder: RecordedHolder, context: LivenessContext): boolean {
  return (
    holder.hostname === context.host &&
    holder.bootId === context.bootId &&
    holder.pidNamespace === context.pidNamespace
  );
}

function isProcessGone(pid: number, probe: SignalProbe): boolean {
  try {
    probe(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

export function isLocalPidGone(pid: number, context: LivenessContext): boolean {
  return Number.isSafeInteger(pid) && pid > 0 && isProcessGone(pid, context.probe);
}

export function isHolderProvablyDead(holder: RecordedHolder, context: LivenessContext): boolean {
  if (holder.pid === undefined || !sharesProcessTable(holder, context)) {
    return false;
  }
  return isLocalPidGone(holder.pid, context);
}

const IDENTITY_TAG_LENGTH = 12;

export function identityTag(context: LivenessContext): string {
  return createHash("sha256")
    .update([context.host, context.bootId ?? "", context.pidNamespace ?? ""].join("\0"))
    .digest("hex")
    .slice(0, IDENTITY_TAG_LENGTH);
}

export function isHeldByThisProcess(holder: RecordedHolder, context: LivenessContext): boolean {
  return holder.pid === process.pid && sharesProcessTable(holder, context);
}
