const dom = globalThis as { Element?: { prototype: { scrollIntoView?: unknown } } };

if (dom.Element !== undefined && typeof dom.Element.prototype.scrollIntoView !== "function") {
  dom.Element.prototype.scrollIntoView = () => {};
}
