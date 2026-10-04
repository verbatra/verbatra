export interface DoctorFinding {
  readonly status: "pass" | "warn" | "skipped";
  readonly detail: string;
}

export function passFinding(detail: string): DoctorFinding {
  return { status: "pass", detail };
}

export function warnFinding(detail: string): DoctorFinding {
  return { status: "warn", detail };
}

export function skippedFinding(detail: string): DoctorFinding {
  return { status: "skipped", detail };
}
