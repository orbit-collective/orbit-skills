import { getSkillInfo, type SkillInfo } from "../skills/catalog.js";

export async function showSkillInfo(skillId: string): Promise<SkillInfo> {
    const info = await getSkillInfo(skillId);
    console.log(`ID: ${info.id}`);
    console.log(`Name: ${info.name}`);
    console.log(`Description: ${info.description}`);
    console.log(`Use: ${info.usage}`);
    console.log(`Resources: ${info.resources.length > 0 ? info.resources.join(", ") : "none"}`);
    console.log(`Agents: ${info.supportedAgents.join(", ")}`);
    console.log(`Package version: ${info.packageVersion}`);
    return info;
}
