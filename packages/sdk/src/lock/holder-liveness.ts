import { hostname } from "node:os";

export type SignalProbe = (pid: number, signal: 0) => void;

export interface LivenessContext {
  readonly host: string;
  readonly probe: SignalProbe;
}

export const currentHostLiveness: LivenessContext = {
  host: hostname(),
  probe: (pid, signal) => {
    process.kill(pid, signal);
  },
};

export interface RecordedHolder {
  readonly pid?: number;
  readonly hostname?: string;
}

function isProcessGone(pid: number, probe: SignalProbe): boolean {
  try {
    probe(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

export function isHolderProvablyDead(holder: RecordedHolder, context: LivenessContext): boolean {
  if (holder.pid === undefined || holder.hostname !== context.host) {
    return false;
  }
  if (!Number.isSafeInteger(holder.pid) || holder.pid <= 0) {
    return false;
  }
  return isProcessGone(holder.pid, context.probe);
}
