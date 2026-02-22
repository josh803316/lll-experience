/**
 * Build-time check: attempts to load src/app.ts and reports any
 * module resolution errors with full detail before Vercel deploys.
 * Uses a dynamic env-var path so Bun cannot statically pre-resolve it.
 */
const modulePath = process.env.CHECK_MODULE_PATH ?? "../src/app.ts";

console.log(`[check-module] Loading: ${modulePath}`);

try {
  await import(modulePath);
  console.log("[check-module] ✓ Module loaded successfully");
} catch (err: any) {
  console.error("[check-module] ✗ Module load FAILED");
  console.error("  name      :", err?.name     ?? "(none)");
  console.error("  message   :", err?.message   ?? String(err));
  console.error("  specifier :", err?.specifier ?? "(none)");
  console.error("  referrer  :", err?.referrer  ?? "(none)");
  console.error("  stack     :", err?.stack     ?? "(no stack)");
  process.exit(1);
}
