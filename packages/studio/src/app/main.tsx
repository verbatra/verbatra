import "./zod-jitless.js";
import { createRoot } from "react-dom/client";
import { rpcParamsSchemas } from "../shared/rpc/contract.js";
import { type ModelContext, registerAgentTools } from "../webmcp/register-tools.js";
import {
  reportAgentToolsRegistration,
  reportAgentToolsStartupFailure,
} from "../webmcp/registration-report.js";
import { App } from "./App.js";
import { agentToolsAbortController, agentToolsStatusStore, rpcClient } from "./api.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { initTheme } from "./lib/theme-dom.js";
import "./styles.css";

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
}

initTheme();

const container = document.getElementById("root");
if (container !== null) {
  createRoot(container).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}

registerAgentTools({
  modelContext: document.modelContext,
  rpcClient,
  schemas: rpcParamsSchemas,
  signal: agentToolsAbortController.signal,
})
  .then((registration) => {
    reportAgentToolsRegistration(registration);
    agentToolsStatusStore.publish(registration.failures);
  })
  .catch(reportAgentToolsStartupFailure);
