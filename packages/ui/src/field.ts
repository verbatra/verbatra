export type FieldSize = "xs" | "sm" | "md";

export const FIELD_BASE =
  "vk-field block w-full rounded-(--radius-md) border border-(--border-field) bg-(--surface-raised) text-(--text-strong) placeholder:text-(--text-muted) motion-safe:transition-colors motion-safe:duration-(--duration-fast) hover:border-(--text-faint) disabled:opacity-60 aria-invalid:border-(--status-danger) aria-invalid:hover:border-(--status-danger)";

export const FIELD_SIZE: Readonly<Record<FieldSize, string>> = {
  xs: "px-2 py-1 text-xs",
  sm: "px-3 py-[7px] text-sm",
  md: "px-[18px] py-[11px] text-sm",
};
