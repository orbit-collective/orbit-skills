import { getAgentAdapter } from "../adapters/index.js";
import { installSkill } from "../installation/install-skill.js";
import { getAvailableSkills } from "../skills/catalog.js";
import { withInstallationLock } from "../installation/lock.js";

interface InstallOptions {
    agent: string;
}

export async function installSkillsUnlocked(
    options: InstallOptions,
): Promise<void> {
    const adapter = getAgentAdapter(options.agent);
    const skills = await getAvailableSkills();

    if (skills.length === 0) {
        console.log("No skills available to install.");
        return;
    }

    console.log(`Installing skills for ${adapter.name}...\n`);

    for (const skill of skills) {
        const result = await installSkill(skill, adapter);

        console.log(`${skill.id}: ${result}`);
    }

    console.log(`\nSkills directory: ${adapter.getSkillsDirectory()}`);
}

export async function installSkills(
    options: InstallOptions,
): Promise<void> {
    const adapter = getAgentAdapter(options.agent);

    await withInstallationLock(adapter, () =>
        installSkillsUnlocked(options),
    );
}