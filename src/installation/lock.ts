import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentAdapter } from "../adapters/types.js";

export async function withInstallationLock<T>(
    adapter: AgentAdapter,
    operation: () => Promise<T>,
): Promise<T> {
    const parentDirectory = dirname(adapter.getSkillsDirectory());
    const lockDirectory = join(
        parentDirectory,
        ".orbit-skills.lock",
    );

    await mkdir(parentDirectory, { recursive: true });

    try {
        await mkdir(lockDirectory);
    } catch (error) {
        if (
            error instanceof Error &&
            "code" in error &&
            error.code === "EEXIST"
        ) {
            throw new Error(
                `Another installation operation may be running. ` +
                `Lock: "${lockDirectory}".`,
            );
        }

        throw error;
    }

    try {
        await writeFile(
            join(lockDirectory, "owner.json"),
            JSON.stringify(
                {
                    pid: process.pid,
                    startedAt: new Date().toISOString(),
                    agent: adapter.id,
                },
                null,
                2,
            ) + "\n",
            {
                encoding: "utf8",
                flag: "wx",
            },
        );

        return await operation();
    } finally {
        await rm(lockDirectory, {
            recursive: true,
            force: true,
        });
    }
}