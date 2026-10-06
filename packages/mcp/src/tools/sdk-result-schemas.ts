import { checkSummarySchema, provenanceReportResultSchema, runSummarySchema } from "@verbatra/sdk";

const [availableReportSchema] = provenanceReportResultSchema.options;

const reportEntrySchema = availableReportSchema.shape.locales
  .unwrap()
  .element.shape.entries.unwrap().element;

export const keyProvenanceSchema = reportEntrySchema.omit({ key: true, bucket: true });

export const keyOriginSchema = reportEntrySchema.shape.origin;

export const provenanceSummarySchema = checkSummarySchema.shape.locales
  .unwrap()
  .element.shape.provenance.unwrap();

export const localeSummarySchema = runSummarySchema.shape.locales.unwrap().element;
