import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";

import {
    applyVisibleSelection,
    createSkillSelectionState,
    filterSkillSelection,
} from "../dist/menu/skill-selection.js";
import { runInteractiveMenu } from "../dist/menu/menu.js";
import { packageVersion } from "../dist/package-info.js";
import { TerminalPresenter } from "../dist/presentation/terminal.js";

function captureStream({ isTTY = false, columns = 80 } = {}) {
    let output = "";
    const stream = new Writable({
        write(chunk, _encoding, callback) {
            output += chunk.toString();
            callback();
        },
    });
    stream.isTTY = isTTY;
    stream.columns = columns;
    return { stream, output: () => output };
}

const skills = [
    {
        id: "document-feature",
        name: "Document Feature",
        description: "Write developer documentation.",
        usage: "Documentation",
        supportedAgents: ["codex", "claude-code"],
        resources: [],
    },
    {
        id: "release-notes",
        name: "Release Notes",
        description: "Prepare release notes.",
        usage: "Releases",
        supportedAgents: ["codex"],
        resources: [],
    },
];

test("skill search matches names and ids while preserving hidden selections", () => {
    const initial = createSkillSelectionState(skills, ["release-notes"]);
    const filtered = filterSkillSelection({ ...initial, query: "document" });
    assert.deepEqual(filtered.map((skill) => skill.id), ["document-feature"]);

    const selected = applyVisibleSelection(
        { ...initial, query: "document" },
        ["document-feature"],
    );
    assert.deepEqual([...selected.selectedIds].sort(), [
        "document-feature",
        "release-notes",
    ]);

    assert.deepEqual(
        filterSkillSelection({ ...selected, query: "release-notes" }).map(
            (skill) => skill.id,
        ),
        ["release-notes"],
    );
});

test("terminal presentation respects NO_COLOR and uses a narrow fallback banner", () => {
    const previous = process.env.NO_COLOR;
    process.env.NO_COLOR = "1";
    try {
        const capture = captureStream({ isTTY: true, columns: 40 });
        const presenter = new TerminalPresenter(capture.stream);
        presenter.banner();
        presenter.status("conflict");

        assert.match(capture.output(), /Orbit Skills/);
        assert.match(capture.output(), /CONFLICT/);
        assert.doesNotMatch(capture.output(), /\u001b\[/);
    } finally {
        if (previous === undefined) delete process.env.NO_COLOR;
        else process.env.NO_COLOR = previous;
    }
});

test("interactive presentation uses color when allowed and prints the banner once", () => {
    const previous = process.env.NO_COLOR;
    delete process.env.NO_COLOR;
    try {
        const capture = captureStream({ isTTY: true, columns: 100 });
        const presenter = new TerminalPresenter(capture.stream);
        presenter.banner();
        presenter.banner();
        presenter.status("up-to-date");

        assert.match(capture.output(), /\u001b\[/);
        assert.equal(capture.output().match(/Skills · v/g)?.length, 1);
        assert.match(capture.output(), /UP TO DATE/);
    } finally {
        if (previous === undefined) delete process.env.NO_COLOR;
        else process.env.NO_COLOR = previous;
    }
});

test("non-interactive presentation never emits spinner animation or ANSI", async () => {
    const capture = captureStream({ isTTY: false });
    const presenter = new TerminalPresenter(capture.stream);

    const value = await presenter.runWithSpinner("Working", async () => 42);

    assert.equal(value, 42);
    assert.doesNotMatch(capture.output(), /\u001b\[/);
    assert.equal(capture.output(), "");
});

class QueuedPrompts {
    constructor(answers) {
        this.answers = [...answers];
    }

    next(kind) {
        const answer = this.answers.shift();
        assert.equal(answer?.kind, kind, `expected ${kind} prompt`);
        if (answer.error) throw answer.error;
        return Promise.resolve(answer.value);
    }

    select() { return this.next("select"); }
    checkbox() { return this.next("checkbox"); }
    input() { return this.next("input"); }
    confirm() { return this.next("confirm"); }
}

function menuFixture() {
    const adapter = {
        id: "codex",
        name: "Test Codex",
        getSkillsDirectory: () => "/tmp/test-agent/skills",
    };
    const calls = [];
    const services = {
        getAdapters: () => [adapter],
        getSkills: async () => [skills[0]],
        getInfo: async () => ({ ...skills[0], packageVersion }),
        getStatus: async () => ({
            agent: { id: "codex", name: "Test Codex" },
            skillsDirectory: adapter.getSkillsDirectory(),
            skills: [{
                id: "document-feature",
                name: "Document Feature",
                destination: "/tmp/test-agent/skills/document-feature",
                status: "not-installed",
                localChanges: false,
                updateAvailable: false,
            }],
        }),
        manage: async (operation, ids, selectedAdapter, options) => {
            calls.push({ operation, ids, selectedAdapter, options });
            return {
                operation,
                agentId: selectedAdapter.id,
                dryRun: options.dryRun === true,
                targetDirectory: selectedAdapter.getSkillsDirectory(),
                items: ids.map((skillId) => ({
                    skillId,
                    destination: `${selectedAdapter.getSkillsDirectory()}/${skillId}`,
                    action: "install",
                    status: options.dryRun ? "planned" : "installed",
                    message: options.dryRun ? "Will install." : "Installed.",
                })),
                summary: options.dryRun ? { planned: ids.length } : { installed: ids.length },
                hasFailures: false,
            };
        },
        doctor: async () => ({
            agent: { id: "codex", name: "Test Codex" },
            skillsDirectory: adapter.getSkillsDirectory(),
            parentExists: false,
            lock: { status: "none", path: "/tmp/test-agent/.orbit-skills.lock" },
            workspaces: [],
        }),
        clearLock: async () => {},
        recover: async () => ({ outcome: "cancelled" }),
        cleanup: async () => ({ removable: [], removed: [], preserved: [] }),
    };
    return { adapter, calls, services };
}

test("menu previews and confirms a selected skill through the shared service", async () => {
    const { calls, services } = menuFixture();
    const prompts = new QueuedPrompts([
        { kind: "select", value: "install" },
        { kind: "select", value: "codex" },
        { kind: "select", value: "select-visible" },
        { kind: "checkbox", value: ["document-feature"] },
        { kind: "select", value: "continue" },
        { kind: "confirm", value: true },
        { kind: "select", value: "exit" },
    ]);
    const capture = captureStream();

    const result = await runInteractiveMenu({
        prompts,
        presenter: new TerminalPresenter(capture.stream),
        services,
    });

    assert.equal(result, "exit");
    assert.deepEqual(calls.map((call) => ({
        operation: call.operation,
        ids: call.ids,
        dryRun: call.options.dryRun === true,
    })), [
        { operation: "install", ids: ["document-feature"], dryRun: true },
        { operation: "install", ids: ["document-feature"], dryRun: false },
    ]);
});

test("cancelling a menu plan never executes a changing operation", async () => {
    const { calls, services } = menuFixture();
    const prompts = new QueuedPrompts([
        { kind: "select", value: "install" },
        { kind: "select", value: "codex" },
        { kind: "select", value: "select-all" },
        { kind: "select", value: "continue" },
        { kind: "confirm", value: false },
        { kind: "select", value: "exit" },
    ]);
    const capture = captureStream();

    await runInteractiveMenu({
        prompts,
        presenter: new TerminalPresenter(capture.stream),
        services,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.dryRun, true);
});

test("Ctrl+C cancellation is handled without invoking services", async () => {
    const { calls, services } = menuFixture();
    const error = new Error("User force closed the prompt");
    error.name = "ExitPromptError";
    const prompts = new QueuedPrompts([{ kind: "select", error }]);
    const capture = captureStream();

    const result = await runInteractiveMenu({
        prompts,
        presenter: new TerminalPresenter(capture.stream),
        services,
    });

    assert.equal(result, "cancelled");
    assert.equal(calls.length, 0);
    assert.match(capture.output(), /Cancelled/);
});
