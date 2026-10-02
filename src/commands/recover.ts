import { getAgentAdapter } from "../adapters/index.js";
import { recoverUpdate } from "../installation/recover.js";

interface RecoverOptions {
    agent: string;
    transaction: string;
}

export async function recoverInterruptedUpdate(options: RecoverOptions): Promise<void> {
    const adapter = getAgentAdapter(options.agent);
    const result = await recoverUpdate(adapter, options.transaction);
    const messages = {
        completed: "Update completed.",
        "already-completed": "Update was already completed; no files were changed.",
        cancelled: "Update cancelled; the original installation remains in place.",
        restored: "Previous installation restored.",
    } as const;
    console.log(messages[result.outcome]);
    console.log(`Transaction: ${result.workspace}`);
}
