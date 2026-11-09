import { Button } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useState } from "react";

const PAGE_SIZE = 50;

export function ReplacePagedList<T>({
  items,
  itemKey,
  render,
  listAttribute,
}: {
  readonly items: readonly T[];
  readonly itemKey: (item: T) => string;
  readonly render: (item: T) => ReactNode;
  readonly listAttribute: `data-${string}`;
}): ReactNode {
  const [shown, setShown] = useState(PAGE_SIZE);
  const attributes = { [listAttribute]: "" };
  return (
    <>
      <ul
        className="m-0 mb-4 list-none divide-y divide-border border-y border-border p-0"
        {...attributes}
      >
        {items.slice(0, shown).map((item) => (
          <li key={itemKey(item)} className="min-w-0 py-3">
            {render(item)}
          </li>
        ))}
      </ul>
      {shown < items.length ? (
        <Button size="sm" className="mb-4" onClick={() => setShown(shown + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, items.length - shown)} more
        </Button>
      ) : null}
    </>
  );
}
