const HEADER_FIELD = /^([\w-]+):\s?(.*)$/;
const NPLURALS = /nplurals\s*=\s*(\d+)/;

export function parseHeaderFields(headerText: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const line of headerText.split("\n")) {
    const match = HEADER_FIELD.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      fields.set(match[1], match[2]);
    }
  }
  return fields;
}

export function parseNplurals(pluralFormsValue: string): number | undefined {
  const match = NPLURALS.exec(pluralFormsValue);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

export function defaultPluralFormsExpression(nplurals: number): string {
  if (nplurals <= 1) {
    return "nplurals=1; plural=0;";
  }
  if (nplurals === 2) {
    return "nplurals=2; plural=(n != 1);";
  }
  return `nplurals=${nplurals}; plural=(n < ${nplurals - 1} ? n : ${nplurals - 1});`;
}
