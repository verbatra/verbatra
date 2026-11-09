import type { ReactNode } from "react";
import { ValueReplaceDialog } from "./ValueReplaceDialog.js";
import { closeValueReplace, useValueReplaceLocales } from "./value-replace-session.js";

export function ValueReplaceHost(): ReactNode {
  const locales = useValueReplaceLocales();
  return locales === null ? null : (
    <ValueReplaceDialog locales={locales} onClose={closeValueReplace} />
  );
}
