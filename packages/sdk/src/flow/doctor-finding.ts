export interface DoctorFinding {
  readonly status: "pass" | "warn";
  readonly detail: string;
}

export function passing(detail: string): DoctorFinding {
  return { status: "pass", detail };
}

export function warning(detail: string): DoctorFinding {
  return { status: "warn", detail };
}
