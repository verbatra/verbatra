import { describe, expect, it } from "vitest";
import { configLoadFailure } from "./load-failure.js";

const SK_PROJ = ["sk", "proj", ""].join("-");

function namedError(name: string, message: string, extra: object = {}): Error {
  return Object.assign(new Error(message), { name, filepath: "/project/.verbatrarc" }, extra);
}

describe("configLoadFailure", () => {
  it("drops a JSON parser message in favor of a fixed description", () => {
    const failure = configLoadFailure(namedError("JSONError", 'Unexpected token "secret"'));

    expect(failure.code).toBe("CONFIG_INVALID");
    expect(failure.message).toBe(
      "Failed to load the verbatra configuration at /project/.verbatrarc: the file is not valid JSON.",
    );
  });

  it("gives a YAML failure's one-based position and nothing from its reason", () => {
    const failure = configLoadFailure(
      namedError("YAMLException", "code frame", { mark: { line: 2, column: 0 }, reason: "x" }),
    );

    expect(failure.message).toBe(
      "Failed to load the verbatra configuration at /project/.verbatrarc: the file is not valid YAML at line 3, column 1.",
    );
  });

  it("omits the position when a YAML failure carries no usable mark", () => {
    const failure = configLoadFailure(namedError("YAMLException", "frame", { mark: {} }));

    expect(failure.message).toMatch(/the file is not valid YAML\.$/);
  });

  it("reports a module syntax error without the token it quotes", () => {
    const failure = configLoadFailure(namedError("SyntaxError", "Unexpected identifier 'secret'"));

    expect(failure.message).toMatch(/: the file has a syntax error\.$/);
    expect(failure.message).not.toContain("secret");
  });

  it("keeps only the first line of any other loader failure, after the TypeScript loader prefix", () => {
    const failure = configLoadFailure(
      namedError(
        "Error",
        "TypeScriptLoader failed to compile TypeScript:\nfoo is not defined.\n> 1 | foo",
      ),
    );

    expect(failure.message).toBe(
      "Failed to load the verbatra configuration at /project/.verbatrarc: foo is not defined.",
    );
  });

  it("redacts a key shape in the remaining line", () => {
    const failure = configLoadFailure(
      new Error(`bad value ${SK_PROJ}abcdefghijklmnopqrstuvwxyz0123`),
    );

    expect(failure.message).toBe(
      "Failed to load the verbatra configuration: bad value [REDACTED].",
    );
  });

  it("describes a thrown non-object and an empty message", () => {
    expect(configLoadFailure("plain failure").message).toBe(
      "Failed to load the verbatra configuration: plain failure.",
    );
    expect(configLoadFailure(new Error("")).message).toBe(
      "Failed to load the verbatra configuration: unknown error.",
    );
    expect(configLoadFailure({ message: 42 }).message).toBe(
      "Failed to load the verbatra configuration: 42.",
    );
  });

  it("keeps a coded loader error as the cause, so its code and hint survive", () => {
    const loaderError = namedError("Error", "Cannot find module '@acme/config'", {
      code: "MODULE_NOT_FOUND",
    });

    expect(configLoadFailure(loaderError).cause).toBe(loaderError);
  });

  it("attaches no cause for an uncoded loader error, whose text may quote the file", () => {
    expect(configLoadFailure(namedError("JSONError", "secret")).cause).toBeUndefined();
    expect(configLoadFailure("plain failure").cause).toBeUndefined();
  });

  it.each([
    ["Cannot find module '@acme/config'", "MODULE_NOT_FOUND"],
    ["Cannot find package '@acme/config' imported from /p/c.ts", "MODULE_NOT_FOUND"],
    [
      'No "exports" main defined in /p/node_modules/@acme/config/package.json',
      "ERR_PACKAGE_PATH_NOT_EXPORTED",
    ],
    [
      "Package subpath './x' is not defined by \"exports\" in /p/node_modules/@acme/config/package.json",
      "ERR_PACKAGE_PATH_NOT_EXPORTED",
    ],
  ])("recovers the resolution code the TypeScript loader drops from %s", (reason, code) => {
    const failure = configLoadFailure(
      namedError(
        "TypeScriptCompileError",
        `TypeScriptLoader failed to compile TypeScript:\n${reason}`,
      ),
    );

    expect(failure.cause).toMatchObject({ code });
  });

  it("recovers no code from any other TypeScript loader failure", () => {
    const failure = configLoadFailure(
      namedError(
        "TypeScriptCompileError",
        "TypeScriptLoader failed to compile TypeScript:\nfoo is not defined",
      ),
    );

    expect(failure.cause).toBeUndefined();
  });
});
