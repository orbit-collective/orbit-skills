import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
    getSinglePackReport,
    validateManifest,
    validatePackContents,
    validateReleaseTag,
    validateVersionConsistency,
} from "../scripts/release/package-contract.mjs";

const readRepoFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(await readRepoFile("package.json"));
const lockfile = JSON.parse(await readRepoFile("package-lock.json"));
const releaseManifest = JSON.parse(await readRepoFile(".release-please-manifest.json"));
const changelog = await readRepoFile("CHANGELOG.md");

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
    assert.doesNotThrow(() => validateReleaseTag(manifest, `v${manifest.version}`));
    assert.throws(() => validateReleaseTag(manifest, `v${manifest.version}-mismatch`), /does not match/i);
    assert.throws(() => validateReleaseTag(manifest, manifest.version), /does not match/i);
});

test("package.json, package-lock.json, release manifest, and changelog agree on the version", () => {
    assert.doesNotThrow(() => validateVersionConsistency({ manifest, lockfile, releaseManifest, changelog }));
});

test("the version consistency check rejects every kind of drift", () => {
    const version = "1.2.3";
    const consistent = () => ({
        manifest: { name: "@orbit-collective/skills", version },
        lockfile: {
            name: "@orbit-collective/skills",
            version,
            packages: { "": { name: "@orbit-collective/skills", version } },
        },
        releaseManifest: { ".": version },
        changelog: `# Changelog\n\nIntro.\n\n## [${version}](https://example.test) (2026-01-01)\n\n## 1.2.2\n`,
    });
    assert.doesNotThrow(() => validateVersionConsistency(consistent()));

    const drifts = [
        [(input) => { input.lockfile.version = "1.2.2"; }, /package-lock\.json version/],
        [(input) => { input.lockfile.packages[""].version = "1.2.2"; }, /root package version/],
        [(input) => { input.lockfile.name = "other"; }, /package-lock\.json name/],
        [(input) => { input.releaseManifest["."] = "1.2.2"; }, /release-please-manifest/],
        [(input) => { input.changelog = "# Changelog\n\n## 1.2.2\n"; }, /CHANGELOG\.md entry/],
        [(input) => { input.changelog = "# Changelog\n"; }, /CHANGELOG\.md entry/],
    ];
    for (const [mutate, expected] of drifts) {
        const input = consistent();
        mutate(input);
        assert.throws(() => validateVersionConsistency(input), expected);
    }
});

test("npm pack reports are normalized across supported npm formats", () => {
    const report = { name: "@orbit-collective/skills", files: [] };
    assert.equal(getSinglePackReport([report]), report);
    assert.equal(getSinglePackReport({ "@orbit-collective/skills": report }), report);
    assert.throws(() => getSinglePackReport({}), /unexpected/i);
});
