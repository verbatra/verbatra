import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { localizedPath, toLocale } from "@/lib/i18n";
import { withInlineCode } from "@/lib/inline-code-text";
import {
  FLOW_BODY_VALUES,
  FLOW_DEMO_NODE,
  FLOW_NODES,
  type FlowNode,
  type FlowNodeId,
  type FlowSnippet,
} from "@/lib/landing-flow";
import { showcaseRows, showcaseSeed } from "@/lib/showcase-scenarios";
import { CodeFrame } from "./code-frame";
import { FlowMotion, FlowTabs, TryIt } from "./islands";
import { PlainList } from "./plain-list";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export const FLOW_HEADING_ID = "flow-heading";

export function flowTitleId(id: FlowNodeId): string {
  return `flow-${id}`;
}

function snippetFrame(snippet: FlowSnippet, copy: string): Promise<ReactNode> {
  return CodeFrame({
    code: snippet.code,
    lang: snippet.language,
    filename: snippet.filename,
    copy: { label: copy },
  });
}

async function nodeSnippet(node: FlowNode, copy: string): Promise<ReactNode> {
  const snippets = [node.snippet, ...(node.alternatives ?? [])];
  const panels = await Promise.all(snippets.map((snippet) => snippetFrame(snippet, copy)));
  if (panels.length === 1) return panels[0];
  return (
    <FlowTabs
      idPrefix={`${flowTitleId(node.id)}-snippet`}
      labelledBy={flowTitleId(node.id)}
      tabs={snippets.map((snippet, index) => ({
        id: String(index),
        label: snippet.tab ?? snippet.filename ?? "",
      }))}
      panels={panels}
    />
  );
}

export async function Flow(): Promise<ReactNode> {
  const t = await getTranslations("landing.flow");
  const locale = toLocale(await getLocale());
  const frames = await Promise.all(FLOW_NODES.map((node) => nodeSnippet(node, t("copy"))));

  return (
    <Section band id="flow" labelledBy={FLOW_HEADING_ID} className="vk-flow-section">
      <div className="vk-flow-head">
        <SectionHead id={FLOW_HEADING_ID} layout="stacked" title={t("heading")} lead={t("lead")} />
      </div>
      <FlowMotion>
        <div className="vk-flow-rail" aria-hidden="true">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 2 100" preserveAspectRatio="none">
            <path className="vk-flow-track" d="M1 0V100" />
            <path className="vk-flow-path" d="M1 0V100" />
          </svg>
        </div>
        <PlainList ordered className="vk-flow-list">
          {FLOW_NODES.map((node, index) => (
            <li key={node.id} className="vk-flow-node" data-flow-node={node.id}>
              <span className="vk-flow-mark" aria-hidden="true">
                {index + 1}
              </span>
              <div className="vk-flow-text">
                <h3 id={flowTitleId(node.id)} className="vk-h4 vk-flow-title">
                  {t(`items.${node.id}.title`)}
                </h3>
                <p className="vk-flow-body">
                  {withInlineCode(t(`items.${node.id}.body`, FLOW_BODY_VALUES[node.id]))}
                </p>
                <p className="vk-flow-link">
                  <IntentPrefetchLink
                    href={localizedPath(locale, node.docsPath)}
                    className="vk-prose-link inline-flex min-h-6 items-center"
                  >
                    {t(`items.${node.id}.link`)}
                  </IntentPrefetchLink>
                </p>
              </div>
              <div className="vk-flow-snippet">{frames[index]}</div>
              {node.id === FLOW_DEMO_NODE ? (
                <div className="vk-flow-demo">
                  <p className="vk-flow-demo-lead">{t(`items.${FLOW_DEMO_NODE}.demo`)}</p>
                  <div data-reveal="2" className="vk-showcase not-prose">
                    <TryIt seed={showcaseSeed()} rows={showcaseRows()} />
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </PlainList>
      </FlowMotion>
    </Section>
  );
}
