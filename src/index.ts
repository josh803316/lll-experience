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

const baseApp = new Elysia()
  .use(swagger({ path: "/docs" }))
  .use(cors());

useLogger(baseApp);

const app = baseApp
  .use(clerkPlugin())

  // Protect routes that require auth
  .onBeforeHandle((ctx) => {
    const path = new URL(ctx.request.url).pathname;
    if (isProtectedRoute(path)) {
      return authGuard(ctx);
    }
  })

  // Health check
  .get("/health", () => ({ status: "ok" }))

  // Landing page
  .get("/", (ctx) => {
    ctx.set.headers["Content-Type"] = "text/html";
    return landingPage(CLERK_KEY);
  })

  // Apps listing (protected via isProtectedRoute)
  .get("/apps", async (ctx) => {
    const db = getDB();
    const activeApps = await db.select().from(apps).where(eq(apps.isActive, true));
    ctx.set.headers["Content-Type"] = "text/html";
    return appsPage(activeApps, CLERK_KEY);
  })

  .use(draftController)

  // 404 fallback
  .onError(({ code, set }) => {
    if (code === "NOT_FOUND") {
      set.status = 404;
      set.headers["Content-Type"] = "text/html";
      return `<html><body><h1>404 — Not Found</h1><a href="/">Go home</a></body></html>`;
    }
  })

  .listen(PORT);

console.log(`LLL Experience running at http://localhost:${PORT}`);

export type App = typeof app;
