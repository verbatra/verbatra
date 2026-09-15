const ILLEGAL_XML_CHARACTER_SOURCE =
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\uFFFE\\uFFFF]";

const ILLEGAL_XML_CHARACTER = new RegExp(ILLEGAL_XML_CHARACTER_SOURCE, "u");

const ILLEGAL_XML_CHARACTERS = new RegExp(ILLEGAL_XML_CHARACTER_SOURCE, "gu");

export function hasIllegalXmlCharacter(text: string): boolean {
  return ILLEGAL_XML_CHARACTER.test(text);
}

export function stripIllegalXmlCharacters(text: string): string {
  return text.replace(ILLEGAL_XML_CHARACTERS, "");
}
