export const publicPaths = ['/', '/health', '/api/cron'];

export const isProtectedRoute = (path: string): boolean => {
  const isPublic = publicPaths.some((publicPath) => {
    if (publicPath === '/') {
      return path === '/';
    }
    return path === publicPath || path.startsWith(`${publicPath}/`);
  });
  return !isPublic;
};
