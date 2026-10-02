import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentAdapter } from "./types.js";

export function createClaudeCodeAdapter(
    homeDirectory = homedir(),
): AgentAdapter {
    return {
        id: "claude-code",
        name: "Claude Code",

        getSkillsDirectory() {
            return join(homeDirectory, ".claude", "skills");
        },
    };
}

export const claudeCodeAdapter = createClaudeCodeAdapter();
