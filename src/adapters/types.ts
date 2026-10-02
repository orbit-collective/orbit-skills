export type AgentId = "codex" | "claude-code";

export interface AgentAdapter {
    readonly id: AgentId;
    readonly name: string;

    getSkillsDirectory(): string;
}
