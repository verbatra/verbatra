import type { ReactNode } from "react";
import { PanelCaption } from "@/components/ui/panel-caption";
import { cn } from "@/lib/utils";

type CodeFrameShellProps = {
  lang: string;
  filename?: string | undefined;
  action?: ReactNode;
  className?: string | undefined;
  children: ReactNode;
};

const BODY_CLASS =
  "vk-code-frame-body vk-mono-sm min-w-0 flex-1 leading-6 [&_pre]:py-3 [&_pre]:outline-none";

export function CodeFrameShell({
  lang,
  filename,
  action,
  className,
  children,
}: CodeFrameShellProps): ReactNode {
  return (
    <figure
      data-code-lang={lang}
      className={cn(
        "vk-code-frame m-0 min-w-0 overflow-hidden rounded-xl border border-(--border-default) bg-(--v-void)",
        className,
      )}
    >
      {filename ? (
        <PanelCaption density="control">
          <figcaption className="min-w-0 truncate font-mono text-xs text-(--text-muted)">
            {filename}
          </figcaption>
          {action}
        </PanelCaption>
      ) : null}
      <div className="flex items-start">
        <div className={BODY_CLASS}>{children}</div>
        {!filename && action ? <div className="shrink-0 py-2 pe-2">{action}</div> : null}
      </div>
    </figure>
  );
}
