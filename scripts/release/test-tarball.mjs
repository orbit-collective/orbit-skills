import { spawnSync } from "node:child_process";
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { validateManifest, validatePackContents } from "./package-contract.mjs";

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/release/test-tarball.mjs <package.tgz>");
const tarball = resolve(input);
const tarballStat = await lstat(tarball);
if (!tarballStat.isFile() || tarballStat.isSymbolicLink() || !tarball.endsWith(".tgz")) {
    throw new Error(`Tarball must be a regular .tgz file: ${tarball}`);
}

const sandbox = await mkdtemp(join(tmpdir(), "orbit-skills-artifact-"));
const project = join(sandbox, "consumer");
const home = join(sandbox, "home");
const npmCache = join(sandbox, "npm-cache");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    NO_COLOR: "1",
    npm_config_audit: "false",
    npm_config_cache: npmCache,
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
};

function run(command, args, cwd = project) {
    const result = spawnSync(command, args, { cwd, env, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(
            `${command} ${args.join(" ")} failed (${result.status}):\n${result.stderr || result.stdout}`,
        );
    }
    return result.stdout;
}

async function listFiles(directory, relative = "") {
    const paths = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
        const child = join(directory, entry.name);
        const stat = await lstat(child);
        if (stat.isSymbolicLink()) throw new Error(`Installed package contains a symbolic link: ${childRelative}`);
        if (stat.isDirectory()) paths.push(...await listFiles(child, childRelative));
        else if (stat.isFile()) paths.push(childRelative);
        else throw new Error(`Installed package contains an unsupported entry: ${childRelative}`);
    }
    return paths;
}

try {
    await mkdir(project, { recursive: true });
    await mkdir(home, { recursive: true });
    run(npmCommand, ["init", "--yes"]);
    run(npmCommand, [
        "install",
        "--ignore-scripts",
        "--no-package-lock",
        tarball,
    ]);

    const installedRoot = join(project, "node_modules", "@orbit-collective", "skills");
    const installedStat = await lstat(installedRoot);
    if (!installedStat.isDirectory() || installedStat.isSymbolicLink()) {
        throw new Error("The installed package is missing or linked to another directory.");
    }
    const manifest = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
    validateManifest(manifest);
    validatePackContents(await listFiles(installedRoot));

    const cli = join(installedRoot, "dist", "cli.js");
    if (!(await readFile(cli, "utf8")).startsWith("#!/usr/bin/env node\n")) {
        throw new Error("The installed CLI has no Node.js shebang.");
    }

    const version = run(process.execPath, [cli, "--version"]).trim();
    if (version !== manifest.version) throw new Error(`Unexpected CLI version: ${version}`);
    if (!run(process.execPath, [cli, "--help"]).includes("Usage: orbit-skills")) {
        throw new Error("CLI help did not render.");
    }
    run(process.execPath, [cli, "list"]);
    run(process.execPath, [cli, "info", "document-feature"]);
    const listJson = JSON.parse(run(process.execPath, [cli, "list", "--json"]));
    if (listJson.schemaVersion !== 1 || listJson.skills?.[0]?.id !== "document-feature") {
        throw new Error("CLI JSON catalog output is invalid.");
    }

    run(process.execPath, [cli, "install", "document-feature", "--agent", "codex"]);
    const installedSkill = join(home, ".agents", "skills", "document-feature");
    const packagedSkill = join(installedRoot, "skills", "document-feature");
    const packagedSkillFiles = await listFiles(packagedSkill);
    const installedSkillFiles = (await listFiles(installedSkill))
        .filter((path) => path !== ".orbit-skill.json");
    if (JSON.stringify(installedSkillFiles) !== JSON.stringify(packagedSkillFiles)) {
        throw new Error("Installed skill resources differ from the packaged skill resources.");
    }
    for (const path of packagedSkillFiles) {
        const packaged = await readFile(join(packagedSkill, path));
        const installed = await readFile(join(installedSkill, path));
        if (!packaged.equals(installed)) throw new Error(`Installed skill file differs: ${path}`);
    }

    const status = JSON.parse(run(process.execPath, [cli, "status", "--agent", "codex", "--json"]));
    if (status.skills?.[0]?.status !== "up-to-date") throw new Error("Installed skill is not up to date.");
    if (!run(process.execPath, [cli, "install", "document-feature", "--agent", "codex"]).includes("skipped")) {
        throw new Error("Repeated installation was not idempotent.");
    }
    run(process.execPath, [cli, "update", "document-feature", "--agent", "codex", "--dry-run"]);
    run(process.execPath, [cli, "uninstall", "document-feature", "--agent", "codex", "--dry-run"]);
    run(process.execPath, [cli, "doctor", "--agent", "codex", "--json"]);
    run(process.execPath, [cli, "cleanup", "--agent", "codex", "--dry-run"]);

    const packageArgument = `--package=${tarball}`;
    if (run(npmCommand, ["exec", "--yes", "--offline", packageArgument, "--", "orbit-skills", "--version"]).trim() !== manifest.version) {
        throw new Error("npm exec did not run the local tarball.");
    }
    const npxInfo = JSON.parse(run(npxCommand, [
        "--yes",
        "--offline",
        packageArgument,
        "orbit-skills",
        "info",
        "document-feature",
        "--json",
    ]));
    if (npxInfo.skill?.id !== "document-feature") throw new Error("npx did not run the local tarball.");

    process.stdout.write(
        `Verified ${manifest.name}@${manifest.version} from ${basename(tarball)} outside the repository.\n`,
    );
} finally {
    await rm(sandbox, { recursive: true, force: true });
}

