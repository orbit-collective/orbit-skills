import { getAgentAdapter } from "../adapters/index.js";
import { updateSkill } from "../installation/update-skill.js";
import { getAvailableSkills } from "../skills/catalog.js";
import { withInstallationLock } from "../installation/lock.js";

interface UpdateOptions {
    agent: string;
}

export async function updateSkillsUnlocked(
    options: UpdateOptions,
): Promise<void> {
    const adapter = getAgentAdapter(options.agent);
    const skills = await getAvailableSkills();

    if (skills.length === 0) {
        console.log("No skills available.");
        return;
    }

    for (const skill of skills) {
        const result = await updateSkill(skill, adapter);

        console.log(`${skill.id}: ${result.status}`);

        if (result.backupPath) {
            console.log(`  Backup: ${result.backupPath}`);
        }
    }
}

export async function updateSkills(
    options: UpdateOptions,
): Promise<void> {
    const adapter = getAgentAdapter(options.agent);

    await withInstallationLock(adapter, () =>
        updateSkillsUnlocked(options),
    );
}