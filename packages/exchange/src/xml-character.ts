const CONTROL_OR_NONCHARACTER_SOURCE =
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\uFDD0-\\uFDEF]";

const LONE_SURROGATE_SOURCE =
  "[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]";

const PLANE_NONCHARACTER_SOURCE =
  "[\\uD83F\\uD87F\\uD8BF\\uD8FF\\uD93F\\uD97F\\uD9BF\\uD9FF\\uDA3F\\uDA7F\\uDABF\\uDAFF\\uDB3F\\uDB7F\\uDBBF\\uDBFF][\\uDFFE\\uDFFF]|[\\uFFFE\\uFFFF]";

const ILLEGAL_SOURCE = `${CONTROL_OR_NONCHARACTER_SOURCE}|${PLANE_NONCHARACTER_SOURCE}|${LONE_SURROGATE_SOURCE}`;

const ILLEGAL_XML_CHARACTER = new RegExp(ILLEGAL_SOURCE);

const ILLEGAL_XML_CHARACTERS = new RegExp(ILLEGAL_SOURCE, "g");

export function hasIllegalXmlCharacter(text: string): boolean {
  return ILLEGAL_XML_CHARACTER.test(text);
}

export function stripIllegalXmlCharacters(text: string): string {
  return text.replace(ILLEGAL_XML_CHARACTERS, "");
}

export function countIllegalXmlCharacters(text: string): number {
  return text.match(ILLEGAL_XML_CHARACTERS)?.length ?? 0;
}
