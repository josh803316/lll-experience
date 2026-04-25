/**
 * App version string computed once at startup.
 * - Vercel: uses VERCEL_GIT_COMMIT_SHA + VERCEL_GIT_COMMIT_REF (set at build time)
 * - Local: reads from git directly
 */

let cached: string | null = null;

function compute(): string {
  // Vercel provides these as build-time env vars
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const ref = process.env.VERCEL_GIT_COMMIT_REF;

  if (sha) {
    const short = sha.slice(0, 7);
    if (ref && ref !== 'main') {
      return `${ref}@${short}`;
    }
    return short;
  }

  // Local dev: read from git
  try {
    const sha = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD']).stdout.toString().trim();
    const branch = Bun.spawnSync(['git', 'rev-parse', '--abbrev-ref', 'HEAD']).stdout.toString().trim();
    if (branch && branch !== 'main') {
      return `${branch}@${sha}`;
    }
    return sha || 'dev';
  } catch {
    return 'dev';
  }
}

export function getAppVersion(): string {
  if (!cached) {cached = compute();}
  return cached;
}
