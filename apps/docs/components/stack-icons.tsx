import {
  SiAndroid,
  SiAngular,
  SiApple,
  SiAstro,
  SiDotnet,
  SiExpo,
  SiFlutter,
  SiGnu,
  SiJson,
  SiNextdotjs,
  SiNodedotjs,
  SiNuxt,
  SiReact,
  SiSpring,
  SiSvelte,
  SiVuedotjs,
  SiXcode,
  SiYaml,
} from "@icons-pack/react-simple-icons";
import type { ReactNode } from "react";

const VIEWBOX = 24;
const SI = { size: VIEWBOX, color: "currentColor", title: "" } as const;

function OutlineGlyph({ children }: { children: ReactNode }): ReactNode {
  return (
    <svg
      width={VIEWBOX}
      height={VIEWBOX}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const STACK_ICONS = {
  android: <SiAndroid {...SI} />,
  angular: <SiAngular {...SI} />,
  apple: <SiApple {...SI} />,
  astro: <SiAstro {...SI} />,
  custom: (
    <OutlineGlyph>
      <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3M12 8v8M8 12h8" />
    </OutlineGlyph>
  ),
  dotnet: <SiDotnet {...SI} />,
  expo: <SiExpo {...SI} />,
  flutter: <SiFlutter {...SI} />,
  gnu: <SiGnu {...SI} />,
  ini: (
    <OutlineGlyph>
      <path d="M6 3h8l5 5v13H6z" />
      <path d="M14 3v5h5M9 12h6M9 16h6" />
    </OutlineGlyph>
  ),
  json: <SiJson {...SI} />,
  next: <SiNextdotjs {...SI} />,
  node: <SiNodedotjs {...SI} />,
  nuxt: <SiNuxt {...SI} />,
  react: <SiReact {...SI} />,
  spring: <SiSpring {...SI} />,
  svelte: <SiSvelte {...SI} />,
  vue: <SiVuedotjs {...SI} />,
  xcode: <SiXcode {...SI} />,
  xliff: (
    <OutlineGlyph>
      <path d="M6 3h8l5 5v13H6z" />
      <path d="M14 3v5h5M10.5 12 8.5 14.5l2 2.5M13.5 12l2 2.5-2 2.5" />
    </OutlineGlyph>
  ),
  yaml: <SiYaml {...SI} />,
} as const satisfies Record<string, ReactNode>;

export type StackIconKey = keyof typeof STACK_ICONS;

export function stackIconId(prefix: string, icon: StackIconKey): string {
  return `${prefix}-${icon}`;
}

export function StackIconSprite({
  prefix,
  icons,
}: {
  prefix: string;
  icons: ReadonlyArray<StackIconKey>;
}): ReactNode {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        {[...new Set(icons)].map((icon) => (
          <symbol key={icon} id={stackIconId(prefix, icon)} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
            {STACK_ICONS[icon]}
          </symbol>
        ))}
      </defs>
    </svg>
  );
}

export function StackIcon({
  prefix,
  icon,
  size,
  className,
}: {
  prefix: string;
  icon: StackIconKey;
  size: number;
  className?: string;
}): ReactNode {
  return (
    <svg width={size} height={size} aria-hidden="true" className={className}>
      <use href={`#${stackIconId(prefix, icon)}`} />
    </svg>
  );
}
