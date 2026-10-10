export interface RequestLogEntry {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly rpcMethod?: string | undefined;
}

const REQUEST_LOG_LINE = /^[A-Z]+ \/\S* (?:[A-Za-z][\w.]* )?\d{3}$/;

export function formatRequestLog(entry: RequestLogEntry): string {
  const target = entry.rpcMethod === undefined ? entry.path : `${entry.path} ${entry.rpcMethod}`;
  return `${entry.method} ${target} ${entry.status}`;
}

/**
 * Reports whether a line the Studio server wrote to its `output` sink is a per-request log
 * line (`GET / 200`, `POST /rpc status.check 200`) rather than a banner or an error line.
 */
export function isRequestLogLine(line: string): boolean {
  return REQUEST_LOG_LINE.test(line);
}
