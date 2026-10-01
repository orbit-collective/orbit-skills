import { getAgentAdapter } from "../adapters/index.js";

interface PathOptions {
    agent: string;
}

export function showSkillsPath(options: PathOptions): void {
    const adapter = getAgentAdapter(options.agent);

    console.log(adapter.getSkillsDirectory());
}