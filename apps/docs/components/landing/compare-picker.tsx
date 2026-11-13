"use client";

import { useEffect, useId, useState } from "react";
import { COMPARE_TOOL_PARAM } from "@/lib/compare-url";

type PickerOption = { readonly id: string; readonly name: string };

export const PICKER_LIVE_ATTRIBUTE = "data-picker-live";

function toolFromLocation(options: ReadonlyArray<PickerOption>): string | null {
  const wanted = new URLSearchParams(window.location.search).get(COMPARE_TOOL_PARAM);
  return options.find((option) => option.id === wanted)?.id ?? null;
}

function showPair(host: Element | null, tool: string): void {
  const pairs = host?.closest(".vk-compare")?.querySelector("[data-compare-pairs]");
  if (!pairs) return;
  for (const pair of pairs.querySelectorAll<HTMLDetailsElement>("[data-pair]")) {
    const selected = pair.getAttribute("data-pair") === tool;
    pair.toggleAttribute("data-selected", selected);
    if (selected) pair.open = true;
  }
}

function keepInUrl(tool: string): void {
  const params = new URLSearchParams(window.location.search);
  params.set(COMPARE_TOOL_PARAM, tool);
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}?${params}${window.location.hash}`,
  );
}

export function ComparePicker({
  label,
  options,
}: {
  label: string;
  options: ReadonlyArray<PickerOption>;
}): React.ReactNode {
  const id = useId();
  const first = options[0]?.id ?? "";
  const [tool, setTool] = useState(first);
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const compare = host?.closest(".vk-compare");
    compare?.setAttribute(PICKER_LIVE_ATTRIBUTE, "");
    return () => compare?.removeAttribute(PICKER_LIVE_ATTRIBUTE);
  }, [host]);

  useEffect(() => {
    const initial = toolFromLocation(options) ?? first;
    setTool(initial);
    showPair(host, initial);
  }, [options, host, first]);

  return (
    <div ref={setHost} className="vk-compare-picker">
      <label htmlFor={id} className="vk-compare-picker-label">
        {label}
      </label>
      <select
        id={id}
        value={tool}
        className="vk-compare-picker-select"
        onChange={(event) => {
          const next = event.currentTarget.value;
          setTool(next);
          showPair(host, next);
          keepInUrl(next);
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
