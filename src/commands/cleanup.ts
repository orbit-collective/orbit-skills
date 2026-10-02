import { getAgentAdapter } from "../adapters/index.js";
import { cleanupUpdateBackups } from "../installation/cleanup.js";
import { TerminalPresenter } from "../presentation/terminal.js";

interface CleanupOptions {
    agent: string;
    dryRun?: boolean;
    keep: string;
}

export async function cleanupBackups(options: CleanupOptions): Promise<void> {
    const keep = Number(options.keep);
    const adapter = getAgentAdapter(options.agent);
    const result = await cleanupUpdateBackups(adapter, {
        dryRun: options.dryRun ?? false,
        keep,
    });
    const presenter = new TerminalPresenter();
    if (result.removable.length === 0) {
        presenter.info("No verified completed backups are eligible for cleanup.");
        return;
    }
    if (options.dryRun) {
        for (const item of result.removable) {
            presenter.path(item.workspace, "Would remove");
        }
    } else {
        for (const workspace of result.removed) {
            presenter.path(workspace, "Removed");
        }
    }
    if (options.dryRun) presenter.info("Dry run: no files were changed.");
}
