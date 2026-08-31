import { AdapterError } from "../errors.js";

const RESOURCE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function assertValidResourceName(name: string, tag: string): void {
  if (!RESOURCE_NAME.test(name)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The <${tag} name="${name}"> resource name is not a valid Android resource name. ` +
        "A resource name must start with a letter or underscore and contain only letters, digits, and underscores.",
    );
  }
}
