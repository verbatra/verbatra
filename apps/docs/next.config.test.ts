import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import nextConfig from "./next.config.mjs";

describe("next.config", () => {
  it("keeps English URLs unprefixed, so /docs and /contact share the shape of /de", () => {
    expect(i18n.hideLocale).toBe("default-locale");
  });

  it("turns off optimistic routing, which would predict /docs as the [lang] home route after a switch from /de and prefetch segments that 404", () => {
    expect(nextConfig.experimental?.optimisticRouting).toBe(false);
  });
});
