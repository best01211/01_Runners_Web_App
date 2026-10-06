import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.auth-tests.json"], { cwd: root, stdio: "inherit" });
  execFileSync(process.execPath, ["--test", ".test-output/auth/tests/auth/password-recovery.test.js"], { cwd: root, stdio: "inherit" });
} catch (error) { process.exitCode = typeof error.status === "number" ? error.status : 1; }
