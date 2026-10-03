import { spawnNpm } from "./npm.mjs";
import { readFile } from "node:fs/promises";

import {
    getSinglePackReport,
    validateManifest,
    validatePackContents,
    validateVersionConsistency,
} from "./package-contract.mjs";

const root = new URL("../../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const manifest = await readJson("package.json");
validateManifest(manifest);
validateVersionConsistency({
    manifest,
    lockfile: await readJson("package-lock.json"),
    releaseManifest: await readJson(".release-please-manifest.json"),
    changelog: await readFile(new URL("CHANGELOG.md", root), "utf8"),
});

const packed = spawnNpm(
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
