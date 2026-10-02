import { lstat, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readUpdateTransaction } from "../installation/transaction.js";
import { getAgentAdapter } from "../adapters/index.js";
import {
    clearAbandonedInstallationLock,
    readInstallationLock,
} from "../installation/lock.js";

interface DoctorOptions {
    agent: string;
    clearLock?: string;
}

async function exists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
        ) {
            return false;
        }

        throw error;
    }
}

export async function diagnoseInstallation(
    options: DoctorOptions,
): Promise<void> {
    const adapter = getAgentAdapter(options.agent);
    const skillsDirectory = adapter.getSkillsDirectory();
    const parentDirectory = dirname(skillsDirectory);

    const lockDirectory = join(
        parentDirectory,
        ".orbit-skills.lock",
    );

    console.log(`Agent: ${adapter.name}`);
    console.log(`Skills directory: ${skillsDirectory}\n`);

    if (options.clearLock) {
        await clearAbandonedInstallationLock(adapter, options.clearLock);
        console.log(`Cleared abandoned lock: ${options.clearLock}\n`);
    }

    if (!(await exists(parentDirectory))) {
        console.log("Installation directory has not been created yet.");
        return;
    }

    if (await exists(lockDirectory)) {
        console.log(`Lock found: ${lockDirectory}`);
        try {
            const owner = await readInstallationLock(adapter);
            if (!owner) throw new Error("Lock disappeared during inspection.");
            console.log(`  Lock ID: ${owner.lockId}`);
            console.log(`  PID: ${owner.pid}`);
            console.log(`  Host: ${owner.hostname}`);
            console.log(`  Started at: ${owner.startedAt}`);
            console.log("  Use --clear-lock with this exact ID only after the owner is proven inactive.\n");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unexpected error.";
            console.log(`  Lock cannot be recovered automatically: ${message}\n`);
        }
    } else {
        console.log("No installation lock found.\n");
    }

    const entries = await readdir(parentDirectory, {
        withFileTypes: true,
    });

    const workspaces = entries
        .filter(
            (entry) =>
                entry.isDirectory() &&
                entry.name.startsWith(".orbit-skills-update-"),
        )
        .sort((a, b) =>
            a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
        );

    if (workspaces.length === 0) {
        console.log("No update workspaces found.");
        return;
    }

    console.log(`Update workspaces: ${workspaces.length}\n`);

    for (const entry of workspaces) {
        const workspace = join(parentDirectory, entry.name);

        const hasStaged = await exists(join(workspace, "staged"));
        const hasBackup = await exists(join(workspace, "backup"));

        console.log(workspace);
        console.log(`  Staged directory: ${hasStaged ? "present" : "absent"}`);
        console.log(`  Backup directory: ${hasBackup ? "present" : "absent"}`);
        console.log();

        try {
            const transaction = await readUpdateTransaction(workspace);

            if (transaction === null) {
                console.log("  Transaction: unavailable (no journal)");
            } else {
                console.log(`  Skill: ${transaction.skillId}`);
                console.log(`  Agent: ${transaction.agentId}`);
                console.log(`  Phase: ${transaction.phase}`);
                console.log(`  Updated at: ${transaction.updatedAt}`);

                if (transaction.agentId !== adapter.id) {
                    console.log("  This transaction belongs to another agent.");
                }

                if (
                    transaction.phase !== "completed" &&
                    transaction.phase !== "cancelled" &&
                    transaction.phase !== "restored"
                ) {
                    console.log(
                        "  Requires inspection: completion was not recorded.",
                    );
                }
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error.";

            console.log(`  Transaction: unreadable or invalid (${message})`);
        }
    }
}
