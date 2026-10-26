import type { ReactNode } from "react";
import { BRAND_MARKS, type BrandMark as BrandMarkData, type BrandMarkId } from "@/lib/brand-marks";

const DEFAULT_VIEWBOX = "0 0 24 24";

export function brandMarkSymbolId(prefix: string, mark: BrandMarkId): string {
  return `${prefix}-${mark}`;
}

export function BrandMarkSprite({
  prefix,
  marks,
}: {
  prefix: string;
  marks: ReadonlyArray<BrandMarkId>;
}): ReactNode {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        {[...new Set(marks)].map((mark) => (
          <symbol
            key={mark}
            id={brandMarkSymbolId(prefix, mark)}
            viewBox={(BRAND_MARKS[mark] as BrandMarkData).viewBox ?? DEFAULT_VIEWBOX}
          >
            <path
              d={BRAND_MARKS[mark].path}
              fill="currentColor"
              fillRule={BRAND_MARKS[mark].fillRule}
            />
          </symbol>
        ))}
      </defs>
    </svg>
  );
}

export function BrandMark({
  prefix,
  mark,
  size,
  className,
}: {
  prefix: string;
  mark: BrandMarkId;
  size: number;
  className?: string;
}): ReactNode {
  return (
    <svg width={size} height={size} aria-hidden="true" className={className}>
      <use href={`#${brandMarkSymbolId(prefix, mark)}`} />
    </svg>
  );
}
