const EXPECTED_NODE_RANGE = "^22.13.0 || ^24.0.0 || ^26.0.0";

const REQUIRED_FILES = new Set([
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    "RELEASING.md",
    "dist/cli.js",
    "documentation/en/skills/README.md",
    "documentation/pl/skills/README.md",
    "package.json",
    "skills/document-feature/SKILL.md",
]);

const FORBIDDEN_PREFIXES = [
    ".github/",
    "node_modules/",
    "scripts/",
    "src/",
    "test/",
];

const FORBIDDEN_NAMES = new Set([
    ".orbit-skill.json",
    "owner.json",
    "transaction.json",
]);

function fail(message) {
    throw new Error(`Invalid release package: ${message}`);
}

function normalizePackagePath(path) {
    const normalized = path.replaceAll("\\", "/");
    return normalized.startsWith("package/")
        ? normalized.slice("package/".length)
        : normalized;
}

export function validateManifest(manifest) {
    if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
        fail("package.json must contain an object.");
    }
    if (manifest.name !== "@orbit-collective/skills") fail("unexpected package name.");
    if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
        fail("version must be a valid release version.");
    }
    if (typeof manifest.description !== "string" || manifest.description.trim().length < 20) {
        fail("description is missing or too short.");
    }
    if (manifest.private === true) fail("the package is marked private.");
    if (manifest.license !== "MIT") fail("license must match the repository LICENSE.");
    if (manifest.bin?.["orbit-skills"] !== "./dist/cli.js") fail("orbit-skills bin is missing.");
    if (manifest.engines?.node !== EXPECTED_NODE_RANGE) fail("unsupported Node.js engine range.");
    if (manifest.publishConfig?.access !== "public") fail("scoped package access is not public.");
    if (manifest.publishConfig?.registry !== "https://registry.npmjs.org/") {
        fail("release registry must be the public npm registry.");
    }
    if (manifest.repository?.url !== "git+https://github.com/orbit-collective/orbit-skills.git") {
        fail("repository URL does not match the project repository.");
    }
    const supportedOs = new Set(manifest.os);
    for (const os of ["darwin", "linux", "win32"]) {
        if (!supportedOs.has(os)) fail(`missing declared operating system: ${os}.`);
    }
    const included = new Set(manifest.files);
    for (const path of ["dist", "skills", "documentation", "CHANGELOG.md", "LICENSE", "README.md", "RELEASING.md"]) {
        if (!included.has(path)) fail(`missing files entry: ${path}.`);
    }
}

export function validatePackContents(inputPaths) {
    const paths = inputPaths.map(normalizePackagePath);
    const available = new Set(paths);
    for (const required of REQUIRED_FILES) {
        if (!available.has(required)) fail(`required file is absent: ${required}.`);
    }
    for (const path of paths) {
        if (FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix))) {
            fail(`forbidden developer file: ${path}.`);
        }
        const segments = path.split("/");
        if (
            segments.some((segment) => FORBIDDEN_NAMES.has(segment)) ||
            segments.some((segment) => segment === ".env" || segment.startsWith(".env.")) ||
            path.endsWith(".tgz") ||
            path.includes(".orbit-skills-update-") ||
            path.includes(".orbit-skills.lock")
        ) {
            fail(`forbidden runtime or sensitive file: ${path}.`);
        }
    }
}

export function validateReleaseTag(manifest, tag) {
    validateManifest(manifest);
    if (tag !== `v${manifest.version}`) {
        fail(`release tag "${tag}" does not match package version "v${manifest.version}".`);
    }
}

export function getSinglePackReport(value) {
    const reports = Array.isArray(value)
        ? value
        : typeof value === "object" && value !== null
            ? Object.values(value)
            : [];
    if (reports.length !== 1 || typeof reports[0] !== "object" || reports[0] === null) {
        fail("npm pack returned an unexpected JSON report.");
    }
    return reports[0];
}
