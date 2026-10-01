import { codexAdapter } from "./codex.js";
import type { AgentAdapter } from "./types.js";

const adapters: readonly AgentAdapter[] = [
    codexAdapter,
];

export function getAgentAdapter(agentId: string): AgentAdapter {
    const adapter = adapters.find(
        (candidate) => candidate.id === agentId,
    );

    if (!adapter) {
        const supported = adapters
            .map((candidate) => candidate.id)
            .join(", ");

        throw new Error(
            `Unsupported agent "${agentId}". Supported agents: ${supported}.`,
        );
    }

    return adapter;
}