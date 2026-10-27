type VMarkProps = {
  size?: number;
  decorative?: boolean;
};

function VMarkPath() {
  return (
    <path
      d="M4 4 L12 20 L20 4"
      stroke="var(--accent)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export function VMark({ size = 44, decorative = false }: VMarkProps) {
  if (decorative) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    >
      <VMarkPath />
    </svg>
  );
}
