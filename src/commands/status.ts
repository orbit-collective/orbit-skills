import { getAgentAdapter } from "../adapters/index.js";
import { jsonDocument, writeJsonDocument } from "../output/json.js";
import { inspectSkillsStatus, type StatusReport } from "../operations/status.js";
import { TerminalPresenter } from "../presentation/terminal.js";

interface StatusOptions { agent: string; json?: boolean }

export async function showSkillsStatus(options: StatusOptions): Promise<StatusReport> {
    const report = await inspectSkillsStatus(getAgentAdapter(options.agent));
    if (options.json) {
        writeJsonDocument(jsonDocument("status", report));
        return report;
    }
    const presenter = new TerminalPresenter();
    presenter.header(`Status · ${report.agent.name}`);
    for (const skill of report.skills) {
        presenter.paragraph(`${presenter.badge(skill.status)} ${skill.name} (${skill.id})`);
        if (skill.detail) presenter.paragraph(skill.detail, "  ");
        presenter.path(skill.destination, "Destination");
    }
    return report;
}
