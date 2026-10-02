import { getAgentAdapter } from "../adapters/index.js";
import { recoverUpdate } from "../installation/recover.js";
import { TerminalPresenter } from "../presentation/terminal.js";

interface RecoverOptions {
    agent: string;
    transaction: string;
}

export async function recoverInterruptedUpdate(options: RecoverOptions): Promise<void> {
    const adapter = getAgentAdapter(options.agent);
    const result = await recoverUpdate(adapter, options.transaction);
    const presenter = new TerminalPresenter();
    const messages = {
        completed: "Update completed.",
        "already-completed": "Update was already completed; no files were changed.",
        cancelled: "Update cancelled; the original installation remains in place.",
        restored: "Previous installation restored.",
    } as const;
    presenter.success(messages[result.outcome]);
    presenter.path(result.workspace, "Transaction");
}
