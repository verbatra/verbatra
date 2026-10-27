export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { reportContactEnv } = await import("@/lib/contact-env");
  reportContactEnv();
}
