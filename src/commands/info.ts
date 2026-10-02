import { jsonDocument, writeJsonDocument } from "../output/json.js";
import { TerminalPresenter } from "../presentation/terminal.js";
import { getSkillInfo, type SkillInfo } from "../skills/catalog.js";

interface InfoOptions { json?: boolean }

export async function showSkillInfo(
    skillId: string,
    options: InfoOptions = {},
): Promise<SkillInfo> {
    const info = await getSkillInfo(skillId);
    if (options.json) {
        writeJsonDocument(jsonDocument("info", { skill: info }));
        return info;
    }
    const presenter = new TerminalPresenter();
    presenter.header(`${info.name} (${info.id})`);
    presenter.paragraph(info.description, "  ");
    presenter.paragraph(`Use: ${info.usage}`, "  ");
    presenter.paragraph(`Resources: ${info.resources.length > 0 ? info.resources.join(", ") : "none"}`, "  ");
    presenter.paragraph(`Agents: ${info.supportedAgents.join(", ")}`, "  ");
    presenter.paragraph(`Package version: ${info.packageVersion}`, "  ");
    return info;
}
