import type { ReactNode } from "react";

export function LegalPage({ children }: { children: ReactNode }): ReactNode {
  return <article className="vk-legal-page prose">{children}</article>;
}

export function LegalPageHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
}): ReactNode {
  return (
    <header className="vk-page-head not-prose">
      <p className="vk-page-eyebrow vk-label">{eyebrow}</p>
      <div className="vk-page-head-row">
        <h1>{title}</h1>
      </div>
      {lead === undefined ? null : <p className="vk-page-lead">{lead}</p>}
    </header>
  );
}
