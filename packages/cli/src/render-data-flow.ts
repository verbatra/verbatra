import type {
  DataFlowCounts,
  DataFlowDestination,
  DataFlowLocalFile,
  DataFlowManifest,
  DataFlowNetwork,
  DataFlowOtherRequest,
} from "@verbatra/sdk";

const LABEL_WIDTH = 13;

function row(label: string, value: string): string {
  return `    ${label.padEnd(LABEL_WIDTH)}${value}`;
}

function describeNetwork(network: DataFlowNetwork): string {
  if (network.status === "invalid") {
    return `invalid: ${network.error}`;
  }
  const rules = network.rules.map(
    (rule) =>
      `${rule.source} ${rule.policy}${rule.allowedHosts.length === 0 ? "" : ` (${rule.allowedHosts.join(", ")})`}`,
  );
  return rules.length === 0 ? "any host (no policy set)" : rules.join("; ");
}

function describeDestination(destination: DataFlowDestination): string {
  const origin = destination.setBy === undefined ? destination.source : destination.setBy;
  const when = destination.when === undefined ? "" : `  ${destination.when}`;
  const reason = destination.reason === undefined ? "" : `: ${destination.reason}`;
  const via = destination.proxies.map((proxy) => `  via ${proxy.variable} ${proxy.host}`).join("");
  return `${destination.host}  ${origin}${when}  ${destination.policyCheck}  ${destination.verdict}${reason}${via}`;
}

function describeCounts(counts: DataFlowCounts): string {
  const withheld =
    counts.keysWithheld === undefined
      ? ""
      : `, ${counts.keysWithheld} with placeholders it cannot mask (withheld)`;
  return `${counts.sourceKeys} source keys, ${counts.keysWithContext} with a description or meaning${withheld}`;
}

function describeLocal(file: DataFlowLocalFile): string {
  const holds = [
    ...(file.holdsSourceText ? ["source text"] : []),
    ...(file.holdsTranslations ? ["translations"] : []),
    ...(file.holdsPersonalData ? ["reviewer names"] : []),
  ];
  const contents =
    holds.length === 0 ? "no source text, translations or personal data" : holds.join(", ");
  const ignored = file.gitignoredByInit ? ", gitignored by init" : "";
  return `${file.id}  ${file.path}  (${contents}${ignored})`;
}

function describeRequest(request: DataFlowOtherRequest): string {
  return `${request.id}  ${request.trigger}${request.sendsApiKey ? "  sends the API key" : ""}`;
}

function sentRows(manifest: DataFlowManifest): readonly string[] {
  const { sent } = manifest;
  if (sent.nothing) {
    return [row("sent", 'nothing (provider "none")')];
  }
  return [
    row("sent", sent.fields.join(", ")),
    row("api key", sent.apiKey),
    row("placeholders", sent.placeholders),
  ];
}

export function renderDataFlowLines(manifest: DataFlowManifest | undefined): readonly string[] {
  if (manifest === undefined) {
    return [];
  }
  const { provider, sent } = manifest;
  const model = provider.model === undefined ? "" : `, model ${provider.model}`;
  return [
    `  data flow (manifest version ${manifest.version})`,
    row("provider", `${provider.id} (${provider.kind}${model})`),
    row("network", describeNetwork(manifest.network)),
    ...manifest.destinations.map((destination) =>
      row("destination", describeDestination(destination)),
    ),
    ...sentRows(manifest),
    row("sensitive", sent.sensitiveData),
    row(
      "counts",
      sent.counts === undefined
        ? `unavailable: ${sent.countsUnavailable ?? "the source was not read"}`
        : describeCounts(sent.counts),
    ),
    ...manifest.locales.map((locale) =>
      row(
        "locale",
        `${locale.locale}  sent as ${locale.codeSent}${locale.mapped ? " (localeMap)" : ""}  glossary terms: ${locale.glossaryTermsSent}`,
      ),
    ),
    ...manifest.local.map((file) => row("local", describeLocal(file))),
    ...manifest.otherRequests.map((request) => row("request", describeRequest(request))),
    ...manifest.agents.map((agent) =>
      row("agent", `${agent.id}  ${agent.trigger}${agent.redactable ? "  redactable" : ""}`),
    ),
  ];
}
