import { getAgentAdapter } from "../adapters/index.js";
import { cleanupUpdateBackups } from "../installation/cleanup.js";

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
    if (result.removable.length === 0) {
        console.log("No verified completed backups are eligible for cleanup.");
        return;
    }
    if (options.dryRun) {
        for (const item of result.removable) {
            console.log(`Would remove: ${item.workspace}`);
        }
    } else {
        for (const workspace of result.removed) {
            console.log(`Removed: ${workspace}`);
        }
    }
    if (options.dryRun) console.log("Dry run: no files were changed.");
}
