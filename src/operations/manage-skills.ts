import { lstat, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentAdapter } from "../adapters/types.js";
import { getSkillFingerprint } from "../installation/fingerprint.js";
import { installSkill, isManagedSkill } from "../installation/install-skill.js";
import {
    InstallationLockLostError,
    withInstallationLock,
} from "../installation/lock.js";
import { readInstallationMetadata } from "../installation/metadata.js";
import { updateSkill } from "../installation/update-skill.js";
import {
    getSkillDirectoryUrl,
    resolveSkillSelection,
    type SkillDefinition,
    type SkillOperation,
} from "../skills/catalog.js";

export type SkillResultStatus =
    | "planned"
    | "installed"
    | "updated"
    | "removed"
    | "skipped"
    | "conflict"
    | "error";

export type SkillAction =
    | "install"
    | "update"
    | "remove"
    | "skip"
    | "conflict";

export interface SkillOperationItem {
    readonly skillId: string;
    readonly destination: string;
    readonly action: SkillAction;
    readonly status: SkillResultStatus;
    readonly message: string;
    readonly backupPath?: string;
}

export type SkillSummary = Partial<Record<SkillResultStatus, number>>;

export interface SkillBatchResult {
    readonly operation: SkillOperation;
    readonly agentId: string;
    readonly dryRun: boolean;
    readonly targetDirectory: string;
    readonly items: readonly SkillOperationItem[];
    readonly summary: SkillSummary;
    readonly hasFailures: boolean;
}

export interface ManageSkillsOptions {
    readonly dryRun?: boolean;
    readonly force?: boolean;
}

function hasCode(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && error.code === code;
}

async function assertSafeSkillsDirectory(adapter: AgentAdapter): Promise<void> {
    const skillsDirectory = adapter.getSkillsDirectory();
    try {
        const stat = await lstat(skillsDirectory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            throw new Error(
                `Skills directory is not a regular directory: "${skillsDirectory}".`,
            );
        }
    } catch (error) {
        if (hasCode(error, "ENOENT")) return;
        throw error;
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unexpected error.";
}

function planningError(
    skill: SkillDefinition,
    adapter: AgentAdapter,
    error: unknown,
): SkillOperationItem {
    return {
        skillId: skill.id,
        destination: join(adapter.getSkillsDirectory(), skill.id),
        action: "conflict",
        status: "error",
        message: `Could not inspect this skill safely: ${errorMessage(error)}`,
    };
}

async function planSkill(
    operation: SkillOperation,
    skill: SkillDefinition,
    adapter: AgentAdapter,
    force: boolean,
): Promise<SkillOperationItem> {
    const destination = join(adapter.getSkillsDirectory(), skill.id);
    let destinationStat;
    try {
        destinationStat = await lstat(destination);
    } catch (error) {
        if (!hasCode(error, "ENOENT")) throw error;
        if (operation === "install") {
            return {
                skillId: skill.id,
                destination,
                action: "install",
                status: "planned",
                message: "Will install the packaged skill.",
            };
        }
        if (operation === "uninstall") {
            return {
                skillId: skill.id,
                destination,
                action: "skip",
                status: "skipped",
                message: "Skill is not installed.",
            };
        }
        return {
            skillId: skill.id,
            destination,
            action: "conflict",
            status: "conflict",
            message: "Skill is not installed and cannot be updated.",
        };
    }

    if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) {
        return {
            skillId: skill.id,
            destination,
            action: "conflict",
            status: "conflict",
            message: "Destination is not a regular managed skill directory.",
        };
    }
    if (!(await isManagedSkill(destination, skill.id))) {
        return {
            skillId: skill.id,
            destination,
            action: "conflict",
            status: "conflict",
            message: "Destination is not managed by Orbit Skills.",
        };
    }
    const metadata = await readInstallationMetadata(destination, skill.id);
    if (!metadata) {
        return {
            skillId: skill.id,
            destination,
            action: "conflict",
            status: "conflict",
            message: "Installation metadata or baseline is invalid.",
        };
    }

    let installedFingerprint: string;
    try {
        installedFingerprint = await getSkillFingerprint(destination);
    } catch (error) {
        return {
            skillId: skill.id,
            destination,
            action: "conflict",
            status: "conflict",
            message: `Installation content is unsafe: ${errorMessage(error)}`,
        };
    }
    const locallyModified = installedFingerprint !== metadata.fingerprint;

    if (operation === "uninstall") {
        if (locallyModified && !force) {
            return {
                skillId: skill.id,
                destination,
                action: "conflict",
                status: "conflict",
                message: "Skill has local changes; use --force only for this selected skill.",
            };
        }
        return {
            skillId: skill.id,
            destination,
            action: "remove",
            status: "planned",
            message: locallyModified
                ? "Will remove the locally modified managed skill because --force was specified."
                : "Will remove the unchanged managed skill.",
        };
    }
    if (locallyModified) {
        return {
            skillId: skill.id,
            destination,
            action: "conflict",
            status: "conflict",
            message: `Skill has local changes; ${operation} refused.`,
        };
    }

    const source = fileURLToPath(getSkillDirectoryUrl(skill.id));
    const sourceFingerprint = await getSkillFingerprint(source);
    if (sourceFingerprint === installedFingerprint) {
        return {
            skillId: skill.id,
            destination,
            action: "skip",
            status: "skipped",
            message: operation === "install"
                ? "The packaged skill is already installed."
                : "The installed skill is already up to date.",
        };
    }
    if (operation === "install") {
        return {
            skillId: skill.id,
            destination,
            action: "conflict",
            status: "conflict",
            message: "A different managed package version is installed; use update.",
        };
    }
    return {
        skillId: skill.id,
        destination,
        action: "update",
        status: "planned",
        message: "Will update the installed skill and preserve a recovery backup.",
    };
}

export function summarizeSkillResults(
    items: readonly Pick<SkillOperationItem, "status">[],
): SkillSummary {
    const summary: SkillSummary = {};
    for (const item of items) {
        summary[item.status] = (summary[item.status] ?? 0) + 1;
    }
    return summary;
}

export function getSkillCommandExitCode(summary: SkillSummary): 0 | 1 {
    return (summary.conflict ?? 0) > 0 || (summary.error ?? 0) > 0 ? 1 : 0;
}

function batchResult(
    operation: SkillOperation,
    adapter: AgentAdapter,
    dryRun: boolean,
    items: readonly SkillOperationItem[],
): SkillBatchResult {
    const summary = summarizeSkillResults(items);
    return {
        operation,
        agentId: adapter.id,
        dryRun,
        targetDirectory: adapter.getSkillsDirectory(),
        items,
        summary,
        hasFailures: getSkillCommandExitCode(summary) !== 0,
    };
}

export async function manageSkills(
    operation: SkillOperation,
    requestedIds: readonly string[],
    adapter: AgentAdapter,
    options: ManageSkillsOptions,
): Promise<SkillBatchResult> {
    const skills = await resolveSkillSelection(requestedIds, adapter.id, operation);
    const force = options.force === true;
    if (force && operation !== "uninstall") {
        throw new Error("--force is supported only by uninstall.");
    }

    if (options.dryRun === true) {
        await assertSafeSkillsDirectory(adapter);
        const items: SkillOperationItem[] = [];
        for (const skill of skills) {
            try {
                items.push(await planSkill(operation, skill, adapter, force));
            } catch (error) {
                items.push(planningError(skill, adapter, error));
            }
        }
        return batchResult(operation, adapter, true, items);
    }

    return withInstallationLock(adapter, async (assertLockOwnership) => {
        await assertLockOwnership();
        await assertSafeSkillsDirectory(adapter);
        const items: SkillOperationItem[] = [];
        for (const skill of skills) {
            await assertLockOwnership();
            let plan: SkillOperationItem;
            try {
                plan = await planSkill(operation, skill, adapter, force);
            } catch (error) {
                items.push(planningError(skill, adapter, error));
                continue;
            }
            if (plan.status !== "planned") {
                items.push(plan);
                continue;
            }
            try {
                if (plan.action === "install") {
                    const status = await installSkill(skill, adapter);
                    items.push({
                        ...plan,
                        status,
                        message: status === "installed" ? "Installed." : "Skipped.",
                    });
                } else if (plan.action === "update") {
                    const result = await updateSkill(skill, adapter);
                    items.push({
                        ...plan,
                        status: result.status,
                        message: result.status === "updated" ? "Updated." : "Skipped.",
                        ...(result.backupPath ? { backupPath: result.backupPath } : {}),
                    });
                } else if (plan.action === "remove") {
                    await assertLockOwnership();
                    const confirmed = await planSkill(
                        "uninstall",
                        skill,
                        adapter,
                        force,
                    );
                    if (
                        confirmed.status !== "planned" ||
                        confirmed.action !== "remove"
                    ) {
                        throw new Error(
                            `Installation state changed before removal: ${confirmed.message}`,
                        );
                    }
                    await rm(plan.destination, { recursive: true, force: false });
                    items.push({ ...plan, status: "removed", message: "Removed." });
                }
                await assertLockOwnership();
            } catch (error) {
                if (error instanceof InstallationLockLostError) throw error;
                items.push({ ...plan, status: "error", message: errorMessage(error) });
            }
        }
        return batchResult(operation, adapter, false, items);
    });
}
