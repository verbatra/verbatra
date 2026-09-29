export type VMarkProps = {
  size?: number;
  blur?: number;
  decorative?: boolean;
};

function VMarkPath() {
  return (
    <path
      d="M4 4 L12 20 L20 4"
      stroke="var(--v-glow)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export function VMark({ size = 44, blur = 6, decorative = false }: VMarkProps) {
  const style = {
    filter: `drop-shadow(0 0 ${blur}px color-mix(in srgb, var(--v-glow) 60%, transparent))`,
  };

  if (decorative) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={style}
      >
        <VMarkPath />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="verbatra"
      style={style}
    >
      <VMarkPath />
    </svg>
  );
}
