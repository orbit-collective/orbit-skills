import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentAdapter } from "./types.js";

export const codexAdapter: AgentAdapter = {
    id: "codex",
    name: "Codex",

    getSkillsDirectory() {
        return join(homedir(), ".agents", "skills");
    },
};