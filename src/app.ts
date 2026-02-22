import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { clerkPlugin } from "elysia-clerk";

import { draftController } from "./controllers/draft.controller.ts";
import { authGuard } from "./guards/auth-guard.ts";
import { useLogger } from "./middleware/logger.middleware.ts";
import { isProtectedRoute } from "./config/route-protection.ts";
import { getDB } from "./db/index.ts";
import { apps } from "./db/schema.ts";
import { eq } from "drizzle-orm";
import { landingPage, appsPage } from "./views/templates.ts";

const PORT = Number(process.env.PORT ?? 3000);
const CLERK_KEY = process.env.CLERK_PUBLISHABLE_KEY;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error)
    return String((error as any).message);
  return String(error);
};

const baseApp = new Elysia()
  .use(swagger({ path: "/docs" }))
  .use(cors());

useLogger(baseApp);

const app = baseApp
  .use(
    clerkPlugin({
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    } as any)
  )

  .onBeforeHandle((ctx) => {
    const path = new URL(ctx.request.url).pathname;
    if (isProtectedRoute(path)) {
      return authGuard(ctx);
    }
  })

  .onRequest(({ request }) => {
    console.log(`[REQUEST] ${request.method} ${new URL(request.url).pathname}`);
  })

  .get("/health", () => ({ status: "ok" }))

  .get("/", (ctx) => {
    ctx.set.headers["Content-Type"] = "text/html";
    return landingPage(CLERK_KEY);
  })

  .get("/apps", async (ctx) => {
    const db = getDB();
    const activeApps = await db.select().from(apps).where(eq(apps.isActive, true));
    ctx.set.headers["Content-Type"] = "text/html";
    return appsPage(activeApps, CLERK_KEY);
  })

  .use(draftController)

  .onError(({ error, code, request }) => {
    const url = new URL(request.url);
    const msg = getErrorMessage(error);
    if (code === "NOT_FOUND") {
      console.log(`[404] ${request.method} ${url.pathname}`);
      return new Response(`<html><body><h1>404 — Not Found</h1><a href="/">Go home</a></body></html>`, {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    }
    console.error(`[ERROR] ${request.method} ${url.pathname} - ${code} - ${msg}`);
  });

// Only start a local HTTP server when not running on Vercel.
if (process.env.VERCEL !== "1") {
  app.listen(PORT);
  console.log(`LLL Experience running at http://localhost:${PORT}`);
}

export type App = typeof app;
export default app;
