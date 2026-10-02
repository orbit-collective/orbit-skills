import {
    cp,
    lstat,
    mkdir,
    readFile,
    readdir,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    getSkillFileUrl,
    type SkillDefinition,
} from "../skills/catalog.js";
import type { AgentAdapter } from "../adapters/types.js";
import { packageName } from "../package-info.js";
import { getSkillFingerprint } from "./fingerprint.js";
import { ensureRegularDirectory } from "./directory.js";
import {
    readInstallationMetadata,
    writeInstallationMetadata,
} from "./metadata.js";

const MARKER_FILE = ".orbit-skill.json";

type InstallResult = "installed" | "skipped";

function hasErrorCode(error: unknown, code: string): boolean {
    return (
        error instanceof Error &&
        "code" in error &&
        error.code === code
    );
}

export async function isManagedSkill(
    directory: string,
    skillId: string,
): Promise<boolean> {
    try {
        const markerPath = join(directory, MARKER_FILE);
        const stat = await lstat(markerPath);
        if (!stat.isFile() || stat.isSymbolicLink()) return false;
        const value: unknown = JSON.parse(await readFile(markerPath, "utf8"));
        return (
            typeof value === "object" &&
            value !== null &&
            "schemaVersion" in value &&
            value.schemaVersion === 1 &&
            "managedBy" in value &&
            value.managedBy === packageName &&
            "skillId" in value &&
            value.skillId === skillId
        );
    } catch (error) {
        if (hasErrorCode(error, "ENOENT") || error instanceof SyntaxError) {
            return false;
        }

        throw error;
    }
}

export async function installSkill(
    skill: SkillDefinition,
    adapter: AgentAdapter,
): Promise<InstallResult> {
    const source = fileURLToPath(
        new URL(".", getSkillFileUrl(skill.id)),
    );

    const skillsDirectory = adapter.getSkillsDirectory();
    const destination = join(skillsDirectory, skill.id);

    await ensureRegularDirectory(skillsDirectory, true);

    try {
        await mkdir(destination);
    } catch (error) {
        if (!hasErrorCode(error, "EEXIST")) {
            throw error;
        }

        const destinationStat = await lstat(destination);

        if (
            !destinationStat.isDirectory() ||
            !(await isManagedSkill(destination, skill.id))
        ) {
            throw new Error(
                `Installation conflict at "${destination}". No files were changed.`,
            );
        }

        const metadata = await readInstallationMetadata(destination, skill.id);

        if (!metadata) {
            throw new Error(
                `Installation baseline unavailable for "${skill.id}". ` +
                "Existing files were left unchanged.",
            );
        }

        const sourceFingerprint = await getSkillFingerprint(source);
        const installedFingerprint =
            await getSkillFingerprint(destination);

        if (installedFingerprint !== metadata.fingerprint) {
            throw new Error(
                `Skill "${skill.id}" has local changes. ` +
                "Installation files and metadata were left unchanged.",
            );
        }

        if (sourceFingerprint !== installedFingerprint) {
            throw new Error(
                `Skill "${skill.id}" differs from the package. ` +
                "Installation files and metadata were left unchanged.",
            );
        }

        return "skipped";
    }

    try {
        const entries = await readdir(source);

        for (const entry of entries) {
            if (
                entry === MARKER_FILE ||
                /^\.orbit-skill-.*\.tmp$/.test(entry)
            ) {
                throw new Error(
                    `Skill source contains reserved file "${entry}".`,
                );
            }
            await cp(
                join(source, entry),
                join(destination, entry),
                {
                    recursive: true,
                    force: false,
                    errorOnExist: true,

                    async filter(path) {
                        const stat = await lstat(path);

                        if (stat.isSymbolicLink()) {
                            throw new Error(
                                `Skill contains a symbolic link: "${path}".`,
                            );
                        }

                        return true;
                    },
                },
            );
        }

        const sourceFingerprint = await getSkillFingerprint(source);
        const installedFingerprint =
            await getSkillFingerprint(destination);

        if (sourceFingerprint !== installedFingerprint) {
            throw new Error(
                `Copied files for "${skill.id}" do not match the source.`,
            );
        }

        await writeInstallationMetadata(
            destination,
            skill.id,
            installedFingerprint,
        );
    } catch (error) {
        throw new Error(
            `Installation failed at "${destination}". ` +
            "The folder may contain incomplete files; inspect it before retrying.",
            { cause: error },
        );
    }

    return "installed";
}
