function tableOffset(data: Buffer, tag: string): number | undefined {
  const count = data.readUInt16BE(4);
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16;
    if (data.toString("latin1", record, record + 4) === tag) return data.readUInt32BE(record + 8);
  }
  return undefined;
}

function addFormat4(data: Buffer, offset: number, covered: Set<number>): void {
  const segments = data.readUInt16BE(offset + 6) / 2;
  const ends = offset + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  for (let segment = 0; segment < segments; segment += 1) {
    const start = data.readUInt16BE(starts + segment * 2);
    const end = data.readUInt16BE(ends + segment * 2);
    const delta = data.readInt16BE(deltas + segment * 2);
    const rangeAt = ranges + segment * 2;
    const range = data.readUInt16BE(rangeAt);
    for (let code = start; code <= end && code !== 0xffff; code += 1) {
      const glyph =
        range === 0
          ? (code + delta) & 0xffff
          : data.readUInt16BE(rangeAt + range + (code - start) * 2);
      if (glyph !== 0) covered.add(code);
    }
  }
}

function addFormat12(data: Buffer, offset: number, covered: Set<number>): void {
  const groups = data.readUInt32BE(offset + 12);
  for (let group = 0; group < groups; group += 1) {
    const at = offset + 16 + group * 12;
    const start = data.readUInt32BE(at);
    const end = data.readUInt32BE(at + 4);
    const firstGlyph = data.readUInt32BE(at + 8);
    for (let code = start; code <= end; code += 1)
      if (firstGlyph + (code - start) !== 0) covered.add(code);
  }
}

export function fontCodePoints(data: Buffer): ReadonlySet<number> {
  const covered = new Set<number>();
  const cmap = tableOffset(data, "cmap");
  if (cmap === undefined) return covered;
  const subtables = data.readUInt16BE(cmap + 2);
  for (let index = 0; index < subtables; index += 1) {
    const offset = cmap + data.readUInt32BE(cmap + 4 + index * 8 + 4);
    const format = data.readUInt16BE(offset);
    if (format === 4) addFormat4(data, offset, covered);
    else if (format === 12) addFormat12(data, offset, covered);
  }
  return covered;
}

export function fontTableTags(data: Buffer): readonly string[] {
  const count = data.readUInt16BE(4);
  return Array.from({ length: count }, (_, index) =>
    data.toString("latin1", 12 + index * 16, 16 + index * 16),
  );
}

export function missingGlyphs(characters: string, fonts: readonly Buffer[]): string[] {
  const covered = fonts.map(fontCodePoints);
  return [...characters].filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return !covered.some((codes) => codes.has(code));
  });
}
