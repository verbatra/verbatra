const ANIMATION_ATTRIBUTES: ReadonlySet<string> = new Set(["attributename", "attributetype"]);

const VERBATIM_ATTRIBUTES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["animate", ANIMATION_ATTRIBUTES],
  ["animatemotion", ANIMATION_ATTRIBUTES],
  ["animatetransform", ANIMATION_ATTRIBUTES],
  ["base", new Set(["target"])],
  ["form", new Set(["enctype", "method", "target"])],
  ["iframe", new Set(["allow", "allowfullscreen", "sandbox"])],
  ["link", new Set(["as", "crossorigin", "integrity", "rel", "type"])],
  ["meta", new Set(["content", "http-equiv"])],
  ["script", new Set(["crossorigin", "integrity", "nomodule", "type"])],
  ["set", ANIMATION_ATTRIBUTES],
]);

const ON_ANY_ELEMENT: ReadonlySet<string> = new Set(["srcdoc", "style"]);

export function keepsValueVerbatim(tagName: string, attributeName: string): boolean {
  const name = attributeName.toLowerCase();
  if (ON_ANY_ELEMENT.has(name) || name.startsWith("on")) {
    return true;
  }
  return VERBATIM_ATTRIBUTES.get(tagName.toLowerCase())?.has(name) === true;
}
