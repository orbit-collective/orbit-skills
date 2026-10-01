import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentAdapter } from "../adapters/index.js";
import { getSkillFingerprint } from "../installation/fingerprint.js";
import { isManagedSkill } from "../installation/install-skill.js";
import {
    getAvailableSkills,
    getSkillFileUrl,
} from "../skills/catalog.js";

interface StatusOptions {
    agent: string;
}

async function pathExists(path: string): Promise<boolean> {
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

export async function showSkillsStatus(
    options: StatusOptions,
): Promise<void> {
    const adapter = getAgentAdapter(options.agent);
    const skills = await getAvailableSkills();

    if (skills.length === 0) {
        console.log("No skills available.");
        return;
    }

    for (const skill of skills) {
        const destination = join(
            adapter.getSkillsDirectory(),
            skill.id,
        );

        if (!(await pathExists(destination))) {
            console.log(`${skill.id}: not installed`);
            continue;
        }

        const destinationStat = await lstat(destination);

        if (
            !destinationStat.isDirectory() ||
            !(await isManagedSkill(destination, skill.id))
        ) {
            console.log(`${skill.id}: unmanaged`);
            continue;
        }

        const source = fileURLToPath(
            new URL(".", getSkillFileUrl(skill.id)),
        );

        const sourceFingerprint = await getSkillFingerprint(source);
        const installedFingerprint =
            await getSkillFingerprint(destination);

        const status =
            sourceFingerprint === installedFingerprint
                ? "up to date"
                : "different";

        console.log(`${skill.id}: ${status}`);
    }
}