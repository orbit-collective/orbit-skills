import { readFile } from "node:fs/promises";

export interface SkillDefinition {
    readonly id: string;
    readonly name: string;
    readonly description: string;
}

const skills: readonly SkillDefinition[] = [
    {
        id: "document-feature",
        name: "Document Feature",
        description: "Document an Orbit feature using project conventions.",
    },
];

export function getSkillFileUrl(skillId: string): URL {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillId)) {
        throw new Error(`Invalid skill ID: ${skillId}`);
    }

    return new URL(
        `../../skills/${skillId}/SKILL.md`,
        import.meta.url,
    );
}

export async function getAvailableSkills(): Promise<
    readonly SkillDefinition[]
> {
    const ids = new Set<string>();

    for (const skill of skills) {
        if (ids.has(skill.id)) {
            throw new Error(`Duplicate skill ID: ${skill.id}`);
        }

        ids.add(skill.id);

        let content: string;

        try {
            content = await readFile(getSkillFileUrl(skill.id), "utf8");
        } catch (error) {
            throw new Error(
                `Cannot read SKILL.md for "${skill.id}".`,
                { cause: error },
            );
        }

        if (content.trim().length === 0) {
            throw new Error(`SKILL.md for "${skill.id}" is empty.`);
        }
    }

    return skills;
}