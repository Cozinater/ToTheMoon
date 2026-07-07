import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("dist-server", { recursive: true, force: true });
mkdirSync("dist-server", { recursive: true });

await build({
  entryPoints: ["server/lambda.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs", // avoids ESM dynamic-require shims when bundling the AWS SDK
  outfile: "dist-server/index.cjs",
  minify: true,
  logLevel: "info",
});

execSync("zip -qj dist-server/lambda.zip dist-server/index.cjs", { stdio: "inherit" });
console.log("dist-server/lambda.zip ready");
