// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  tableClasses,
} from "./table.tsx";
import { render } from "./test-support.tsx";

function grid(node: React.ReactNode) {
  return render(
    <Table aria-label="Keys">
      <TableHead>
        <tr>{node}</tr>
      </TableHead>
    </Table>,
  );
}

describe("Table", () => {
  it("renders a named table and merges a caller className", () => {
    const view = render(<Table aria-label="Keys" className="min-w-0" />);
    const table = view.get("table");

    expect(table.getAttribute("aria-label")).toBe("Keys");
    expect(table.className).toContain("min-w-0");
    expect(table.className).toContain(tableClasses.table.split(" ")[0] ?? "");
  });
});

describe("tableClasses", () => {
  it("gives the table a horizontal minimum, so a narrow viewport scrolls rather than squashes", () => {
    expect(tableClasses.table.split(" ")).toContain("min-w-[480px]");
  });
});

describe("TableHead and TableBody", () => {
  it("render a thead and a tbody with their children", () => {
    const view = render(
      <table>
        <TableHead>
          <tr>
            <th>H</th>
          </tr>
        </TableHead>
        <TableBody className="x">
          <tr>
            <td>B</td>
          </tr>
        </TableBody>
      </table>,
    );

    expect(view.get("thead th").textContent).toBe("H");
    expect(view.get("tbody td").textContent).toBe("B");
    expect(view.get("tbody").className).toContain("x");
  });
});

describe("TableRow", () => {
  function row(props: { hover?: boolean; className?: string }) {
    return render(
      <table>
        <tbody>
          <TableRow {...props} />
        </tbody>
      </table>,
    ).get("tr");
  }

  it("tints on hover by default and drops the tint for a non-interactive row", () => {
    expect(row({}).className).toContain(tableClasses.rowHover);
    expect(row({ hover: false }).className).not.toContain(tableClasses.rowHover);
  });

  it("merges a caller className", () => {
    expect(row({ className: "group" }).className).toContain("group");
  });
});

describe("TableHeaderCell", () => {
  it("is a column header and forwards native attributes", () => {
    const view = grid(<TableHeaderCell scope="col">Key</TableHeaderCell>);
    const header = view.get("th");

    expect(header.getAttribute("scope")).toBe("col");
    expect(header.hasAttribute("data-numeric")).toBe(false);
  });

  it("flags a numeric column header", () => {
    const view = grid(<TableHeaderCell numeric>Count</TableHeaderCell>);

    expect(view.get("th").hasAttribute("data-numeric")).toBe(true);
  });
});

describe("TableCell", () => {
  function cell(props: { mono?: boolean; numeric?: boolean; className?: string }) {
    return render(
      <table>
        <tbody>
          <tr>
            <TableCell {...props}>42</TableCell>
          </tr>
        </tbody>
      </table>,
    ).get("td");
  }

  it("is neither mono nor numeric by default", () => {
    const td = cell({});

    expect(td.hasAttribute("data-mono")).toBe(false);
    expect(td.hasAttribute("data-numeric")).toBe(false);
  });

  it("flags a code-shaped value as mono and a count as numeric", () => {
    expect(cell({ mono: true }).hasAttribute("data-mono")).toBe(true);
    expect(cell({ numeric: true }).hasAttribute("data-numeric")).toBe(true);
  });

  it("merges a caller className", () => {
    expect(cell({ className: "w-8" }).className).toContain("w-8");
  });
});

describe("TableCard", () => {
  it("is an unpadded card that scrolls a too-wide table sideways", () => {
    const view = render(<TableCard aria-label="Keys table">x</TableCard>);
    const card = view.get("[data-padding]");

    expect(card.dataset.padding).toBe("none");
    expect(card.getAttribute("aria-label")).toBe("Keys table");
    expect(card.className).toContain("overflow-x-auto");
  });

  it("becomes a focusable labelled region when it has a label, so a keyboard can scroll it", () => {
    const view = render(<TableCard aria-label="Keys table">x</TableCard>);
    const card = view.get("[data-padding]");

    expect(card.getAttribute("role")).toBe("region");
    expect(card.getAttribute("tabindex")).toBe("0");
    expect(card.className).toContain("vk-field");
  });

  it("adds no tab stop or region role without a label", () => {
    const view = render(<TableCard>x</TableCard>);
    const card = view.get("[data-padding]");

    expect(card.hasAttribute("role")).toBe(false);
    expect(card.hasAttribute("tabindex")).toBe(false);
  });
});
