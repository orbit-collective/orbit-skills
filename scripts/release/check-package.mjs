import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import {
    getSinglePackReport,
    validateManifest,
    validatePackContents,
} from "./package-contract.mjs";

const root = new URL("../../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
validateManifest(manifest);

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const packed = spawnSync(
    npmCommand,
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: root, encoding: "utf8" },
);
if (packed.error) throw packed.error;
if (packed.status !== 0) {
    throw new Error(`npm pack --dry-run failed:\n${packed.stderr || packed.stdout}`);
}

const report = getSinglePackReport(JSON.parse(packed.stdout));
if (!Array.isArray(report.files)) {
    throw new Error("npm pack returned an unexpected JSON report.");
}
const files = report.files;
validatePackContents(files.map((file) => file.path));
process.stdout.write(`Validated package contents: ${files.length} files, ${report.size} bytes packed.\n`);
