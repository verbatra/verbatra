import type { ReactNode } from "react";

export function FormatPaneFrame({
  id,
  file,
  busy = false,
  children,
}: {
  id: string;
  file: string;
  busy?: boolean;
  children?: ReactNode;
}): ReactNode {
  const captionId = `formats-file-${id}`;
  return (
    <figure className="vk-formats-file">
      <figcaption id={captionId} className="vk-formats-file-name">
        {file}
      </figcaption>
      <section
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a capped pane scrolls, so the keyboard needs a stop to scroll it
        tabIndex={0}
        aria-labelledby={captionId}
        aria-busy={busy || undefined}
        className="vk-formats-code vk-terminal-scroll"
      >
        {children}
      </section>
    </figure>
  );
}
