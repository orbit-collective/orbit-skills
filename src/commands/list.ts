import { jsonDocument, writeJsonDocument } from "../output/json.js";
import { packageVersion } from "../package-info.js";
import { TerminalPresenter } from "../presentation/terminal.js";
import { getAvailableSkills } from "../skills/catalog.js";

interface ListOptions { json?: boolean }

export async function listSkills(options: ListOptions = {}): Promise<void> {
    const skills = await getAvailableSkills();
    if (options.json) {
        writeJsonDocument(jsonDocument("list", { packageVersion, skills }));
        return;
    }
    const presenter = new TerminalPresenter();
    presenter.header("Available skills");
    if (skills.length === 0) {
        presenter.info("No skills are available yet.");
        return;
    }
    for (const skill of skills) {
        presenter.paragraph(`${skill.name} (${skill.id})`);
        presenter.paragraph(skill.description, "  ");
    }
    presenter.paragraph(`${skills.length} skill(s) available.`);
}
