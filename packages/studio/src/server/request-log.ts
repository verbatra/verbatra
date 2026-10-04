export interface RequestLogEntry {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly rpcMethod?: string | undefined;
}

export function formatRequestLog(entry: RequestLogEntry): string {
  const target = entry.rpcMethod === undefined ? entry.path : `${entry.path} ${entry.rpcMethod}`;
  return `${entry.method} ${target} ${entry.status}`;
}
