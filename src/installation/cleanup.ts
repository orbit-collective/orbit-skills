import { readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import type { AgentAdapter } from "../adapters/types.js";
import { inspectInstallation } from "./inspect.js";
import { withInstallationLock } from "./lock.js";
import { readUpdateTransaction } from "./transaction.js";
import { listUpdateWorkspaces, selectUpdateWorkspace } from "./workspace.js";

export interface CleanupOptions {
    dryRun: boolean;
    keep: number;
}

export interface CleanupItem {
    workspace: string;
    skillId: string;
    createdAt: string;
    completedAt: string;
}

export interface CleanupResult {
    removable: readonly CleanupItem[];
    removed: readonly string[];
    preserved: readonly string[];
}

async function inspectCleanupCandidate(
    adapter: AgentAdapter,
    name: string,
): Promise<CleanupItem | null> {
    const workspace = await selectUpdateWorkspace(adapter, name);
    let entries;
    try {
        entries = (await readdir(workspace)).sort();
    } catch {
        return null;
    }
    if (entries.length !== 2 || entries[0] !== "backup" || entries[1] !== "transaction.json") {
        return null;
    }

    let transaction;
    try {
        transaction = await readUpdateTransaction(workspace);
    } catch {
        return null;
    }
    if (!transaction || transaction.agentId !== adapter.id || transaction.phase !== "completed") {
        return null;
    }
    const backup = await inspectInstallation(
        join(workspace, "backup"),
        transaction.skillId,
        transaction.originalFingerprint,
    );
    if (backup.kind !== "valid") return null;
    return {
        workspace,
        skillId: transaction.skillId,
        createdAt: transaction.createdAt,
        completedAt: transaction.updatedAt,
    };
}

async function cleanupUnlocked(
    adapter: AgentAdapter,
    options: CleanupOptions,
): Promise<CleanupResult> {
    if (!Number.isSafeInteger(options.keep) || options.keep < 0) {
        throw new Error("--keep must be a non-negative integer.");
    }
    const names = await listUpdateWorkspaces(adapter);
    const inspected = await Promise.all(
        names.map(async (name) => ({ name, item: await inspectCleanupCandidate(adapter, name) })),
    );
    const candidates = inspected
        .flatMap(({ item }) => item ? [item] : [])
        .sort(
            (left, right) =>
                Date.parse(right.completedAt) - Date.parse(left.completedAt),
        );
    const retentionBoundary = options.keep === 0
        ? null
        : candidates[options.keep - 1]?.completedAt;
    const removable = retentionBoundary === undefined
        ? []
        : retentionBoundary === null
            ? candidates
            : candidates.filter(
                (item) => Date.parse(item.completedAt) < Date.parse(retentionBoundary),
            );
    const removed: string[] = [];

    if (!options.dryRun) {
        for (const item of removable) {
            const name = basename(item.workspace);
            const rechecked = await inspectCleanupCandidate(adapter, name);
            if (
                !rechecked ||
                rechecked.createdAt !== item.createdAt ||
                rechecked.completedAt !== item.completedAt ||
                rechecked.skillId !== item.skillId
            ) {
                continue;
            }
            await rm(item.workspace, { recursive: true, force: false });
            removed.push(item.workspace);
        }
    }

    const candidateNames = new Set(candidates.map((item) => basename(item.workspace)));
    return {
        removable,
        removed,
        preserved: inspected
            .filter(({ name, item }) => !item || !removable.includes(item) || options.dryRun)
            .map(({ name }) => name)
            .filter((name) => !candidateNames.has(name) || options.dryRun || !removed.some((path) => basename(path) === name)),
    };
}

export async function cleanupUpdateBackups(
    adapter: AgentAdapter,
    options: CleanupOptions,
): Promise<CleanupResult> {
    return withInstallationLock(adapter, () => cleanupUnlocked(adapter, options));
}
