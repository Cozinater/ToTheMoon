import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("dist-server", { recursive: true, force: true });
mkdirSync("dist-server", { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs", // avoids ESM dynamic-require shims when bundling the AWS SDK
  minify: true,
  logLevel: "info",
};

// HTTP API handler — served via the Lambda Function URL.
await build({ ...common, entryPoints: ["server/lambda.ts"], outfile: "dist-server/index.cjs" });
execSync("zip -qj dist-server/lambda.zip dist-server/index.cjs", { stdio: "inherit" });

// Prefetch handler — invoked on a daily EventBridge schedule (see infra/prefetch.tf).
await build({ ...common, entryPoints: ["server/prefetch.ts"], outfile: "dist-server/prefetch.cjs" });
execSync("zip -qj dist-server/prefetch.zip dist-server/prefetch.cjs", { stdio: "inherit" });

console.log("dist-server/lambda.zip + dist-server/prefetch.zip ready");
