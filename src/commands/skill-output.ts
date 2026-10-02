import {
    getSkillCommandExitCode,
    type SkillBatchResult,
    type SkillSummary,
} from "../operations/manage-skills.js";
import { TerminalPresenter } from "../presentation/terminal.js";

const summaryOrder = [
    "installed",
    "updated",
    "removed",
    "planned",
    "skipped",
    "conflict",
    "error",
] as const;

export function formatSkillSummary(summary: SkillSummary): string {
    return summaryOrder
        .filter((status) => (summary[status] ?? 0) > 0)
        .map((status) => `${summary[status]} ${status}`)
        .join(", ");
}

export function printSkillBatchResult(
    result: SkillBatchResult,
    presenter = new TerminalPresenter(),
): void {
    for (const item of result.items) {
        const verb = result.dryRun && item.status === "planned"
            ? `would-${item.action}`
            : item.status;
        const badge = item.status === "conflict"
            ? presenter.badge("conflict")
            : item.status === "error"
                ? presenter.badge("error")
                : presenter.badge(item.status);
        presenter.paragraph(`${item.skillId}: ${verb} ${badge}`);
        presenter.paragraph(item.message, "  ");
        presenter.path(item.destination, "Destination");
        if (item.backupPath) presenter.path(item.backupPath, "Backup");
    }
    let summary = formatSkillSummary(result.summary);
    if (result.dryRun) {
        const planned = new Map<string, number>();
        for (const item of result.items) {
            const label = item.status === "planned" ? `would-${item.action}` : item.status;
            planned.set(label, (planned.get(label) ?? 0) + 1);
        }
        summary = [...planned].map(([label, count]) => `${count} ${label}`).join(", ");
    }
    presenter.line();
    presenter.paragraph(`Summary: ${summary || "no skills selected"}.`);
    presenter.path(result.targetDirectory, "Skills directory");
}

export function applySkillCommandExitCode(summary: SkillSummary): void {
    if (getSkillCommandExitCode(summary) !== 0) process.exitCode = 1;
}
