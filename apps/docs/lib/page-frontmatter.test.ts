import { describe, expect, it } from "vitest";
import { pageFrontmatter } from "./page-frontmatter";

describe("pageFrontmatter", () => {
  it("emits the title, description, and type as a YAML block", () => {
    expect(
      pageFrontmatter({ title: "verbatra check", description: "Report drift.", type: "reference" }),
    ).toBe('---\ntitle: "verbatra check"\ndescription: "Report drift."\ntype: "reference"\n---\n');
  });

  it("leaves out a missing or empty field", () => {
    expect(pageFrontmatter({ title: "Introduction", description: "" })).toBe(
      '---\ntitle: "Introduction"\n---\n',
    );
  });

  it("quotes a value that would otherwise break the YAML", () => {
    expect(pageFrontmatter({ title: 'Drive it: "safely"' })).toBe(
      '---\ntitle: "Drive it: \\"safely\\""\n---\n',
    );
  });
});
