import { AGENT_SKILLS_INSTALL_COMMAND } from "./install-commands";

export const AI_SETUP_PROMPT = [
  `1. Run: ${AGENT_SKILLS_INSTALL_COMMAND}`,
  "2. Set up verbatra per https://verbatra.kreitz-webdev.de/docs/start-with-ai.md (if it fails: npx @verbatra/cli init --help). Spend nothing until I confirm. Never write or ask for an API key.",
].join("\n");
