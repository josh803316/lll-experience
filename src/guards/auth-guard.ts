type AuthData = {
  userId: string | number;
  sessionClaims?: Record<string, any>;
  [key: string]: any;
};

type Context = {
  auth: () => AuthData;
  status: (code: number, message: string) => Response;
  request?: Request;
};

export const authGuard = (ctx: any) => {
  try {
    const typedCtx = ctx as unknown as Context;
    const auth = typedCtx.auth();
    const request = typedCtx.request;
    const path =
      typeof request?.url === "string"
        ? new URL(request.url).pathname
        : "unknown";
    const hasAuth = !!request?.headers?.get?.("authorization");

    if (!auth?.userId) {
      console.warn("[AUTH_GUARD] Unauthorized", { path, hasAuth });
      return typedCtx.status(401, "Unauthorized - Authentication required");
    }
  } catch (e) {
    console.error("Auth error:", e);
    return ctx.status(401, "Unauthorized - Authentication error");
  }
};
