// @vitest-environment jsdom
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { click, render } from "./test-support.js";
import {
  Container,
  DetailList,
  DialogCloseButton,
  DrawerShell,
  EmptyState,
  MonoValue,
  microLabelClassName,
  OverlayBackdrop,
  PageSection,
  pillClassName,
  pillDotClassName,
  Section,
  SectionCard,
  tableClasses,
} from "./ui.js";

describe("MonoValue", () => {
  it("renders its content in the monospace face, for anything that reads as code", () => {
    const view = render(<MonoValue>de-DE</MonoValue>);

    expect(view.get("span").className).toBe("font-mono");
    expect(view.text()).toBe("de-DE");
  });
});

describe("Container", () => {
  it("centers and width-caps the page content column", () => {
    const view = render(
      <Container>
        <p>Body</p>
      </Container>,
    );
    const className = view.get("div").className;

    expect(className).toContain("mx-auto");
    expect(className).toContain("max-w-6xl");
    expect(view.text()).toBe("Body");
  });
});

describe("OverlayBackdrop", () => {
  it("is a real button, so dismissing by clicking outside stays keyboard-operable", () => {
    const view = render(<OverlayBackdrop onClose={() => {}} label="Close the key detail" />);
    const backdrop = view.get("button");

    expect(backdrop.getAttribute("type")).toBe("button");
    expect(backdrop.getAttribute("aria-label")).toBe("Close the key detail");
  });

  it("dims the page through the overlay token, which darkens in both themes", () => {
    const view = render(<OverlayBackdrop onClose={() => {}} label="Close" />);

    expect(view.get("button").className).toContain("bg-overlay");
    expect(view.get("button").className).not.toContain("bg-foreground");
  });

  it("calls onClose when clicked", () => {
    const onClose = vi.fn();
    const view = render(<OverlayBackdrop onClose={onClose} label="Close" />);

    click(view.get("button"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("DialogCloseButton", () => {
  it("names itself Close by default, since the glyph alone carries no name", () => {
    const view = render(<DialogCloseButton onClose={() => {}} />);

    expect(view.get("button").getAttribute("aria-label")).toBe("Close");
  });

  it("takes a more specific accessible name when one is given", () => {
    const view = render(<DialogCloseButton onClose={() => {}} label="Close the edit dialog" />);

    expect(view.get("button").getAttribute("aria-label")).toBe("Close the edit dialog");
  });

  it("calls onClose when pressed", () => {
    const onClose = vi.fn();
    const view = render(<DialogCloseButton onClose={onClose} />);

    click(view.get("button"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the close glyph as decorative", () => {
    const view = render(<DialogCloseButton onClose={() => {}} />);

    expect(view.get("svg").getAttribute("aria-hidden")).toBe("true");
  });

  it("uses the compact default spacing", () => {
    const view = render(<DialogCloseButton onClose={() => {}} />);

    expect(view.get("button").classList.contains("p-1.5")).toBe(true);
  });

  it("lets a caller replace the spacing className entirely", () => {
    const view = render(<DialogCloseButton onClose={() => {}} className="ms-auto p-0" />);
    const classList = view.get("button").classList;

    expect(classList.contains("ms-auto")).toBe(true);
    expect(classList.contains("p-1.5")).toBe(false);
  });
});

describe("DrawerShell", () => {
  it("anchors the drawer to the inline-end edge and names the dialog", () => {
    const view = render(
      <DrawerShell
        title="app.title"
        ariaLabel="Key detail"
        closeLabel="Close the key detail"
        onClose={() => {}}
        containerRef={createRef<HTMLDivElement>()}
      >
        <p>Body</p>
      </DrawerShell>,
    );
    const dialog = view.get("[role='dialog']");

    expect(dialog.getAttribute("aria-label")).toBe("Key detail");
    expect(view.get("div").className).toContain("justify-end");
  });

  it("passes its close handler to both the backdrop and the header button", () => {
    const onClose = vi.fn();
    const view = render(
      <DrawerShell
        title="app.title"
        ariaLabel="Key detail"
        closeLabel="Close the key detail"
        onClose={onClose}
        containerRef={createRef<HTMLDivElement>()}
      >
        <p>Body</p>
      </DrawerShell>,
    );

    for (const button of view.all("button")) {
      click(button);
    }

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Section", () => {
  it("renders the title as a micro-labelled heading", () => {
    const view = render(
      <Section title="Placeholders">
        <p>Body</p>
      </Section>,
    );
    const heading = view.get("h3");

    expect(heading.textContent).toBe("Placeholders");
    expect(heading.className).toContain(microLabelClassName);
  });

  it("renders the intro line above the content when one is given", () => {
    const view = render(
      <Section title="Placeholders" intro="Every token the source string carries.">
        <p>Body</p>
      </Section>,
    );

    expect(view.getByText("p", "Every token the source string carries.")).not.toBeNull();
  });

  it("renders no intro line when none is given", () => {
    const view = render(
      <Section title="Placeholders">
        <span>Body</span>
      </Section>,
    );

    expect(view.query("p")).toBeNull();
  });
});

describe("EmptyState", () => {
  it("renders the explanatory copy inside a dashed placeholder block", () => {
    const view = render(<EmptyState>Nothing needs review.</EmptyState>);

    expect(view.get("div").className).toContain("border-dashed");
    expect(view.text()).toBe("Nothing needs review.");
  });

  it("uses the inbox glyph by default", () => {
    const view = render(<EmptyState>Nothing needs review.</EmptyState>);

    expect(view.get("svg").getAttribute("aria-hidden")).toBe("true");
    expect(view.get("svg").querySelector("polyline")).not.toBeNull();
  });

  it("renders the short title above the copy when one is given", () => {
    const view = render(<EmptyState title="Queue is empty">Nothing needs review.</EmptyState>);

    expect(view.getByText("p", "Queue is empty")).not.toBeNull();
  });

  it("renders no title element when none is given", () => {
    const view = render(<EmptyState>Nothing needs review.</EmptyState>);

    expect(view.query("p")).toBeNull();
  });

  it("renders the follow-up control in the action slot when one is given", () => {
    const view = render(
      <EmptyState icon="search" action={<button type="button">Clear filters</button>}>
        No matches.
      </EmptyState>,
    );

    expect(view.getByText("button", "Clear filters")).not.toBeNull();
  });

  it("renders no control when there is no action", () => {
    const view = render(<EmptyState>No matches.</EmptyState>);

    expect(view.query("button")).toBeNull();
  });
});

describe("PageSection", () => {
  it("renders the title as a second-level heading over the content", () => {
    const view = render(
      <PageSection title="Locales">
        <p>Body</p>
      </PageSection>,
    );

    expect(view.get("h2").textContent).toBe("Locales");
    expect(view.getByText("p", "Body")).not.toBeNull();
  });

  it("renders the meta slot beside the heading when one is given", () => {
    const view = render(
      <PageSection title="Locales" meta={<span>4 locales</span>}>
        <p>Body</p>
      </PageSection>,
    );

    expect(view.getByText("span", "4 locales")).not.toBeNull();
  });

  it("renders no meta container when there is no meta", () => {
    const view = render(
      <PageSection title="Locales">
        <p>Body</p>
      </PageSection>,
    );

    expect(view.all("div")).toHaveLength(1);
  });

  it("merges a caller className onto the section", () => {
    const view = render(
      <PageSection title="Locales" className="mb-0">
        <p>Body</p>
      </PageSection>,
    );

    expect(view.get("section").className).toContain("mb-0");
  });
});

describe("SectionCard", () => {
  it("renders as a card-shaped section with its own heading", () => {
    const view = render(
      <SectionCard title="Provider">
        <p>Body</p>
      </SectionCard>,
    );
    const section = view.get("section");

    expect(section.className).toContain("border-border");
    expect(view.get("h2").textContent).toBe("Provider");
  });

  it("renders the intro line under the heading when one is given", () => {
    const view = render(
      <SectionCard title="Provider" intro="Where translations come from.">
        <span>Body</span>
      </SectionCard>,
    );

    expect(view.getByText("p", "Where translations come from.")).not.toBeNull();
  });

  it("renders no intro line when none is given", () => {
    const view = render(
      <SectionCard title="Provider">
        <span>Body</span>
      </SectionCard>,
    );

    expect(view.query("p")).toBeNull();
  });

  it("renders the meta slot at the inline end when one is given", () => {
    const view = render(
      <SectionCard title="Provider" meta={<span>anthropic</span>}>
        <p>Body</p>
      </SectionCard>,
    );

    expect(view.getByText("span", "anthropic")).not.toBeNull();
  });

  it("renders no meta container when there is no meta", () => {
    const view = render(
      <SectionCard title="Provider">
        <p>Body</p>
      </SectionCard>,
    );

    expect(view.all("div")).toHaveLength(2);
  });

  it("merges a caller className onto the card", () => {
    const view = render(
      <SectionCard title="Provider" className="mb-0">
        <p>Body</p>
      </SectionCard>,
    );

    expect(view.get("section").className).toContain("mb-0");
  });
});

describe("DetailList", () => {
  it("renders each pair as a term and its description", () => {
    const view = render(
      <DetailList
        items={[
          ["Provider", "anthropic"],
          ["Source locale", <MonoValue key="source">en</MonoValue>],
        ]}
      />,
    );

    expect(view.all("dt").map((term) => term.textContent)).toEqual(["Provider", "Source locale"]);
    expect(view.all("dd").map((value) => value.textContent)).toEqual(["anthropic", "en"]);
  });

  it("renders an empty list as an empty dl rather than failing", () => {
    const view = render(<DetailList items={[]} />);

    expect(view.get("dl").children).toHaveLength(0);
  });
});

describe("shared class constants", () => {
  it("gives the table a horizontal minimum, so a narrow viewport scrolls rather than squashes", () => {
    expect(tableClasses.table).toContain("min-w-[480px]");
  });

  it("end-aligns numeric columns with fixed-rhythm digits", () => {
    expect(tableClasses.numeric).toBe("text-end tabular-nums");
  });

  it("keeps a pill on one line", () => {
    expect(pillClassName).toContain("whitespace-nowrap");
  });

  it("colors the pill dot by the pill's own text color", () => {
    expect(pillDotClassName).toContain("bg-current");
  });

  it("renders the micro-label as uppercase monospace", () => {
    expect(microLabelClassName).toContain("uppercase");
    expect(microLabelClassName).toContain("font-mono");
  });
});
