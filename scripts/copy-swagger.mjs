// Copies the pinned swagger-ui-dist assets into public/ so /api/docs can
// serve them same-origin instead of pulling them from a third-party CDN at
// runtime (supply-chain + uptime). Runs via the prebuild/predev npm hooks.
// The destination is gitignored — it's regenerated from the locked version
// of swagger-ui-dist on every install/build.
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const srcDir = require("swagger-ui-dist").getAbsoluteFSPath();
const destDir = join(process.cwd(), "public", "vendor", "swagger-ui");

const assets = ["swagger-ui-bundle.js", "swagger-ui.css"];

mkdirSync(destDir, { recursive: true });
for (const asset of assets) {
  copyFileSync(join(srcDir, asset), join(destDir, asset));
}

const version = require("swagger-ui-dist/package.json").version;
console.log(`[copy-swagger] copied ${assets.length} assets (v${version}) → public/vendor/swagger-ui/`);
