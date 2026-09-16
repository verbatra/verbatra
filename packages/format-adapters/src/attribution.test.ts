import type { LocaleResource, PlaceholderIntegrityResult } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { FormatAdapter } from "./adapter.js";
import { attributeAdapterFailures } from "./attribution.js";
import { AdapterError } from "./errors.js";

const INTACT: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

const RESOURCE: LocaleResource = {
  locale: "de",
  namespace: "common",
  format: "custom:toml",
  entries: new Map(),
};

function errno(code: string): Error {
  return Object.assign(new Error(`${code}: boom`), { code });
}

function workingAdapter(): FormatAdapter {
  return {
    format: "custom:toml",
    canHandle: () => true,
    extractPlaceholders: () => ["{name}"],
    validateMessage: () => true,
    comparePlaceholders: () => INTACT,
    read: () => Promise.resolve({ resource: RESOURCE, invalidIcuKeys: [], excludedLeafPaths: [] }),
    write: () => Promise.resolve(),
  };
}

function throwingAdapter(overrides: Partial<FormatAdapter>): FormatAdapter {
  return { ...workingAdapter(), ...overrides };
}

async function failureFrom(run: () => Promise<unknown> | unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("attributeAdapterFailures passes working behaviour through untouched", () => {
  const adapter = attributeAdapterFailures(workingAdapter());

  it("keeps the format", () => {
    expect(adapter.format).toBe("custom:toml");
  });

  it("keeps canHandle's answer", () => {
    expect(adapter.canHandle("a.toml")).toBe(true);
  });

  it("keeps the extracted placeholders", () => {
    expect(adapter.extractPlaceholders("hi {name}")).toEqual(["{name}"]);
  });

  it("keeps validateMessage's answer", () => {
    expect(adapter.validateMessage("hi")).toBe(true);
  });

  it("keeps the read result", async () => {
    await expect(adapter.read("a.toml", "de")).resolves.toEqual({
      resource: RESOURCE,
      invalidIcuKeys: [],
      excludedLeafPaths: [],
    });
  });

  it("keeps the write", async () => {
    await expect(adapter.write(RESOURCE, "a.toml")).resolves.toBeUndefined();
  });

  it("keeps comparePlaceholders' verdict", () => {
    expect(adapter.comparePlaceholders?.("a", "b")).toEqual(INTACT);
  });

  it("leaves comparePlaceholders absent when the adapter defines none", () => {
    const { comparePlaceholders: _omitted, ...withoutCompare } = workingAdapter();

    expect("comparePlaceholders" in attributeAdapterFailures(withoutCompare)).toBe(false);
  });
});

describe("attributeAdapterFailures names the adapter on every contract method", () => {
  const cases: ReadonlyArray<
    readonly [string, Partial<FormatAdapter>, (adapter: FormatAdapter) => unknown]
  > = [
    [
      "canHandle",
      {
        canHandle: () => {
          throw new TypeError("boom");
        },
      },
      (adapter) => adapter.canHandle("a.toml"),
    ],
    [
      "read",
      { read: () => Promise.reject(new TypeError("boom")) },
      (adapter) => adapter.read("a.toml", "de"),
    ],
    [
      "write",
      { write: () => Promise.reject(new TypeError("boom")) },
      (adapter) => adapter.write(RESOURCE, "a.toml"),
    ],
    [
      "extractPlaceholders",
      {
        extractPlaceholders: () => {
          throw new TypeError("boom");
        },
      },
      (adapter) => adapter.extractPlaceholders("hi"),
    ],
    [
      "validateMessage",
      {
        validateMessage: () => {
          throw new TypeError("boom");
        },
      },
      (adapter) => adapter.validateMessage("hi"),
    ],
    [
      "comparePlaceholders",
      {
        comparePlaceholders: () => {
          throw new TypeError("boom");
        },
      },
      (adapter) => adapter.comparePlaceholders?.("a", "b"),
    ],
  ];

  it.each(cases)(
    "turns a throw from %s into a structured error",
    async (method, override, call) => {
      const adapter = attributeAdapterFailures(throwingAdapter(override));

      const failure = await failureFrom(() => call(adapter));

      expect(failure).toBeInstanceOf(AdapterError);
      expect((failure as AdapterError).code).toBe("ADAPTER_FAILED");
      expect((failure as AdapterError).message).toContain("custom:toml");
      expect((failure as AdapterError).message).toContain(method);
      expect((failure as AdapterError).message).toContain("boom");
    },
  );

  it("attributes a synchronous throw from an async member, not just a rejection", async () => {
    const adapter = attributeAdapterFailures(
      throwingAdapter({
        read: () => {
          throw new TypeError("boom");
        },
      }),
    );

    const failure = (await failureFrom(() => adapter.read("a.toml", "de"))) as AdapterError;

    expect(failure.code).toBe("ADAPTER_FAILED");
    expect(failure.message).toContain("custom:toml");
  });

  it("attributes a thrown null without tripping over it", async () => {
    const adapter = attributeAdapterFailures(throwingAdapter({ read: () => Promise.reject(null) }));

    const failure = (await failureFrom(() => adapter.read("a.toml", "de"))) as AdapterError;

    expect(failure.code).toBe("ADAPTER_FAILED");
    expect(failure.message).toContain("custom:toml");
  });

  it("describes a thrown non-error without losing the attribution", async () => {
    const adapter = attributeAdapterFailures(
      throwingAdapter({
        read: () => Promise.reject("bare string"),
      }),
    );

    const failure = (await failureFrom(() => adapter.read("a.toml", "de"))) as AdapterError;

    expect(failure.code).toBe("ADAPTER_FAILED");
    expect(failure.message).toContain("custom:toml");
  });
});

describe("attributeAdapterFailures covers the whole contract, not a hand-copied subset", () => {
  it("carries every member of the adapter it wrapped, so none is dropped", () => {
    const adapter = workingAdapter();

    const wrapped = attributeAdapterFailures(adapter);

    expect(Object.keys(wrapped).sort()).toEqual(Object.keys(adapter).sort());
  });

  it("guards every function member, so a seventh one cannot skip attribution", async () => {
    const adapter = workingAdapter();
    const methods = Object.keys(adapter).filter(
      (key) => typeof adapter[key as keyof FormatAdapter] === "function",
    );
    const boom = (): never => {
      throw new TypeError("boom");
    };
    const wrapped = attributeAdapterFailures(
      Object.fromEntries([
        ...Object.entries(adapter),
        ...methods.map((key) => [key, boom] as const),
      ]) as unknown as FormatAdapter,
    ) as unknown as Record<string, (...args: never[]) => unknown>;

    const codes = await Promise.all(
      methods.map(async (method) => {
        const failure = await failureFrom(() => wrapped[method]?.());
        return failure instanceof AdapterError ? failure.code : "UNGUARDED";
      }),
    );

    expect(methods.length).toBeGreaterThanOrEqual(6);
    expect(codes).toEqual(methods.map(() => "ADAPTER_FAILED"));
  });
});

describe("attributeAdapterFailures does not mistake a plugin bug for a filesystem failure", () => {
  const nodeMisuse: ReadonlyArray<readonly [string, Error]> = [
    [
      "ERR_INVALID_ARG_TYPE",
      Object.assign(new TypeError("boom"), { code: "ERR_INVALID_ARG_TYPE" }),
    ],
    ["ERR_OUT_OF_RANGE", Object.assign(new RangeError("boom"), { code: "ERR_OUT_OF_RANGE" })],
  ];

  it.each(nodeMisuse)("attributes a %s thrown from read", async (_code, thrown) => {
    const adapter = attributeAdapterFailures(
      throwingAdapter({ read: () => Promise.reject(thrown) }),
    );

    const failure = (await failureFrom(() => adapter.read("a.toml", "de"))) as AdapterError;

    expect(failure.code).toBe("ADAPTER_FAILED");
    expect(failure.message).toContain("custom:toml");
  });

  it("attributes a Node misuse error thrown from write, so no write remedy is invented", async () => {
    const thrown = Object.assign(new TypeError("boom"), { code: "ERR_INVALID_ARG_TYPE" });
    const adapter = attributeAdapterFailures(
      throwingAdapter({ write: () => Promise.reject(thrown) }),
    );

    const failure = (await failureFrom(() => adapter.write(RESOURCE, "a.toml"))) as AdapterError;

    expect(failure.code).toBe("ADAPTER_FAILED");
    expect(failure.message).toContain("custom:toml");
  });
});

describe("attributeAdapterFailures leaves errors that already carry meaning alone", () => {
  it("rethrows an AdapterError unchanged, so its own code survives", async () => {
    const original = new AdapterError("INVALID_STRUCTURE", "not a table");
    const adapter = attributeAdapterFailures(
      throwingAdapter({ read: () => Promise.reject(original) }),
    );

    await expect(adapter.read("a.toml", "de")).rejects.toBe(original);
  });

  it("rethrows a filesystem error unchanged, so a missing file is still a missing file", async () => {
    const original = errno("ENOENT");
    const adapter = attributeAdapterFailures(
      throwingAdapter({ read: () => Promise.reject(original) }),
    );

    await expect(adapter.read("a.toml", "de")).rejects.toBe(original);
  });

  it.each(["ENOENT", "EACCES", "EPERM", "EROFS", "ENOSPC", "EISDIR"])(
    "rethrows a %s write error unchanged, so its remedy still resolves",
    async (code) => {
      const original = errno(code);
      const adapter = attributeAdapterFailures(
        throwingAdapter({ write: () => Promise.reject(original) }),
      );

      await expect(adapter.write(RESOURCE, "a.toml")).rejects.toBe(original);
    },
  );
});

function guardCodesOver(
  wrap: (adapter: FormatAdapter) => FormatAdapter,
): Promise<readonly string[]> {
  const adapter = workingAdapter();
  const methods = Object.keys(adapter).filter(
    (key) => typeof adapter[key as keyof FormatAdapter] === "function",
  );
  const boom = (): never => {
    throw new TypeError("boom");
  };
  const wrapped = wrap(
    Object.fromEntries([
      ...Object.entries(adapter),
      ...methods.map((key) => [key, boom] as const),
    ]) as unknown as FormatAdapter,
  ) as unknown as Record<string, ((...args: never[]) => unknown) | undefined>;
  return Promise.all(
    methods.map(async (method) => {
      const failure = await failureFrom(() => wrapped[method]?.());
      return failure instanceof AdapterError ? failure.code : "UNGUARDED";
    }),
  );
}

describe("the containment pin is a real tripwire, not a self-satisfying check", () => {
  it("reports UNGUARDED when a method escapes the wrapper, so the derived check can fail", async () => {
    const leaky = (adapter: FormatAdapter): FormatAdapter => ({
      ...attributeAdapterFailures(adapter),
      validateMessage: adapter.validateMessage.bind(adapter),
    });

    await expect(guardCodesOver(leaky)).resolves.toContain("UNGUARDED");
  });

  it("reports ADAPTER_FAILED for every method of the real wrapper", async () => {
    await expect(guardCodesOver(attributeAdapterFailures)).resolves.not.toContain("UNGUARDED");
  });

  it("drops a seventh member the wrapper does not know about, so the key pin trips", () => {
    const seventh = Object.assign(workingAdapter(), {
      describeFile: (): string => "x",
    }) as unknown as FormatAdapter;

    const wrapped = attributeAdapterFailures(seventh);

    expect(Object.keys(wrapped)).not.toContain("describeFile");
    expect(Object.keys(wrapped).sort()).not.toEqual(Object.keys(seventh).sort());
  });

  it("pins the wrapped surface to exactly the six contract methods plus the format", () => {
    expect(Object.keys(attributeAdapterFailures(workingAdapter())).sort()).toEqual([
      "canHandle",
      "comparePlaceholders",
      "extractPlaceholders",
      "format",
      "read",
      "validateMessage",
      "write",
    ]);
  });
});

describe("attributeAdapterFailures and the shape of what a plugin throws", () => {
  const thrown: ReadonlyArray<readonly [string, unknown]> = [
    ["a plain Error with no code", new Error("plain boom")],
    ["an Error with an empty message", new Error("")],
    ["an Error whose code is not a string", Object.assign(new Error("boom"), { code: 42 })],
    ["an Error with a lowercase code", Object.assign(new Error("boom"), { code: "enoent" })],
    ["an underscored Node code", Object.assign(new Error("boom"), { code: "ERR_UNKNOWN" })],
    ["a code with an underscore after the E", Object.assign(new Error("boom"), { code: "E_BAD" })],
    ["undefined", undefined],
    ["a number", 7],
    ["a plain object", { message: "boom" }],
  ];

  it.each(thrown)("attributes %s to the plugin", async (_label, value) => {
    const adapter = attributeAdapterFailures(
      throwingAdapter({ read: () => Promise.reject(value) }),
    );

    const failure = (await failureFrom(() => adapter.read("a.toml", "de"))) as AdapterError;

    expect(failure).toBeInstanceOf(AdapterError);
    expect(failure.code).toBe("ADAPTER_FAILED");
    expect(failure.message).toContain("custom:toml");
    expect(failure.message).toContain("read");
  });

  it("describes an Error with an empty message by its string form, not as an empty detail", async () => {
    const adapter = attributeAdapterFailures(
      throwingAdapter({ read: () => Promise.reject(new Error("")) }),
    );

    const failure = (await failureFrom(() => adapter.read("a.toml", "de"))) as AdapterError;

    expect(failure.message).toContain("Error");
  });
});

describe("the errno heuristic is shape-based, so a plugin can mint a code that escapes it", () => {
  const minted = ["EPARSE", "ETOML", "E1", "EVERYTHING"] as const;

  it.each(minted)("passes a plugin-minted %s through unattributed", async (code) => {
    const original = errno(code);
    const adapter = attributeAdapterFailures(
      throwingAdapter({ read: () => Promise.reject(original) }),
    );

    await expect(adapter.read("a.toml", "de")).rejects.toBe(original);
  });

  it("does not let a minted code through once it stops looking like an errno", async () => {
    const adapter = attributeAdapterFailures(
      throwingAdapter({ read: () => Promise.reject(errno("Eparse")) }),
    );

    const failure = (await failureFrom(() => adapter.read("a.toml", "de"))) as AdapterError;

    expect(failure.code).toBe("ADAPTER_FAILED");
  });
});
