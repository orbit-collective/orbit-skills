import {
    getSkillCommandExitCode,
    type SkillBatchResult,
    type SkillSummary,
} from "../operations/manage-skills.js";

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

export function printSkillBatchResult(result: SkillBatchResult): void {
    for (const item of result.items) {
        const verb = result.dryRun && item.status === "planned"
            ? `would-${item.action}`
            : item.status;
        console.log(`${item.skillId}: ${verb}`);
        console.log(`  ${item.message}`);
        console.log(`  Destination: ${item.destination}`);
        if (item.backupPath) console.log(`  Backup: ${item.backupPath}`);
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
    console.log(`\nSummary: ${summary || "no skills selected"}.`);
    console.log(`Skills directory: ${result.targetDirectory}`);
}

export function applySkillCommandExitCode(summary: SkillSummary): void {
    if (getSkillCommandExitCode(summary) !== 0) process.exitCode = 1;
}
