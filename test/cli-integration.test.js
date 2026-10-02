import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const CLI = join(process.cwd(), "dist", "cli.js");

async function fixture(t) {
    const home = await mkdtemp(join(tmpdir(), "orbit-skills-cli-"));
    t.after(() => rm(home, { recursive: true, force: true }));
    return home;
}

function run(home, args, extraEnv = {}) {
    return spawnSync(process.execPath, [CLI, ...args], {
        encoding: "utf8",
        env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            NO_COLOR: "1",
            ...extraEnv,
        },
    });
}

function requireSubprocess(t, result) {
    if (result.error?.code === "EPERM") {
        t.skip("This sandbox does not permit child processes; run the suite outside it for CLI integration coverage.");
        return false;
    }
    return true;
}

test("no arguments outside a TTY prints help and never opens the menu", async (t) => {
    const home = await fixture(t);
    const result = run(home, []);
    if (!requireSubprocess(t, result)) return;

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: orbit-skills/);
    assert.doesNotMatch(result.stdout, /Skills · v|ORBIT/);
    assert.doesNotMatch(result.stdout, /\u001b\[/);
});

test("help, version, and invalid arguments remain non-interactive", async (t) => {
    const home = await fixture(t);
    const help = run(home, ["--help"]);
    const version = run(home, ["--version"]);
    const invalid = run(home, ["install", "document-feature"]);
    if (!requireSubprocess(t, help)) return;

    assert.equal(help.status, 0);
    assert.match(help.stdout, /Commands:/);
    assert.equal(version.status, 0);
    assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+/);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /required option.*agent/i);
    assert.doesNotMatch(invalid.stdout + invalid.stderr, /Skills · v/);
});

test("list and info JSON are single versioned documents without terminal output", async (t) => {
    const home = await fixture(t);
    for (const args of [["list", "--json"], ["info", "document-feature", "--json"]]) {
        const result = run(home, args);
        if (!requireSubprocess(t, result)) return;
        assert.equal(result.status, 0, result.stderr);
        const document = JSON.parse(result.stdout);
        assert.equal(document.schemaVersion, 1);
        assert.equal(document.command, args[0]);
        assert.doesNotMatch(result.stdout, /\u001b\[|ORBIT|Skills · v/);
        assert.equal(result.stderr, "");
    }
});

test("JSON command errors have a versioned document and nonzero exit code", async (t) => {
    const home = await fixture(t);
    const result = run(home, ["info", "unknown-skill", "--json"]);
    if (!requireSubprocess(t, result)) return;

    assert.notEqual(result.status, 0);
    assert.deepEqual(Object.keys(JSON.parse(result.stdout)).sort(), [
        "command",
        "error",
        "schemaVersion",
    ]);
    assert.equal(JSON.parse(result.stdout).error.code, "COMMAND_FAILED");
    assert.equal(result.stderr, "");
});

test("JSON parse errors do not leak Commander help into stdout", async (t) => {
    const home = await fixture(t);
    const result = run(home, ["info", "--json"]);
    if (!requireSubprocess(t, result)) return;

    assert.notEqual(result.status, 0);
    const document = JSON.parse(result.stdout);
    assert.equal(document.schemaVersion, 1);
    assert.equal(document.command, "info");
    assert.equal(document.error.code, "COMMAND_FAILED");
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /Usage:/);
});

test("status and doctor JSON expose validated local paths only in structured data", async (t) => {
    const home = await fixture(t);
    const status = run(home, ["status", "--agent", "codex", "--json"]);
    const doctor = run(home, ["doctor", "--agent", "codex", "--json"]);
    if (!requireSubprocess(t, status)) return;

    assert.equal(status.status, 0, status.stderr);
    assert.equal(doctor.status, 0, doctor.stderr);
    const statusDocument = JSON.parse(status.stdout);
    const doctorDocument = JSON.parse(doctor.stdout);
    assert.equal(statusDocument.schemaVersion, 1);
    assert.equal(statusDocument.skills[0].status, "not-installed");
    assert.equal(statusDocument.skillsDirectory, join(home, ".agents", "skills"));
    assert.equal(doctorDocument.schemaVersion, 1);
    assert.equal(doctorDocument.lock.status, "none");
    assert.equal(doctorDocument.skillsDirectory, join(home, ".agents", "skills"));
});

test("built CLI installs idempotently and uninstalls only the selected managed skill", async (t) => {
    const home = await fixture(t);
    const install = run(home, ["install", "document-feature", "--agent", "codex"]);
    const repeat = run(home, ["install", "document-feature", "--agent", "codex"]);
    const preview = run(home, ["uninstall", "document-feature", "--agent", "codex", "--dry-run"]);
    if (!requireSubprocess(t, install)) return;

    assert.equal(install.status, 0, install.stderr);
    assert.match(install.stdout, /document-feature: installed/);
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.match(repeat.stdout, /document-feature: skipped/);
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /would-remove/);
    assert.match(await readFile(join(home, ".agents", "skills", "document-feature", "SKILL.md"), "utf8"), /Document a feature/);

    const remove = run(home, ["uninstall", "document-feature", "--agent", "codex"]);
    const repeatedRemove = run(home, ["uninstall", "document-feature", "--agent", "codex"]);
    assert.equal(remove.status, 0, remove.stderr);
    assert.match(remove.stdout, /document-feature: removed/);
    assert.equal(repeatedRemove.status, 0, repeatedRemove.stderr);
    assert.match(repeatedRemove.stdout, /document-feature: skipped/);
});

test("NO_COLOR and redirected output contain no control sequences or animation", async (t) => {
    const home = await fixture(t);
    const result = run(home, ["list"], { NO_COLOR: "1" });
    if (!requireSubprocess(t, result)) return;

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /\u001b\[/);
});
