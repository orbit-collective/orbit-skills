import { getAgentAdapter } from "../adapters/index.js";
import { manageSkills, type SkillBatchResult } from "../operations/manage-skills.js";
import { applySkillCommandExitCode, printSkillBatchResult } from "./skill-output.js";

interface UninstallOptions {
    agent: string;
    dryRun?: boolean;
    force?: boolean;
}

export async function uninstallSkills(
    skillIds: readonly string[],
    options: UninstallOptions,
): Promise<SkillBatchResult> {
    const result = await manageSkills("uninstall", skillIds, getAgentAdapter(options.agent), {
        dryRun: options.dryRun,
        force: options.force,
    });
    printSkillBatchResult(result);
    applySkillCommandExitCode(result.summary);
    return result;
}
