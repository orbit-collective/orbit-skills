import { readFile } from "node:fs/promises";

import { validateReleaseTag } from "./package-contract.mjs";

const tag = process.argv[2];
if (!tag) throw new Error("Usage: node scripts/release/verify-release-tag.mjs <vX.Y.Z>");
const manifest = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
);
validateReleaseTag(manifest, tag);
process.stdout.write(`Release tag ${tag} matches package version ${manifest.version}.\n`);

