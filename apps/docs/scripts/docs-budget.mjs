import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { englishDocsPages } from "../lib/docs-pages.ts";
import { formatBudgetReport, pageBudget } from "../lib/page-type.ts";

const contentDir = resolve(dirname(fileURLToPath(import.meta.url)), "../content/docs");

const budgets = englishDocsPages(contentDir).flatMap(({ file, source }) => {
  const budget = pageBudget(file, source);
  return budget === undefined ? [] : [budget];
});

console.log(formatBudgetReport(budgets));
