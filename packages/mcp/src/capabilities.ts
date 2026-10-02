/** What this `@verbatra/mcp` supports, for a host such as the CLI to check before starting it. */
export interface McpCapabilities {
  /** Whether `startMcpServer` honors `redactValues`. */
  readonly valuesRedaction: boolean;
}

/**
 * The capabilities of this `@verbatra/mcp`. A host checks a capability here before it passes the
 * matching option to {@link startMcpServer}, so an older package that would ignore the option is
 * refused rather than started.
 */
export const MCP_CAPABILITIES: McpCapabilities = { valuesRedaction: true };
