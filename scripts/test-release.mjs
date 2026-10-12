import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
const root = fileURLToPath(new URL("../",import.meta.url));
try {
 execFileSync(process.execPath,["node_modules/typescript/bin/tsc","-p","tsconfig.release-tests.json"],{cwd:root,stdio:"inherit"});
 const files = readdirSync(new URL("../.test-output/release/tests/release/",import.meta.url)).filter(f=>f.endsWith(".test.js")).map(f=>".test-output/release/tests/release/"+f);
 execFileSync(process.execPath,["--test",...files],{cwd:root,stdio:"inherit"});
} catch (error) { process.exitCode=typeof error.status==="number"?error.status:1; }
