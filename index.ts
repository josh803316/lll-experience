// Vercel Elysia integration entrypoint.
// Import elysia so Vercel detects this as the Elysia entrypoint.
// App is loaded lazily on first request so load errors are caught and surfaced (Vercel often
// swallows Bun exit-without-logging otherwise).
import "elysia";

let appPromise: Promise<{ fetch: (req: Request) => Response | Promise<Response> }> | null =
  null;

async function getApp() {
  if (!appPromise) {
    appPromise = import("./src/app.js").then((m) => m.default);
  }
  return appPromise;
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const app = await getApp();
      return app.fetch(request);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error("[Vercel] Server load or handler error:", message, stack);
      return new Response(
        JSON.stringify({
          error: "Serverless function crashed",
          message,
          stack: process.env.VERCEL ? stack : undefined,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }
  },
};
