import type { ReactNode } from "react";
import {
  HERO_HEADLINE_KEY,
  HERO_HEADLINE_LOCK_HASH,
  LEDGER_LOCK_FILE,
  ledgerRows,
} from "@/lib/hero-ledger";
import type { Locale } from "@/lib/i18n";

const MESSAGE_KEY = HERO_HEADLINE_KEY.split(".").at(-1) ?? HERO_HEADLINE_KEY;

export function LocaleLedger({
  locale,
  caption,
}: {
  locale: Locale;
  caption: ReactNode;
}): ReactNode {
  return (
    <figure className="vk-ledger">
      <div className="vk-ledger-frame">
        <p className="vk-ledger-title">{HERO_HEADLINE_KEY}</p>
        <ol
          // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
          role="list"
          className="vk-ledger-rows"
        >
          {ledgerRows(locale).map((row) => (
            <li
              key={row.locale}
              className="vk-ledger-row"
              data-source={row.source ? "" : undefined}
            >
              <span className="vk-ledger-file">{row.file}</span>
              <code className="vk-ledger-entry">
                <span className="vk-ledger-key">"{MESSAGE_KEY}":</span>{" "}
                <span lang={row.locale} className="vk-ledger-value">
                  "{row.value}"
                </span>
              </code>
            </li>
          ))}
        </ol>
        <p className="vk-ledger-lock">
          <span className="vk-ledger-file">{LEDGER_LOCK_FILE}</span>
          <code className="vk-ledger-entry">
            <span className="vk-ledger-key">"{HERO_HEADLINE_KEY}":</span>{" "}
            <span className="vk-ledger-hash">"{HERO_HEADLINE_LOCK_HASH}"</span>
          </code>
        </p>
      </div>
      <figcaption className="vk-ledger-caption">{caption}</figcaption>
    </figure>
  );
}
