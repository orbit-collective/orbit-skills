import { lstat, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentAdapter } from "../adapters/types.js";

const WORKSPACE_PATTERN = /^\.orbit-skills-update-[A-Za-z0-9]+$/;

export function getUpdateParent(adapter: AgentAdapter): string {
    return dirname(adapter.getSkillsDirectory());
}

export async function selectUpdateWorkspace(
    adapter: AgentAdapter,
    name: string,
): Promise<string> {
    if (!WORKSPACE_PATTERN.test(name)) {
        throw new Error(
            "Invalid transaction name. Use the exact workspace name shown by doctor.",
        );
    }
    const workspace = join(getUpdateParent(adapter), name);
    let stat;
    try {
        stat = await lstat(workspace);
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            throw new Error(`Update transaction "${name}" does not exist.`);
        }
        throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`Update transaction "${name}" is not a regular directory.`);
    }
    return workspace;
}

export async function listUpdateWorkspaces(
    adapter: AgentAdapter,
): Promise<readonly string[]> {
    let entries;
    try {
        entries = await readdir(getUpdateParent(adapter), { withFileTypes: true });
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
        throw error;
    }
    return entries
        .filter((entry) => entry.isDirectory() && WORKSPACE_PATTERN.test(entry.name))
        .map((entry) => entry.name)
        .sort();
}
