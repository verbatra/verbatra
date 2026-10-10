import { describe, expect, it } from "vitest";
import type { HistoryCommit } from "../shared/rpc/history.js";
import { commitSummaryParts, renderText, type TextTarget } from "./render-text.js";

function commit(overrides: Partial<HistoryCommit> = {}): HistoryCommit {
  return {
    hash: "abcdef1234567890",
    author: "Ada Lovelace",
    authorDate: "2026-01-01T00:00:00+00:00",
    subject: "add greeting key",
    touchedPaths: ["locales/de.json"],
    ...overrides,
  };
}

describe("commitSummaryParts", () => {
  it("shortens the hash to its first 7 characters", () => {
    expect(commitSummaryParts(commit({ hash: "0123456789abcdef" })).shortHash).toBe("0123456");
  });

  it("derives the calendar-date label from the ISO author date and keeps the full date", () => {
    const parts = commitSummaryParts(commit());
    expect(parts.dateLabel).toBe("2026-01-01");
    expect(parts.authorDate).toBe("2026-01-01T00:00:00+00:00");
  });

  it("passes the author name through unmodified", () => {
    expect(commitSummaryParts(commit({ author: "<b>Ada</b>" })).author).toBe("<b>Ada</b>");
  });

  it("passes the subject through unmodified, never interpreted", () => {
    const parts = commitSummaryParts(commit({ subject: '<script>alert("xss")</script>' }));
    expect(parts.subject).toBe('<script>alert("xss")</script>');
  });
});

describe("renderText", () => {
  it("writes the text into target.textContent", () => {
    const target: TextTarget = { textContent: null };

    renderText(target, "add greeting key");

    expect(target.textContent).toBe("add greeting key");
  });

  it("renders HTML-injection-shaped text as literal text, never markup", () => {
    const target: TextTarget = { textContent: null };

    renderText(target, '<script>alert("xss")</script>');

    expect(target.textContent).toBe('<script>alert("xss")</script>');
  });

  it("never assigns anything other than a plain string to textContent", () => {
    const target: TextTarget = { textContent: null };

    renderText(target, "plain");

    expect(typeof target.textContent).toBe("string");
  });
});
