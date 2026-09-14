import { relative } from "node:path";

export function toReportedPath(cwd: string, path: string): string {
  return relative(cwd, path).split("\\").join("/");
}
