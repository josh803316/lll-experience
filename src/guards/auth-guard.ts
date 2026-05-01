type AuthData = {
  userId: string | number;
  sessionClaims?: Record<string, any>;
  [key: string]: any;
};

type Context = {
  auth: () => AuthData;
  status: (code: number, message: string) => Response;
  redirect: (url: string) => Response;
  request?: Request;
};

export const authGuard = (ctx: any) => {
  try {
    const typedCtx = ctx as unknown as Context;
    const auth = typedCtx.auth();
    const request = typedCtx.request;
    const path = typeof request?.url === 'string' ? new URL(request.url).pathname : 'unknown';
    const hasAuth = !!request?.headers?.get?.('authorization');

    if (!auth?.userId) {
      console.warn('[AUTH_GUARD] Unauthorized', {path, hasAuth});
      // Redirect to login with redirect_url
      return typedCtx.redirect(`/?redirect_url=${encodeURIComponent(path)}`);
    }
  } catch (e) {
    console.error('Auth error:', e);
    return ctx.status(401, 'Unauthorized - Authentication error');
  }
};
