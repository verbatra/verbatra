const NAME_START = "[\\p{L}_$]";

function nameContinue(extra: string): string {
  return `[\\p{L}\\p{M}\\p{Nd}_$${extra}-]`;
}

export const PLACEHOLDER_ARGUMENT_IDENTIFIER = `${NAME_START}${nameContinue("")}*`;

export const PLACEHOLDER_ARGUMENT_NAME = `(?:\\p{Nd}+|${PLACEHOLDER_ARGUMENT_IDENTIFIER})`;

export const DOTTED_PLACEHOLDER_NAME = `(?:\\p{Nd}+|${NAME_START}${nameContinue(".")}*)`;

const WHOLE_ARGUMENT_NAME = new RegExp(`^${PLACEHOLDER_ARGUMENT_NAME}$`, "u");

export function isPlaceholderArgumentName(name: string): boolean {
  return WHOLE_ARGUMENT_NAME.test(name);
}
