import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
    getSinglePackReport,
    validateManifest,
    validatePackContents,
    validateReleaseTag,
} from "../scripts/release/package-contract.mjs";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("the release manifest describes a public portable CLI package", () => {
    assert.doesNotThrow(() => validateManifest(manifest));
});

test("the package contract accepts the complete release payload", () => {
    const files = [
        "package/CHANGELOG.md",
        "package/LICENSE",
        "package/README.md",
        "package/RELEASING.md",
        "package/dist/cli.js",
        "package/documentation/en/skills/README.md",
        "package/documentation/pl/skills/README.md",
        "package/package.json",
        "package/skills/document-feature/SKILL.md",
    ];

    assert.doesNotThrow(() => validatePackContents(files));
});

test("the package contract rejects developer files and installation metadata", () => {
    for (const forbidden of [
        "package/src/cli.ts",
        "package/test/cli-integration.test.js",
        "package/scripts/release/package-contract.mjs",
        "package/.github/workflows/ci.yml",
        "package/skills/document-feature/.orbit-skill.json",
        "package/transaction.json",
        "package/.env",
    ]) {
        assert.throws(
            () => validatePackContents([
                "package/CHANGELOG.md",
                "package/LICENSE",
                "package/README.md",
                "package/RELEASING.md",
                "package/dist/cli.js",
                "package/documentation/en/skills/README.md",
                "package/documentation/pl/skills/README.md",
                "package/package.json",
                "package/skills/document-feature/SKILL.md",
                forbidden,
            ]),
            /forbidden/i,
            forbidden,
        );
    }
});

test("the release tag must exactly match the package version", () => {
    assert.doesNotThrow(() => validateReleaseTag(manifest, "v0.1.0"));
    assert.throws(() => validateReleaseTag(manifest, "v0.1.1"), /does not match/i);
    assert.throws(() => validateReleaseTag(manifest, "0.1.0"), /does not match/i);
});

test("npm pack reports are normalized across supported npm formats", () => {
    const report = { name: "@orbit-collective/skills", files: [] };
    assert.equal(getSinglePackReport([report]), report);
    assert.equal(getSinglePackReport({ "@orbit-collective/skills": report }), report);
    assert.throws(() => getSinglePackReport({}), /unexpected/i);
});
