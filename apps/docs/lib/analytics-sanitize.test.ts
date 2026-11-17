// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { sanitizeTrackerPayload } from "./analytics-sanitize";

const ORIGIN = "https://verbatra.kreitz-webdev.de";

describe("sanitizeTrackerPayload", () => {
  it("drops the screen size", () => {
    const payload = sanitizeTrackerPayload("event", {
      website: "id",
      screen: "1920x1080",
      language: "en-US",
      title: "Docs",
      hostname: "verbatra.kreitz-webdev.de",
      url: "/docs",
    });
    expect(payload).not.toHaveProperty("screen");
    expect(payload).toMatchObject({ language: "en-US", title: "Docs", website: "id" });
  });

  it.each([
    ["a relative path", "/docs?q=secret#intro", "/docs"],
    [
      "an absolute url",
      `${ORIGIN}/de/docs?q=1&utm_source=hn&gclid=abc#x`,
      "/de/docs?utm_source=hn",
    ],
    [
      "the five utm parameters in fixed order",
      "/?utm_content=d&utm_term=c&utm_campaign=b&utm_medium=a&utm_source=s",
      "/?utm_source=s&utm_medium=a&utm_campaign=b&utm_term=c&utm_content=d",
    ],
    ["a hash only", "/docs#install", "/docs"],
  ])("reduces the url of %s to the path and utm parameters", (_name, url, expected) => {
    expect(sanitizeTrackerPayload("event", { url }, ORIGIN)).toMatchObject({ url: expected });
  });

  it("caps a utm value at 255 characters", () => {
    const { url } = sanitizeTrackerPayload(
      "event",
      { url: `/?utm_source=${"x".repeat(400)}` },
      ORIGIN,
    );
    expect(String(url)).toBe(`/?utm_source=${"x".repeat(255)}`);
  });

  it.each([
    ["a query", "https://news.example/item?id=1&token=secret", "https://news.example/item"],
    ["a hash", "https://news.example/item#frag", "https://news.example/item"],
    ["nothing to strip", "https://news.example/", "https://news.example/"],
  ])("strips %s from the referrer", (_name, referrer, expected) => {
    expect(sanitizeTrackerPayload("event", { referrer }, ORIGIN)).toMatchObject({
      referrer: expected,
    });
  });

  it.each([[""], ["not a url"]])("empties the unusable referrer %j", (referrer) => {
    expect(sanitizeTrackerPayload("event", { referrer }, ORIGIN)).toMatchObject({ referrer: "" });
  });

  it("keeps the event name and data of a custom event untouched", () => {
    const payload = sanitizeTrackerPayload(
      "event",
      { name: "copy_code", data: { surface: "code-block" }, url: "/docs?x=1", screen: "1x1" },
      ORIGIN,
    );
    expect(payload).toEqual({ name: "copy_code", data: { surface: "code-block" }, url: "/docs" });
  });

  it("leaves a payload without url or referrer alone and does not mutate its input", () => {
    const input = { screen: "1x1", website: "id" };
    expect(sanitizeTrackerPayload("event", input, ORIGIN)).toEqual({ website: "id" });
    expect(input).toEqual({ screen: "1x1", website: "id" });
  });

  it("ignores a url that is not a string and an unparsable one", () => {
    expect(sanitizeTrackerPayload("event", { url: 5 }, ORIGIN)).toEqual({ url: 5 });
    expect(sanitizeTrackerPayload("event", { url: "http://[bad" }, ORIGIN)).toMatchObject({
      url: "/",
    });
  });
});
