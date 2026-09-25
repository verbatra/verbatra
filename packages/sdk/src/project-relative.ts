import { parse, sep } from "node:path";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrites every absolute path inside the project in a message to a path relative to the project
 * root, so a file-system layout outside the project never reaches an agent, a browser tab, or a log
 * line. A path under `cwd` loses the `cwd` prefix, `cwd` itself becomes `.`, and a path outside the
 * project is left as it is. A filesystem root such as `/` is not treated as a project root, so the
 * message is then returned unchanged.
 *
 * Every per-locale `error.message` on a {@link RunSummary} has already been through this, relative to
 * the `cwd` of the run; use it on the message of an error a flow throws before showing it.
 *
 * @param message - The text to rewrite, such as an `SdkError` message.
 * @param cwd - The absolute project root the paths are made relative to.
 * @returns The message with every path inside the project made relative to it.
 */
export function projectRelativeMessage(message: string, cwd: string): string {
  const root = cwd.endsWith(sep) && cwd.length > 1 ? cwd.slice(0, -1) : cwd;
  if (root.length === 0 || root === parse(root).root) {
    return message;
  }
  const inside = message.split(`${root}${sep}`).join("");
  const bareRoot = new RegExp(`(?<![\\w.-])${escapeRegExp(root)}(?![\\w.-])`, "g");
  return inside.replace(bareRoot, ".");
}
