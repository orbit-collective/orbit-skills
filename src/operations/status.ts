import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentAdapter } from "../adapters/types.js";
import { getSkillFingerprint } from "../installation/fingerprint.js";
import { isManagedSkill } from "../installation/install-skill.js";
import { readInstallationMetadata } from "../installation/metadata.js";
import {
    getAvailableSkills,
    getSkillDirectoryUrl,
} from "../skills/catalog.js";

export type InstallationStatus =
    | "not-installed"
    | "up-to-date"
    | "update-available"
    | "locally-modified"
    | "conflict"
    | "unknown";

export interface SkillStatus {
    readonly id: string;
    readonly name: string;
    readonly destination: string;
    readonly status: InstallationStatus;
    readonly localChanges: boolean;
    readonly updateAvailable: boolean;
    readonly detail?: string;
}

export interface StatusReport {
    readonly agent: { readonly id: string; readonly name: string };
    readonly skillsDirectory: string;
    readonly skills: readonly SkillStatus[];
}

function hasCode(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && error.code === code;
}

export async function inspectSkillsStatus(
    adapter: AgentAdapter,
): Promise<StatusReport> {
    const skills = await getAvailableSkills();
    const results: SkillStatus[] = [];

    for (const skill of skills) {
        const destination = join(adapter.getSkillsDirectory(), skill.id);
        let stat;
        try {
            stat = await lstat(destination);
        } catch (error) {
            if (hasCode(error, "ENOENT")) {
                results.push({
                    id: skill.id,
                    name: skill.name,
                    destination,
                    status: "not-installed",
                    localChanges: false,
                    updateAvailable: false,
                });
                continue;
            }
            results.push({
                id: skill.id,
                name: skill.name,
                destination,
                status: "unknown",
                localChanges: false,
                updateAvailable: false,
                detail: error instanceof Error ? error.message : "Unexpected error.",
            });
            continue;
        }

        if (
            !stat.isDirectory() ||
            stat.isSymbolicLink() ||
            !(await isManagedSkill(destination, skill.id))
        ) {
            results.push({
                id: skill.id,
                name: skill.name,
                destination,
                status: "conflict",
                localChanges: false,
                updateAvailable: false,
                detail: "Destination is not a regular Orbit-managed installation.",
            });
            continue;
        }

        const metadata = await readInstallationMetadata(destination, skill.id);
        if (!metadata) {
            results.push({
                id: skill.id,
                name: skill.name,
                destination,
                status: "conflict",
                localChanges: false,
                updateAvailable: false,
                detail: "Installation metadata or baseline is invalid.",
            });
            continue;
        }

        try {
            const source = fileURLToPath(getSkillDirectoryUrl(skill.id));
            const [sourceFingerprint, installedFingerprint] = await Promise.all([
                getSkillFingerprint(source),
                getSkillFingerprint(destination),
            ]);
            const localChanges = installedFingerprint !== metadata.fingerprint;
            const updateAvailable = sourceFingerprint !== metadata.fingerprint;
            results.push({
                id: skill.id,
                name: skill.name,
                destination,
                status: localChanges
                    ? "locally-modified"
                    : updateAvailable
                        ? "update-available"
                        : "up-to-date",
                localChanges,
                updateAvailable,
            });
        } catch (error) {
            results.push({
                id: skill.id,
                name: skill.name,
                destination,
                status: "unknown",
                localChanges: false,
                updateAvailable: false,
                detail: error instanceof Error ? error.message : "Unexpected error.",
            });
        }
    }

    return {
        agent: { id: adapter.id, name: adapter.name },
        skillsDirectory: adapter.getSkillsDirectory(),
        skills: results,
    };
}
