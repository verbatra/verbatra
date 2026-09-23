// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const { ContactForm } = await import("./contact-form");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ContactForm privacyNotice={<a href="/privacy#contact-form">privacy notice</a>} />);
  });
  mounted = { container, root };
  return container;
}

function field(container: HTMLDivElement, name: string): HTMLInputElement | HTMLTextAreaElement {
  const element = container.querySelector(`[name="${name}"]`);
  if (!element) throw new Error(`no field named ${name} rendered`);
  return element as HTMLInputElement | HTMLTextAreaElement;
}

function fillValidFields(container: HTMLDivElement): void {
  field(container, "name").value = "Ada Lovelace";
  field(container, "email").value = "ada@example.com";
  field(container, "message").value = "Hello, I would like to know more about verbatra.";
}

async function submit(container: HTMLDivElement): Promise<void> {
  const button = container.querySelector('button[type="submit"]');
  if (!button) throw new Error("no submit button rendered");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

function statusText(container: HTMLDivElement): string {
  return container.querySelector('[role="status"]')?.textContent ?? "";
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (!mounted) return;
  const { container, root } = mounted;
  mounted = undefined;
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("ContactForm", () => {
  it("shows the privacy notice it is given directly below the submit button", () => {
    const container = render();
    const notice = container.querySelector('button[type="submit"]')?.nextElementSibling;

    expect(notice?.tagName).toBe("P");
    expect(notice?.querySelector('a[href="/privacy#contact-form"]')?.textContent).toBe(
      "privacy notice",
    );
  });

  it("renders a labeled field for name, email, and message", () => {
    const container = render();
    expect(field(container, "name").tagName).toBe("INPUT");
    expect(field(container, "email").tagName).toBe("INPUT");
    expect(field(container, "message").tagName).toBe("TEXTAREA");
    expect(container.querySelectorAll("label")).toHaveLength(3);
  });

  it("includes a hidden honeypot field that is not part of the visible labels", () => {
    const container = render();
    const honeypot = container.querySelector('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("shows a loading state while the request is in flight", async () => {
    const container = render();
    fillValidFields(container);
    let resolveFetch: (() => void) | undefined;
    vi.mocked(globalThis.fetch).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = () =>
          resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
      }),
    );

    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(button.disabled).toBe(true);

    await act(async () => {
      resolveFetch?.();
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("shows a success confirmation and resets the form on a valid submission", async () => {
    const container = render();
    fillValidFields(container);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );

    await submit(container);

    expect(statusText(container)).toContain("successTitle");
    expect(statusText(container)).toContain("successBody");
    expect(field(container, "name").value).toBe("");
  });

  it("shows field-level errors and a validation summary for an invalid submission", async () => {
    const container = render();
    fillValidFields(container);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "invalid",
          errors: { name: "required", email: "invalid_email", message: "too_short" },
        }),
        { status: 400 },
      ),
    );

    await submit(container);

    expect(field(container, "name").getAttribute("aria-invalid")).toBe("true");
    expect(field(container, "email").getAttribute("aria-invalid")).toBe("true");
    expect(field(container, "message").getAttribute("aria-invalid")).toBe("true");
    expect(statusText(container)).toContain("validationErrorBody");
  });

  it("shows a rate-limited message distinct from the generic error message", async () => {
    const container = render();
    fillValidFields(container);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: "rate_limited" }), { status: 429 }),
    );

    await submit(container);

    expect(statusText(container)).toContain("rateLimitedBody");
    expect(statusText(container)).not.toContain("errorTitle");
  });

  it("shows a generic error state when the request fails unexpectedly", async () => {
    const container = render();
    fillValidFields(container);
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("network down"));

    await submit(container);

    expect(statusText(container)).toContain("errorTitle");
    expect(statusText(container)).toContain("errorBody");
  });

  it("shows a generic error state when the server returns a non-rate-limit failure status", async () => {
    const container = render();
    fillValidFields(container);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: "error" }), { status: 500 }),
    );

    await submit(container);

    expect(statusText(container)).toContain("errorTitle");
    expect(statusText(container)).toContain("errorBody");
  });
});
