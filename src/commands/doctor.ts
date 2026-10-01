import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentAdapter } from "../adapters/index.js";

interface DoctorOptions {
    agent: string;
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

    if (!(await exists(parentDirectory))) {
        console.log("Installation directory has not been created yet.");
        return;
    }

    if (await exists(lockDirectory)) {
        console.log(`Lock found: ${lockDirectory}`);

        const ownerPath = join(lockDirectory, "owner.json");

        if (await exists(ownerPath)) {
            const owner: unknown = JSON.parse(
                await readFile(ownerPath, "utf8"),
            );

            if (
                typeof owner === "object" &&
                owner !== null &&
                "pid" in owner &&
                typeof owner.pid === "number" &&
                Number.isSafeInteger(owner.pid) &&
                owner.pid > 0 &&
                "startedAt" in owner &&
                typeof owner.startedAt === "string"
            ) {
                console.log(`  PID: ${owner.pid}`);
                console.log(`  Started at: ${owner.startedAt}`);
            } else {
                console.log("  Lock owner metadata is invalid.");
            }
        } else {
            console.log("  Lock owner metadata is missing.");
        }

        console.log(
            "  Check whether the operation is still running before recovery.\n",
        );
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
    }
}