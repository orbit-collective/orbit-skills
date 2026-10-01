import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentAdapter } from "../adapters/index.js";
import { getSkillFingerprint } from "../installation/fingerprint.js";
import { isManagedSkill } from "../installation/install-skill.js";
import { readInstallationMetadata } from "../installation/metadata.js";
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

        const metadata = await readInstallationMetadata(
            destination,
            skill.id,
        );

        if (!metadata) {
            console.log(`${skill.id}: installation baseline unavailable`);
            continue;
        }

        const source = fileURLToPath(
            new URL(".", getSkillFileUrl(skill.id)),
        );

        const sourceFingerprint = await getSkillFingerprint(source);
        const installedFingerprint =
            await getSkillFingerprint(destination);

        const locallyModified =
            installedFingerprint !== metadata.fingerprint;

        const updateAvailable =
            sourceFingerprint !== metadata.fingerprint;

        let status: string;

        if (locallyModified && updateAvailable) {
            status = "locally modified; update available";
        } else if (locallyModified) {
            status = "locally modified";
        } else if (updateAvailable) {
            status = "update available";
        } else {
            status = "up to date";
        }

        console.log(`${skill.id}: ${status}`);
    }
}