import type { z } from "zod";

const RECORD_KEY_PLACEHOLDER = "<key>";

type PathSegment = PropertyKey;

function unwrap(schema: z.core.$ZodType): z.core.$ZodType {
  const def = schema._zod.def;
  if (def.type === "optional" || def.type === "nullable" || def.type === "readonly") {
    return unwrap((def as z.core.$ZodOptionalDef).innerType);
  }
  return schema;
}

function childOf(schema: z.core.$ZodType, segment: PathSegment): z.core.$ZodType | undefined {
  const def = schema._zod.def;
  if (def.type === "object") {
    return (def as z.core.$ZodObjectDef).shape[String(segment)];
  }
  if (def.type === "array") {
    return (def as z.core.$ZodArrayDef).element;
  }
  return undefined;
}

function segmentsBeforeRecordKeys(
  schema: z.core.$ZodType,
  path: readonly PathSegment[],
): readonly PathSegment[] {
  const [segment, ...rest] = path;
  if (segment === undefined) {
    return [];
  }
  const node = unwrap(schema);
  if (node._zod.def.type === "record") {
    return [RECORD_KEY_PLACEHOLDER];
  }
  const child = childOf(node, segment);
  return [segment, ...(child === undefined ? rest : segmentsBeforeRecordKeys(child, rest))];
}

export function describeIssuePath(schema: z.core.$ZodType, issue: z.core.$ZodIssue): string {
  const segments = segmentsBeforeRecordKeys(schema, issue.path);
  return segments.length > 0 ? segments.map(String).join(".") : "(root)";
}
