// NO static imports here — static imports are hoisted above all code,
// so process.on handlers registered below would never fire in time.
// Dynamic import() is used instead so errors are fully catchable.

process.on("uncaughtException", (err: any) => {
  console.error("[UNCAUGHT EXCEPTION]", err?.message ?? String(err));
  console.error("[UNCAUGHT EXCEPTION stack]", err?.stack ?? "(no stack)");
  process.exit(1);
});

process.on("unhandledRejection", (reason: any) => {
  console.error("[UNHANDLED REJECTION]", reason?.message ?? String(reason));
  console.error("[UNHANDLED REJECTION stack]", reason?.stack ?? "(no stack)");
  process.exit(1);
});

console.log("[STARTUP] Handlers registered, loading app module...");

let app: any;

try {
  const mod = await import("./app.ts");
  app = mod.default;
  console.log("[STARTUP] App module loaded successfully.");
} catch (err: any) {
  console.error("[STARTUP FAILED] Could not load app module.");
  console.error("[STARTUP FAILED] Error name   :", err?.name ?? "(none)");
  console.error("[STARTUP FAILED] Error message :", err?.message ?? String(err));
  console.error("[STARTUP FAILED] Error stack   :", err?.stack ?? "(no stack)");
  // Log any extra fields Bun adds to ResolveMessage / BuildMessage
  if (err?.position)   console.error("[STARTUP FAILED] position  :", JSON.stringify(err.position));
  if (err?.specifier)  console.error("[STARTUP FAILED] specifier :", err.specifier);
  if (err?.referrer)   console.error("[STARTUP FAILED] referrer  :", err.referrer);
  process.exit(1);
}

export type App = typeof app;
export default app;
