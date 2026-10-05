import type { ReactNode } from "react";
import { Section } from "./ui.js";

export function KeyDescription({
  description,
}: {
  readonly description: string | undefined;
}): ReactNode {
  if (description === undefined) {
    return null;
  }
  return (
    <Section title="Context">
      <p
        className="m-0 whitespace-pre-wrap break-words text-sm text-muted-foreground"
        data-key-description=""
      >
        {description}
      </p>
    </Section>
  );
}
