import { type FocusEvent, type MouseEvent, type TouchEvent, useState } from "react";

type IntentHandlers<E extends Element> = {
  onMouseEnter?: ((event: MouseEvent<E>) => void) | undefined;
  onFocus?: ((event: FocusEvent<E>) => void) | undefined;
  onTouchStart?: ((event: TouchEvent<E>) => void) | undefined;
};

type IntentPrefetch<T, E extends Element> = Required<IntentHandlers<E>> & {
  prefetch: T | false;
};

export function useIntentPrefetch<T, E extends Element>(
  prefetch: T,
  { onMouseEnter, onFocus, onTouchStart }: IntentHandlers<E> = {},
): IntentPrefetch<T, E> {
  const [intended, setIntended] = useState(false);
  const markIntent = () => setIntended(true);
  return {
    prefetch: intended ? prefetch : false,
    onMouseEnter: (event) => {
      markIntent();
      onMouseEnter?.(event);
    },
    onFocus: (event) => {
      markIntent();
      onFocus?.(event);
    },
    onTouchStart: (event) => {
      markIntent();
      onTouchStart?.(event);
    },
  };
}
