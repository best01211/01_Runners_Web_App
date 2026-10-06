import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
try {
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.tracking-tests.json"], { cwd: root, stdio: "inherit" });
  execFileSync(process.execPath, ["--test", ".test-output/race-tracking/tests/race-tracking/engine.test.js", ".test-output/race-tracking/tests/race-tracking/validation.test.js"], { cwd: root, stdio: "inherit" });
} catch (error) {
  process.exitCode = typeof error.status === "number" ? error.status : 1;
}
