import type { AgentAdapter } from "../adapters/types.js";
import { getAgentAdapters } from "../adapters/index.js";
import { cleanupUpdateBackups, type CleanupOptions, type CleanupResult } from "../installation/cleanup.js";
import { clearAbandonedInstallationLock } from "../installation/lock.js";
import { recoverUpdate, type RecoveryResult } from "../installation/recover.js";
import { inspectDoctor, type DoctorReport } from "../operations/doctor.js";
import {
    manageSkills,
    type ManageSkillsOptions,
    type SkillBatchResult,
} from "../operations/manage-skills.js";
import { inspectSkillsStatus, type StatusReport } from "../operations/status.js";
import type { TerminalPresenter } from "../presentation/terminal.js";
import {
    getAvailableSkills,
    getSkillInfo,
    type SkillDefinition,
    type SkillInfo,
    type SkillOperation,
} from "../skills/catalog.js";
import {
    applyVisibleSelection,
    createSkillSelectionState,
    filterSkillSelection,
    type SkillSelectionState,
} from "./skill-selection.js";
import type { PromptAdapter, PromptChoice } from "./prompts.js";

export interface MenuServices {
    getAdapters(): readonly AgentAdapter[];
    getSkills(): Promise<readonly SkillDefinition[]>;
    getInfo(skillId: string): Promise<SkillInfo>;
    getStatus(adapter: AgentAdapter): Promise<StatusReport>;
    manage(
        operation: SkillOperation,
        skillIds: readonly string[],
        adapter: AgentAdapter,
        options: ManageSkillsOptions,
    ): Promise<SkillBatchResult>;
    doctor(adapter: AgentAdapter): Promise<DoctorReport>;
    clearLock(adapter: AgentAdapter, lockId: string): Promise<void>;
    recover(adapter: AgentAdapter, transactionName: string): Promise<RecoveryResult>;
    cleanup(adapter: AgentAdapter, options: CleanupOptions): Promise<CleanupResult>;
}

export const defaultMenuServices: MenuServices = {
    getAdapters: getAgentAdapters,
    getSkills: getAvailableSkills,
    getInfo: getSkillInfo,
    getStatus: inspectSkillsStatus,
    manage: manageSkills,
    doctor: inspectDoctor,
    clearLock: clearAbandonedInstallationLock,
    recover: recoverUpdate,
    cleanup: cleanupUpdateBackups,
};

export interface InteractiveMenuOptions {
    readonly prompts: PromptAdapter;
    readonly presenter: TerminalPresenter;
    readonly services?: MenuServices;
}

type MainAction =
    | "install"
    | "update"
    | "uninstall"
    | "status"
    | "skills"
    | "doctor"
    | "recover"
    | "cleanup"
    | "exit";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unexpected error.";
}

function shortDescription(description: string): string {
    return description.length <= 90
        ? description
        : `${description.slice(0, 87).trimEnd()}...`;
}

function renderInfo(presenter: TerminalPresenter, info: SkillInfo): void {
    presenter.header(`${info.name} (${info.id})`);
    presenter.paragraph(info.description, "  ");
    presenter.paragraph(`Use: ${info.usage}`, "  ");
    presenter.paragraph(
        `Resources: ${info.resources.length > 0 ? info.resources.join(", ") : "none"}`,
        "  ",
    );
    presenter.paragraph(`Agents: ${info.supportedAgents.join(", ")}`, "  ");
    presenter.paragraph(`Package version: ${info.packageVersion}`, "  ");
    presenter.line();
}

function renderStatus(presenter: TerminalPresenter, report: StatusReport): void {
    presenter.header(`Status · ${report.agent.name}`);
    for (const skill of report.skills) {
        presenter.paragraph(`${presenter.badge(skill.status)} ${skill.name} (${skill.id})`);
        if (skill.detail) presenter.paragraph(skill.detail, "  ");
        presenter.path(skill.destination, "Destination");
    }
    presenter.line();
}

function renderBatch(presenter: TerminalPresenter, result: SkillBatchResult): void {
    for (const item of result.items) {
        const label = result.dryRun && item.status === "planned"
            ? `planned: ${item.action}`
            : item.status;
        const badgeStatus = item.status === "conflict"
            ? "conflict"
            : item.status === "error"
                ? "error"
                : item.status;
        presenter.paragraph(`${presenter.badge(badgeStatus)} ${item.skillId} · ${label}`);
        presenter.paragraph(item.message, "  ");
        presenter.path(item.destination, "Destination");
        if (item.backupPath) presenter.path(item.backupPath, "Backup");
    }
    const summary = Object.entries(result.summary)
        .map(([status, count]) => `${count} ${status}`)
        .join(", ");
    presenter.paragraph(`Summary: ${summary || "no changes"}.`);
    presenter.line();
}

async function selectAgent(
    prompts: PromptAdapter,
    services: MenuServices,
): Promise<AgentAdapter | null> {
    const adapters = services.getAdapters();
    const value = await prompts.select({
        message: "Choose an agent (↑/↓ navigate, Enter confirm)",
        choices: [
            ...adapters.map((adapter) => ({
                name: `${adapter.name} · ${adapter.getSkillsDirectory()}`,
                value: adapter.id,
            })),
            { name: "← Back", value: "back" },
        ],
    });
    return value === "back"
        ? null
        : adapters.find((adapter) => adapter.id === value) ?? null;
}

async function chooseSkills(
    operation: SkillOperation,
    adapter: AgentAdapter,
    prompts: PromptAdapter,
    presenter: TerminalPresenter,
    services: MenuServices,
): Promise<readonly string[] | null> {
    const skills = (await services.getSkills()).filter((skill) =>
        skill.supportedAgents.includes(adapter.id)
    );
    const statusReport = await services.getStatus(adapter);
    const statuses = new Map(statusReport.skills.map((skill) => [skill.id, skill.status]));
    let state: SkillSelectionState = createSkillSelectionState(skills);

    while (true) {
        const filtered = filterSkillSelection(state);
        const query = state.query.trim() || "all skills";
        presenter.hint(
            `Filter: ${query} · selected: ${state.selectedIds.size}. ` +
            "Search input and the checkbox list are separate: Space selects only inside the checkbox list.",
        );
        const action = await prompts.select({
            message: "Skill selection (↑/↓ navigate, Enter open)",
            choices: [
                {
                    name: `Select from visible list (${filtered.length})`,
                    value: "select-visible",
                    description: "Space toggles, Enter applies; hidden selections are preserved.",
                    disabled: filtered.length === 0 ? "No matching skills" : false,
                },
                {
                    name: "Search by name or ID",
                    value: "search",
                    description: "Typing mode; Space inserts a character.",
                },
                {
                    name: "View skill details",
                    value: "details",
                    disabled: filtered.length === 0 ? "No matching skills" : false,
                },
                { name: `Select all skills (${skills.length})`, value: "select-all" },
                { name: "Clear selection", value: "clear" },
                {
                    name: `Continue with ${state.selectedIds.size} selected`,
                    value: "continue",
                    disabled: state.selectedIds.size === 0
                        ? `${operation} requires at least one skill`
                        : false,
                },
                { name: "← Back", value: "back" },
            ],
        });

        if (action === "back") return null;
        if (action === "continue") {
            if (state.selectedIds.size === 0) {
                presenter.warning(`${operation} requires at least one selected skill.`);
                continue;
            }
            return skills
                .filter((skill) => state.selectedIds.has(skill.id))
                .map((skill) => skill.id);
        }
        if (action === "search") {
            const query = await prompts.input({
                message: "Search text (type, then Enter; empty shows all)",
                default: state.query,
            });
            state = { ...state, query };
        } else if (action === "select-all") {
            state = {
                ...state,
                selectedIds: new Set(skills.map((skill) => skill.id)),
            };
        } else if (action === "clear") {
            state = { ...state, selectedIds: new Set() };
        } else if (action === "select-visible") {
            const visibleSelected = await prompts.checkbox({
                message: "Choose skills (↑/↓ navigate, Space toggle, Enter apply)",
                choices: filtered.map((skill) => ({
                    name: `${skill.name} (${skill.id}) ${presenter.badge(statuses.get(skill.id) ?? "unknown")}`,
                    value: skill.id,
                    description: shortDescription(skill.description),
                    checked: state.selectedIds.has(skill.id),
                })),
            });
            state = applyVisibleSelection(state, visibleSelected);
        } else if (action === "details") {
            const skillId = await prompts.select({
                message: "Choose a skill to inspect",
                choices: [
                    ...filtered.map((skill) => ({
                        name: `${skill.name} (${skill.id})`,
                        value: skill.id,
                        description: shortDescription(skill.description),
                    })),
                    { name: "← Back", value: "back" },
                ],
            });
            if (skillId !== "back") renderInfo(presenter, await services.getInfo(skillId));
        }
    }
}

async function runManageAction(
    operation: SkillOperation,
    prompts: PromptAdapter,
    presenter: TerminalPresenter,
    services: MenuServices,
): Promise<void> {
    const adapter = await selectAgent(prompts, services);
    if (!adapter) return;
    const skillIds = await chooseSkills(operation, adapter, prompts, presenter, services);
    if (!skillIds) return;

    let force = false;
    let preview = await services.manage(operation, skillIds, adapter, { dryRun: true });
    renderBatch(presenter, preview);

    if (
        operation === "uninstall" &&
        preview.items.some((item) => item.status === "conflict" && /local changes/i.test(item.message))
    ) {
        force = await prompts.confirm({
            message: "Force removal of local changes in only these selected managed skills?",
            default: false,
        });
        if (force) {
            preview = await services.manage(operation, skillIds, adapter, {
                dryRun: true,
                force: true,
            });
            renderBatch(presenter, preview);
        }
    }

    if (!preview.items.some((item) => item.status === "planned")) {
        presenter.warning("There are no executable changes in this plan.");
        return;
    }
    const confirmed = await prompts.confirm({
        message: operation === "uninstall"
            ? "Remove the selected managed skills?"
            : `Execute this ${operation} plan?`,
        default: false,
    });
    if (!confirmed) {
        presenter.info("Cancelled before any changes were made.");
        return;
    }

    const result = await presenter.runWithSpinner(
        `${operation[0]?.toUpperCase()}${operation.slice(1)} in progress`,
        () => services.manage(operation, skillIds, adapter, { force }),
    );
    renderBatch(presenter, result);
}

async function runSkillBrowser(
    prompts: PromptAdapter,
    presenter: TerminalPresenter,
    services: MenuServices,
): Promise<void> {
    const skills = await services.getSkills();
    const id = await prompts.select({
        message: "Available skills (↑/↓ navigate, Enter details)",
        choices: [
            ...skills.map((skill) => ({
                name: `${skill.name} (${skill.id})`,
                value: skill.id,
                description: shortDescription(skill.description),
            })),
            { name: "← Back", value: "back" },
        ],
    });
    if (id !== "back") renderInfo(presenter, await services.getInfo(id));
}

function renderDoctor(presenter: TerminalPresenter, report: DoctorReport): void {
    presenter.header(`Diagnostics · ${report.agent.name}`);
    presenter.path(report.skillsDirectory, "Skills directory");
    presenter.paragraph(`Lock: ${report.lock.status}`);
    if (report.lock.owner) {
        presenter.paragraph(`Lock ID: ${report.lock.owner.lockId}`, "  ");
        presenter.paragraph(`PID: ${report.lock.owner.pid}`, "  ");
        presenter.paragraph(`Host: ${report.lock.owner.hostname}`, "  ");
        presenter.paragraph(`Started: ${report.lock.owner.startedAt}`, "  ");
    }
    if (report.lock.detail) presenter.warning(report.lock.detail);
    presenter.paragraph(`Update workspaces: ${report.workspaces.length}`);
    for (const workspace of report.workspaces) {
        presenter.paragraph(`${workspace.name} · journal ${workspace.journalStatus}`, "  ");
        if (workspace.transaction) {
            presenter.paragraph(
                `${workspace.transaction.skillId} · ${workspace.transaction.phase}`,
                "    ",
            );
        }
    }
    presenter.line();
}

async function runDoctorAction(
    prompts: PromptAdapter,
    presenter: TerminalPresenter,
    services: MenuServices,
): Promise<void> {
    const adapter = await selectAgent(prompts, services);
    if (!adapter) return;
    let report = await services.doctor(adapter);
    renderDoctor(presenter, report);
    if (report.lock.status === "present" && report.lock.owner) {
        const clear = await prompts.confirm({
            message: "Attempt controlled recovery of this exact lock? Active or ambiguous locks will be refused.",
            default: false,
        });
        if (clear) {
            await presenter.runWithSpinner("Checking abandoned lock", () =>
                services.clearLock(adapter, report.lock.owner!.lockId)
            );
            presenter.success("Abandoned lock removed after identity verification.");
            report = await services.doctor(adapter);
            renderDoctor(presenter, report);
        }
    }
}

async function runRecoveryAction(
    prompts: PromptAdapter,
    presenter: TerminalPresenter,
    services: MenuServices,
): Promise<void> {
    const adapter = await selectAgent(prompts, services);
    if (!adapter) return;
    const report = await services.doctor(adapter);
    if (report.workspaces.length === 0) {
        presenter.info("No update transactions were found.");
        return;
    }
    const choices: PromptChoice<string>[] = report.workspaces.map((workspace) => ({
        name: `${workspace.name} · ${workspace.transaction?.skillId ?? "unknown skill"} · ${workspace.transaction?.phase ?? workspace.journalStatus}`,
        value: workspace.name,
        disabled: workspace.journalStatus !== "valid"
            ? "A valid transaction journal is required"
            : workspace.transaction?.agentId !== adapter.id
                ? "Transaction belongs to another agent"
                : false,
    }));
    choices.push({ name: "← Back", value: "back" });
    const name = await prompts.select({
        message: "Choose one exact recovery transaction",
        choices,
    });
    if (name === "back") return;
    const confirmed = await prompts.confirm({
        message: `Recover transaction ${name}?`,
        default: false,
    });
    if (!confirmed) {
        presenter.info("Recovery cancelled.");
        return;
    }
    const result = await presenter.runWithSpinner("Recovering update", () =>
        services.recover(adapter, name)
    );
    presenter.success(`Recovery outcome: ${result.outcome}.`);
    presenter.path(result.workspace, "Workspace");
}

async function runCleanupAction(
    prompts: PromptAdapter,
    presenter: TerminalPresenter,
    services: MenuServices,
): Promise<void> {
    const adapter = await selectAgent(prompts, services);
    if (!adapter) return;
    const value = await prompts.input({
        message: "How many newest verified backups should be kept? (or b to go back)",
        default: "3",
        validate(input) {
            return input.trim().toLowerCase() === "b" || /^\d+$/.test(input.trim())
                ? true
                : "Enter a non-negative integer or b.";
        },
    });
    if (value.trim().toLowerCase() === "b") return;
    const keep = Number(value);
    const preview = await services.cleanup(adapter, { dryRun: true, keep });
    if (preview.removable.length === 0) {
        presenter.info("No verified completed backups are eligible for cleanup.");
        return;
    }
    presenter.header("Cleanup preview");
    for (const item of preview.removable) {
        presenter.paragraph(`${item.skillId} · completed ${item.completedAt}`);
        presenter.path(item.workspace, "Would remove");
    }
    const confirmed = await prompts.confirm({
        message: `Permanently remove ${preview.removable.length} verified backup workspace(s)?`,
        default: false,
    });
    if (!confirmed) {
        presenter.info("Cleanup cancelled.");
        return;
    }
    const result = await presenter.runWithSpinner("Cleaning verified backups", () =>
        services.cleanup(adapter, { dryRun: false, keep })
    );
    presenter.success(`Removed ${result.removed.length} backup workspace(s).`);
}

async function showFirstRunIntro(
    presenter: TerminalPresenter,
    services: MenuServices,
): Promise<void> {
    const reports = await Promise.all(
        services.getAdapters().map((adapter) => services.getStatus(adapter)),
    );
    const firstRun =
        reports.length > 0 &&
        reports.every((report) =>
            report.skills.every((skill) => skill.status === "not-installed")
        );
    if (firstRun) {
        presenter.header("Welcome");
        presenter.paragraph(
            "No Orbit-managed skills are installed yet. Choose Install skills to review an agent, select skills, inspect the plan, and confirm. Nothing is installed automatically.",
        );
        presenter.line();
    }
}

export async function runInteractiveMenu(
    options: InteractiveMenuOptions,
): Promise<"exit" | "cancelled"> {
    const { prompts, presenter } = options;
    const services = options.services ?? defaultMenuServices;
    presenter.banner();

    try {
        await showFirstRunIntro(presenter, services);
        while (true) {
            presenter.hint("↑/↓ navigate · Enter choose · Ctrl+C cancel");
            const action = await prompts.select<MainAction>({
                message: "What would you like to do?",
                choices: [
                    { name: "Install skills", value: "install" },
                    { name: "Update skills", value: "update" },
                    { name: "Uninstall skills", value: "uninstall" },
                    { name: "Status", value: "status" },
                    { name: "Browse skills and details", value: "skills" },
                    { name: "Diagnostics and lock recovery", value: "doctor" },
                    { name: "Recover interrupted update", value: "recover" },
                    { name: "Clean completed backups", value: "cleanup" },
                    { name: "Exit", value: "exit" },
                ],
            });
            if (action === "exit") return "exit";

            try {
                if (action === "install" || action === "update" || action === "uninstall") {
                    await runManageAction(action, prompts, presenter, services);
                } else if (action === "skills") {
                    await runSkillBrowser(prompts, presenter, services);
                } else if (action === "status") {
                    const adapter = await selectAgent(prompts, services);
                    if (adapter) renderStatus(presenter, await services.getStatus(adapter));
                } else if (action === "doctor") {
                    await runDoctorAction(prompts, presenter, services);
                } else if (action === "recover") {
                    await runRecoveryAction(prompts, presenter, services);
                } else if (action === "cleanup") {
                    await runCleanupAction(prompts, presenter, services);
                }
            } catch (error) {
                if (error instanceof Error && error.name === "ExitPromptError") throw error;
                presenter.error(errorMessage(error));
            }
        }
    } catch (error) {
        if (error instanceof Error && error.name === "ExitPromptError") {
            presenter.info("Cancelled. No new operation was started.");
            return "cancelled";
        }
        throw error;
    }
}
