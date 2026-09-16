import { type BudgetBehavior, budgetStanding, type RunBudget } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { toUsageTickerDisplayState } from "./usage-ticker-data.js";

const MAX_TOKENS = 1_000;
const behaviors: readonly BudgetBehavior[] = ["warn", "stop"];
const tokensUsedCases = [
  { position: "below", tokensUsed: MAX_TOKENS - 1 },
  { position: "equal to", tokensUsed: MAX_TOKENS },
  { position: "above", tokensUsed: MAX_TOKENS + 1 },
] as const;
const booleans = [true, false] as const;

const rows = behaviors.flatMap((behavior) =>
  tokensUsedCases.flatMap(({ position, tokensUsed }) =>
    booleans.flatMap((exceeded) =>
      booleans.map((supported) => ({
        name: `${behavior}, tokensUsed ${position} maxTokens, exceeded ${exceeded}, supported ${supported}`,
        budget: { maxTokens: MAX_TOKENS, behavior, tokensUsed, exceeded, supported },
      })),
    ),
  ),
);

function clientStanding(budget: RunBudget): string {
  const state = toUsageTickerDisplayState({
    available: true,
    generatedAt: "2026-09-16T00:00:00.000Z",
    budget,
  });
  if (state.kind !== "available" || state.budget.kind !== "tracked") {
    throw new Error("expected a tracked budget display");
  }
  return state.budget.standing;
}

describe("client budget standing parity with the sdk classification", () => {
  it("covers every behavior, ceiling position, exceeded, and supported combination", () => {
    expect(rows).toHaveLength(24);
  });

  it.each(rows)("$name", ({ budget }) => {
    expect(clientStanding(budget)).toBe(budgetStanding(budget));
  });
});
