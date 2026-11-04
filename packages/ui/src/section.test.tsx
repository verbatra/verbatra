// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  Container,
  DetailList,
  EmptyState,
  MonoValue,
  microLabelClassName,
  PageSection,
  Section,
  SectionCard,
} from "./section.tsx";
import { render } from "./test-support.tsx";

describe("MonoValue and Container", () => {
  it("MonoValue renders its content as code", () => {
    const view = render(<MonoValue>de-DE</MonoValue>);

    expect(view.get("span").textContent).toBe("de-DE");
  });

  it("Container wraps the page content", () => {
    const view = render(
      <Container>
        <p>Body</p>
      </Container>,
    );

    expect(view.get("div > p").textContent).toBe("Body");
  });
});

describe("Section", () => {
  it("renders the title as a heading over the content", () => {
    const view = render(
      <Section title="Translation">
        <p>Body</p>
      </Section>,
    );

    expect(view.get("section > h3").textContent).toBe("Translation");
    expect(view.get("section").lastElementChild?.textContent).toBe("Body");
  });

  it("renders an intro only when one is given", () => {
    const withIntro = render(
      <Section title="T" intro="Why">
        <p>Body</p>
      </Section>,
    );
    expect(withIntro.get("section > p").textContent).toBe("Why");

    const without = render(
      <Section title="T">
        <span>Body</span>
      </Section>,
    );
    expect(without.query("section > p")).toBeNull();
  });
});

describe("EmptyState", () => {
  it("renders the copy and a decorative glyph", () => {
    const view = render(<EmptyState>Nothing yet</EmptyState>);

    expect(view.text()).toContain("Nothing yet");
    expect(view.get("svg").getAttribute("aria-hidden")).toBe("true");
    expect(view.get("svg").dataset.icon).toBe("inbox");
  });

  it("takes a custom glyph", () => {
    const view = render(<EmptyState icon="help">Nothing yet</EmptyState>);

    expect(view.get("svg").dataset.icon).toBe("help");
  });

  it("renders a title and an action only when given", () => {
    const full = render(
      <EmptyState title="No keys" action={<button type="button">Add</button>}>
        Copy
      </EmptyState>,
    );
    expect(full.get("p").textContent).toBe("No keys");
    expect(full.get("button").textContent).toBe("Add");

    const bare = render(<EmptyState>Copy</EmptyState>);
    expect(bare.query("p")).toBeNull();
    expect(bare.query("button")).toBeNull();
  });
});

describe("PageSection", () => {
  it("renders a second-level heading, the meta slot and a caller className", () => {
    const view = render(
      <PageSection title="Locales" meta={<span>3</span>} className="extra">
        <p>Body</p>
      </PageSection>,
    );

    expect(view.get("section > div > h2").textContent).toBe("Locales");
    expect(view.get("section > div > div").textContent).toBe("3");
    expect(view.get("section").className).toContain("extra");
  });

  it("renders no meta container without meta", () => {
    const view = render(
      <PageSection title="Locales">
        <p>Body</p>
      </PageSection>,
    );

    expect(view.query("section > div > div")).toBeNull();
  });
});

describe("SectionCard", () => {
  it("is a card-shaped section with its own heading", () => {
    const view = render(
      <SectionCard title="Provider" className="extra">
        <p>Body</p>
      </SectionCard>,
    );
    const card = view.get("section[data-padding]");

    expect(card.dataset.padding).toBe("md");
    expect(card.className).toContain("extra");
    expect(view.get("h2").textContent).toBe("Provider");
  });

  it("renders intro and meta only when given", () => {
    const full = render(
      <SectionCard title="Provider" intro="Why" meta={<span>live</span>}>
        <p>Body</p>
      </SectionCard>,
    );
    expect(full.get("h2 + p").textContent).toBe("Why");
    expect(full.text()).toContain("live");

    const bare = render(
      <SectionCard title="Provider">
        <span>Body</span>
      </SectionCard>,
    );
    expect(bare.query("h2 + p")).toBeNull();
    expect(bare.query("section > div > div:last-child > span")).toBeNull();
  });
});

describe("DetailList", () => {
  it("renders each pair as a term and its description", () => {
    const view = render(
      <DetailList
        items={[
          ["Format", "json"],
          ["Locales", <b key="l">3</b>],
        ]}
      />,
    );

    expect(view.all("dt").map((term) => term.textContent)).toEqual(["Format", "Locales"]);
    expect(view.all("dd").map((value) => value.textContent)).toEqual(["json", "3"]);
  });

  it("renders an empty list as an empty dl", () => {
    const view = render(<DetailList items={[]} />);

    expect(view.get("dl").children).toHaveLength(0);
  });
});

describe("microLabelClassName", () => {
  it("is the uppercase monospace eyebrow", () => {
    expect(microLabelClassName).toContain("font-mono");
    expect(microLabelClassName).toContain("uppercase");
  });
});
