import {
    cp,
    lstat,
    mkdir,
    readFile,
    readdir,
    writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    getSkillFileUrl,
    type SkillDefinition,
} from "../skills/catalog.js";
import type { AgentAdapter } from "../adapters/types.js";

const OWNER = "@orbit-collective/skills";
const MARKER_FILE = ".orbit-skill.json";

type InstallResult = "installed" | "skipped";

function hasErrorCode(error: unknown, code: string): boolean {
    return (
        error instanceof Error &&
        "code" in error &&
        error.code === code
    );
}

async function isManagedSkill(
    directory: string,
    skillId: string,
): Promise<boolean> {
    try {
        const markerPath = join(directory, MARKER_FILE);
        const markerStat = await lstat(markerPath);

        if (!markerStat.isFile()) {
            return false;
        }

        const marker: unknown = JSON.parse(
            await readFile(markerPath, "utf8"),
        );

        return (
            typeof marker === "object" &&
            marker !== null &&
            "schemaVersion" in marker &&
            marker.schemaVersion === 1 &&
            "managedBy" in marker &&
            marker.managedBy === OWNER &&
            "skillId" in marker &&
            marker.skillId === skillId
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

    await mkdir(skillsDirectory, { recursive: true });

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

        return "skipped";
    }

    try {
        const entries = await readdir(source);

        for (const entry of entries) {
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

        await writeFile(
            join(destination, MARKER_FILE),
            JSON.stringify(
                {
                    schemaVersion: 1,
                    managedBy: OWNER,
                    skillId: skill.id,
                },
                null,
                2,
            ) + "\n",
            {
                encoding: "utf8",
                flag: "wx",
            },
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