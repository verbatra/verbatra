import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { Icon } from "./Icon.js";
import { cn } from "./lib/cn.js";

const FIELD_CLASSNAME =
  "mt-1 block w-full max-w-[320px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): ReactNode {
  return <textarea className={cn(FIELD_CLASSNAME, className)} {...props} />;
}

export function TextField({
  className,
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  readonly ref?: Ref<HTMLInputElement> | undefined;
}): ReactNode {
  return <input type={type} className={cn(FIELD_CLASSNAME, className)} {...props} />;
}

export function SearchInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return (
    <span className="relative block w-full max-w-[320px]">
      <Icon
        name="search"
        size={14}
        className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input type="search" className={cn(FIELD_CLASSNAME, "mt-0 ps-8", className)} {...props} />
    </span>
  );
}
