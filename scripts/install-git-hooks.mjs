import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// Runs from the npm "prepare" script. Only a Git checkout of this repository
// gets hooks; CI, tarball installs, and registry installs are left untouched.
const root = new URL("../", import.meta.url);
if (process.env.CI || !existsSync(new URL(".git", root))) process.exit(0);

const result = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: root,
    stdio: "inherit",
});
if (result.error || result.status !== 0) {
    process.stderr.write("Could not configure Git hooks; run `git config core.hooksPath .githooks` manually.\n");
}
