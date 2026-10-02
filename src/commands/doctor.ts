import { getAgentAdapter } from "../adapters/index.js";
import { clearAbandonedInstallationLock } from "../installation/lock.js";
import { inspectDoctor, type DoctorReport } from "../operations/doctor.js";
import { jsonDocument, writeJsonDocument } from "../output/json.js";
import { TerminalPresenter } from "../presentation/terminal.js";

interface DoctorOptions { agent: string; clearLock?: string; json?: boolean }

export async function diagnoseInstallation(options: DoctorOptions): Promise<DoctorReport> {
    const adapter = getAgentAdapter(options.agent);
    if (options.clearLock) await clearAbandonedInstallationLock(adapter, options.clearLock);
    const report = await inspectDoctor(adapter);
    if (options.json) {
        writeJsonDocument(jsonDocument("doctor", report));
        return report;
    }
    const presenter = new TerminalPresenter();
    presenter.header(`Diagnostics · ${report.agent.name}`);
    presenter.path(report.skillsDirectory, "Skills directory");
    if (options.clearLock) presenter.success(`Cleared abandoned lock ${options.clearLock}.`);
    presenter.paragraph(`Lock: ${report.lock.status}`);
    if (report.lock.owner) {
        presenter.paragraph(`Lock ID: ${report.lock.owner.lockId}`, "  ");
        presenter.paragraph(`PID: ${report.lock.owner.pid}`, "  ");
        presenter.paragraph(`Host: ${report.lock.owner.hostname}`, "  ");
        presenter.paragraph(`Started: ${report.lock.owner.startedAt}`, "  ");
        presenter.hint("Use --clear-lock with this exact ID only after the owner is proven inactive.");
    }
    if (report.lock.detail) presenter.warning(report.lock.detail);
    presenter.paragraph(`Update workspaces: ${report.workspaces.length}`);
    for (const workspace of report.workspaces) {
        presenter.path(workspace.path, "Workspace");
        presenter.paragraph(`Journal: ${workspace.journalStatus}`, "  ");
        if (workspace.transaction) {
            presenter.paragraph(`Skill: ${workspace.transaction.skillId}`, "  ");
            presenter.paragraph(`Phase: ${workspace.transaction.phase}`, "  ");
        }
        if (workspace.detail) presenter.warning(workspace.detail);
    }
    return report;
}
