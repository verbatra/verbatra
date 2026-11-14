const LITERAL_COLOUR =
  /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(|(?<![\w-])(?:white|black|red|green|blue|gray|grey|orange|purple|yellow|pink|cyan|magenta|silver|navy|teal|maroon|lime|olive|aqua|fuchsia)(?![\w-])/gi;

export function cssBlock(css: string, from: string, to: string): string {
  const start = css.indexOf(from);
  const end = css.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`no stylesheet block from ${from} to ${to}`);
  return css.slice(start, end);
}

export function literalColours(block: string): string[] {
  return block.match(LITERAL_COLOUR) ?? [];
}
