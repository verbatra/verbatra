import type { NetworkRuleSource } from "@verbatra/ai-providers";
import { describe, expect, expectTypeOf, it } from "vitest";
import { PROVIDER_IDS, type ProviderId } from "../config/provider-config.js";
import { type DataFlowField, PROVIDER_DATA_FLOW } from "../config/provider-data-flow.js";
import {
  DATA_FLOW_FIELDS,
  MANIFEST_PROVIDER_IDS,
  type NETWORK_RULE_SOURCES,
} from "./data-flow-manifest.js";

describe("the schema enums match the types they validate, both ways", () => {
  it("lists exactly every provider id", () => {
    expectTypeOf<(typeof MANIFEST_PROVIDER_IDS)[number]>().toEqualTypeOf<ProviderId>();
    expect([...MANIFEST_PROVIDER_IDS].sort()).toEqual([...PROVIDER_IDS, "none"].sort());
  });

  it("lists exactly every data-flow field", () => {
    expectTypeOf<(typeof DATA_FLOW_FIELDS)[number]>().toEqualTypeOf<DataFlowField>();
    const declared = new Set(Object.values(PROVIDER_DATA_FLOW).flatMap((flow) => flow.fields));
    expect([...declared].filter((field) => !DATA_FLOW_FIELDS.includes(field))).toEqual([]);
  });

  it("lists exactly every network rule source", () => {
    expectTypeOf<(typeof NETWORK_RULE_SOURCES)[number]>().toEqualTypeOf<NetworkRuleSource>();
  });
});
