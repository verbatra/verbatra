export const AI_SETUP_PROMPT =
  "Follow https://verbatra.kreitz-webdev.de/docs/start-with-ai.md to set up verbatra here. Spend nothing until I confirm. Never write or ask for an API key. If the link fails, stop.";

export const AI_SETUP_PROMPT_COMPONENT = "AiSetupPrompt";

export const AI_SETUP_PROMPT_MARKDOWN = `\`\`\`text\n${AI_SETUP_PROMPT}\n\`\`\``;

type MdxNode = {
  type: string;
  name?: string | null;
  children?: MdxNode[];
  data?: Record<string, unknown>;
};

function stringifyPromptAsFence(node: MdxNode): void {
  if (node.type === "mdxJsxFlowElement" && node.name === AI_SETUP_PROMPT_COMPONENT) {
    node.data = { ...node.data, _stringify: { text: AI_SETUP_PROMPT_MARKDOWN } };
  }
  for (const child of node.children ?? []) stringifyPromptAsFence(child);
}

export function remarkAiSetupPromptMarkdown() {
  return (root: MdxNode) => stringifyPromptAsFence(root);
}
