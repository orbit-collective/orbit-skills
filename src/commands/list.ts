import { getAvailableSkills } from "../skills/catalog.js";

export async function listSkills(): Promise<void> {
    const skills = await getAvailableSkills();

    if (skills.length === 0) {
        console.log("No skills available yet.");
        return;
    }

    console.log("Available skills:\n");

    for (const skill of skills) {
        console.log(`${skill.id} — ${skill.name}`);
        console.log(`  ${skill.description}\n`);
    }

    console.log(`${skills.length} skill(s) available.`);
}