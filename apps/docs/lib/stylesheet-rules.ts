import { readFileSync } from "node:fs";
import { join } from "node:path";

export type StyleRule = {
  selector: string;
  media: string;
  declarations: Readonly<Record<string, string>>;
};

function declarationsOf(body: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim();
    if (property)
      declarations[property] = part
        .slice(colon + 1)
        .trim()
        .replace(/\s+/g, " ");
  }
  return declarations;
}

export function stylesheetRules(css: string): StyleRule[] {
  const rules: StyleRule[] = [];
  const stack: string[] = [];
  let buffer = "";
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (char === "{") {
      stack.push(buffer.trim().replace(/\s+/g, " "));
      buffer = "";
    } else if (char === "}") {
      const selector = stack.pop() ?? "";
      if (!selector.startsWith("@")) {
        const media = stack.filter((entry) => entry.startsWith("@")).join(" ");
        rules.push({ selector, media, declarations: declarationsOf(buffer) });
      }
      buffer = "";
    } else if (char === ";" && stack.length === 0) {
      buffer = "";
    } else {
      buffer += char;
    }
  }
  return rules;
}

export function docsStylesheetRules(): StyleRule[] {
  return stylesheetRules(readFileSync(join(process.cwd(), "app/global.css"), "utf8"));
}

export function rulesFor(rules: ReadonlyArray<StyleRule>, selector: string): StyleRule[] {
  return rules.filter((rule) => rule.selector.split(/,\s*/).includes(selector));
}
