import { getAgentAdapter } from "../adapters/index.js";
import { manageSkills, type SkillBatchResult } from "../operations/manage-skills.js";
import { applySkillCommandExitCode, printSkillBatchResult } from "./skill-output.js";

interface InstallOptions {
    agent: string;
    dryRun?: boolean;
}

export async function installSkills(
    skillIds: readonly string[],
    options: InstallOptions,
): Promise<SkillBatchResult> {
    const result = await manageSkills("install", skillIds, getAgentAdapter(options.agent), {
        dryRun: options.dryRun,
    });
    printSkillBatchResult(result);
    applySkillCommandExitCode(result.summary);
    return result;
}
