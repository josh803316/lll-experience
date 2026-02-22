/**
 * Manually applies the Bun crypto condition to @clerk/backend.
 * Run with Node.js (always available in Vercel build env).
 * More reliable than Bun's patchedDependencies mechanism since
 * bun install --force can reinstall without reapplying patches.
 */
const fs = require("fs");
const path = require("path");

const pkgPath = path.resolve(__dirname, "../node_modules/@clerk/backend/package.json");

if (!fs.existsSync(pkgPath)) {
  console.log("[patch-clerk] @clerk/backend not found in node_modules — skipping");
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const crypto = pkg.imports?.["#crypto"];

if (!crypto) {
  console.log("[patch-clerk] No #crypto import map found — skipping");
  process.exit(0);
}

if (crypto.bun) {
  console.log("[patch-clerk] Bun condition already present — no patch needed");
  process.exit(0);
}

pkg.imports["#crypto"] = {
  bun: {
    require: "./dist/runtime/node/crypto.js",
    import: "./dist/runtime/node/crypto.mjs",
  },
  ...crypto,
};

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log("[patch-clerk] ✓ Applied Bun crypto condition to @clerk/backend");
