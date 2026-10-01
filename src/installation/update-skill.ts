import { cp, lstat, mkdtemp, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentAdapter } from "../adapters/types.js";
import {
    getSkillFileUrl,
    type SkillDefinition,
} from "../skills/catalog.js";
import { getSkillFingerprint } from "./fingerprint.js";
import { isManagedSkill } from "./install-skill.js";
import {
    readInstallationMetadata,
    writeInstallationMetadata,
} from "./metadata.js";

interface UpdateResult {
    status: "updated" | "skipped";
    backupPath?: string;
}

export async function updateSkill(
    skill: SkillDefinition,
    adapter: AgentAdapter,
): Promise<UpdateResult> {
    const source = fileURLToPath(
        new URL(".", getSkillFileUrl(skill.id)),
    );

    const skillsDirectory = adapter.getSkillsDirectory();
    const destination = join(skillsDirectory, skill.id);

    const destinationStat = await lstat(destination);

    if (
        !destinationStat.isDirectory() ||
        !(await isManagedSkill(destination, skill.id))
    ) {
        throw new Error(`Skill "${skill.id}" is not managed by Orbit Skills.`);
    }

    const metadata = await readInstallationMetadata(
        destination,
        skill.id,
    );

    if (!metadata) {
        throw new Error(`Installation baseline unavailable for "${skill.id}".`);
    }

    const installedFingerprint =
        await getSkillFingerprint(destination);

    if (installedFingerprint !== metadata.fingerprint) {
        throw new Error(
            `Skill "${skill.id}" has local changes. Update cancelled.`,
        );
    }

    const sourceFingerprint = await getSkillFingerprint(source);

    if (sourceFingerprint === installedFingerprint) {
        return { status: "skipped" };
    }

    const workspace = await mkdtemp(
        join(dirname(skillsDirectory), ".orbit-skills-update-"),
    );

    const staged = join(workspace, "staged");
    const backup = join(workspace, "backup");

    await cp(source, staged, {
        recursive: true,
        force: false,
        errorOnExist: true,

        async filter(path) {
            const stat = await lstat(path);

            if (stat.isSymbolicLink()) {
                throw new Error(`Skill contains a symbolic link: "${path}".`);
            }

            return true;
        },
    });

    const stagedFingerprint = await getSkillFingerprint(staged);

    if (stagedFingerprint !== sourceFingerprint) {
        throw new Error(
            `Source changed or copying failed for "${skill.id}". Update cancelled.`,
        );
    }

    await writeInstallationMetadata(
        staged,
        skill.id,
        stagedFingerprint,
    );

    // Sprawdzamy ponownie tuż przed podmianą.
    const currentFingerprint =
        await getSkillFingerprint(destination);

    if (currentFingerprint !== installedFingerprint) {
        throw new Error(
            `Installed files changed during update of "${skill.id}". Update cancelled.`,
        );
    }

    await rename(destination, backup);

    try {
        await rename(staged, destination);
    } catch (error) {
        // Przywracamy backup tylko wtedy, gdy ścieżka jest nadal wolna.
        let destinationMissing = false;

        try {
            await lstat(destination);
        } catch (checkError) {
            if (
                checkError instanceof Error &&
                "code" in checkError &&
                checkError.code === "ENOENT"
            ) {
                destinationMissing = true;
            }
        }

        if (destinationMissing) {
            try {
                await rename(backup, destination);
            } catch (restoreError) {
                throw new Error(
                    `Update and restoration failed. Backup: "${backup}".`,
                    { cause: restoreError },
                );
            }
        }

        throw new Error(
            `Update failed. Recovery files: "${workspace}".`,
            { cause: error },
        );
    }

    return {
        status: "updated",
        backupPath: backup,
    };
}