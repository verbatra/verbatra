import { SearchInput } from "@verbatra/ui";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { routeParams } from "../client/routes.js";
import { navigateToRoute } from "./use-route.js";

export function HeaderSearch({
  className,
  onSearch,
}: {
  readonly className?: string;
  readonly onSearch?: () => void;
}): ReactNode {
  const [value, setValue] = useState("");

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    navigateToRoute({ page: "translations", params: routeParams({ query: value }) });
    setValue("");
    onSearch?.();
  }

  return (
    <search aria-label="Keys" className={className}>
      <form onSubmit={submit}>
        <SearchInput
          aria-label="Search keys and translations"
          placeholder="Search keys…"
          value={value}
          wrapperClassName="sm:max-w-none"
          className="h-9 rounded-full border-(--text-faint) bg-(--surface-card) py-0"
          onChange={(event) => setValue(event.target.value)}
        />
      </form>
    </search>
  );
}
