export const publicPaths = ["/", "/health"];

export const isProtectedRoute = (path: string): boolean => {
  const isPublic = publicPaths.some((publicPath) => {
    if (publicPath === "/") return path === "/";
    return path === publicPath || path.startsWith(`${publicPath}/`);
  });
  return !isPublic;
};
