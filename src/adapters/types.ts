export interface AgentAdapter {
    readonly id: string;
    readonly name: string;

    getSkillsDirectory(): string;
}