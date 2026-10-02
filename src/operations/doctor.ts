import { lstat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentAdapter } from "../adapters/types.js";
import { readInstallationLock } from "../installation/lock.js";
import { readUpdateTransaction } from "../installation/transaction.js";
import {
    listUpdateWorkspaces,
    selectUpdateWorkspace,
} from "../installation/workspace.js";

export interface DoctorLockReport {
    readonly status: "none" | "present" | "invalid";
    readonly path: string;
    readonly owner?: {
        readonly lockId: string;
        readonly pid: number;
        readonly hostname: string;
        readonly startedAt: string;
        readonly agentId: string;
    };
    readonly detail?: string;
}

export interface DoctorWorkspaceReport {
    readonly name: string;
    readonly path: string;
    readonly stagedPresent: boolean;
    readonly backupPresent: boolean;
    readonly journalStatus: "valid" | "missing" | "invalid";
    readonly transaction?: {
        readonly skillId: string;
        readonly agentId: string;
        readonly phase: string;
        readonly createdAt: string;
        readonly updatedAt: string;
    };
    readonly detail?: string;
}

export interface DoctorReport {
    readonly agent: { readonly id: string; readonly name: string };
    readonly skillsDirectory: string;
    readonly parentExists: boolean;
    readonly lock: DoctorLockReport;
    readonly workspaces: readonly DoctorWorkspaceReport[];
}

async function exists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

export async function inspectDoctor(
    adapter: AgentAdapter,
): Promise<DoctorReport> {
    const skillsDirectory = adapter.getSkillsDirectory();
    const parent = dirname(skillsDirectory);
    const lockPath = join(parent, ".orbit-skills.lock");
    const parentExists = await exists(parent);
    let lock: DoctorLockReport = { status: "none", path: lockPath };

    if (parentExists && await exists(lockPath)) {
        try {
            const owner = await readInstallationLock(adapter);
            if (!owner) throw new Error("Lock disappeared during inspection.");
            lock = {
                status: "present",
                path: lockPath,
                owner: {
                    lockId: owner.lockId,
                    pid: owner.pid,
                    hostname: owner.hostname,
                    startedAt: owner.startedAt,
                    agentId: owner.agentId,
                },
            };
        } catch (error) {
            lock = {
                status: "invalid",
                path: lockPath,
                detail: error instanceof Error ? error.message : "Unexpected error.",
            };
        }
    }

    const workspaces: DoctorWorkspaceReport[] = [];
    for (const name of await listUpdateWorkspaces(adapter)) {
        const path = await selectUpdateWorkspace(adapter, name);
        const base = {
            name,
            path,
            stagedPresent: await exists(join(path, "staged")),
            backupPresent: await exists(join(path, "backup")),
        };
        try {
            const transaction = await readUpdateTransaction(path);
            if (!transaction) {
                workspaces.push({ ...base, journalStatus: "missing" });
            } else {
                workspaces.push({
                    ...base,
                    journalStatus: "valid",
                    transaction: {
                        skillId: transaction.skillId,
                        agentId: transaction.agentId,
                        phase: transaction.phase,
                        createdAt: transaction.createdAt,
                        updatedAt: transaction.updatedAt,
                    },
                });
            }
        } catch (error) {
            workspaces.push({
                ...base,
                journalStatus: "invalid",
                detail: error instanceof Error ? error.message : "Unexpected error.",
            });
        }
    }

    return {
        agent: { id: adapter.id, name: adapter.name },
        skillsDirectory,
        parentExists,
        lock,
        workspaces,
    };
}
