import { rename } from "node:fs/promises";
import { join } from "node:path";
import type { AgentAdapter } from "../adapters/types.js";
import { inspectInstallation } from "./inspect.js";
import { ensureRegularDirectory } from "./directory.js";
import { withInstallationLock } from "./lock.js";
import { readUpdateTransaction, writeUpdateTransaction } from "./transaction.js";
import { selectUpdateWorkspace } from "./workspace.js";

export type RecoveryOutcome = "completed" | "already-completed" | "cancelled" | "restored";

export interface RecoveryResult {
    outcome: RecoveryOutcome;
    workspace: string;
}

async function recoverUpdateUnlocked(
    adapter: AgentAdapter,
    transactionName: string,
): Promise<RecoveryResult> {
    const workspace = await selectUpdateWorkspace(adapter, transactionName);
    const transaction = await readUpdateTransaction(workspace);
    if (!transaction) {
        throw new Error("This update workspace has no transaction journal; manual inspection is required.");
    }
    if (transaction.agentId !== adapter.id) {
        throw new Error("The transaction belongs to another agent.");
    }
    if (transaction.phase === "completed") {
        return { outcome: "already-completed", workspace };
    }
    if (transaction.phase === "cancelled" || transaction.phase === "restored") {
        return { outcome: transaction.phase, workspace };
    }

    const destination = join(adapter.getSkillsDirectory(), transaction.skillId);
    const staged = join(workspace, "staged");
    const backup = join(workspace, "backup");
    const [destinationState, stagedState, backupState] = await Promise.all([
        inspectInstallation(destination, transaction.skillId),
        inspectInstallation(staged, transaction.skillId, transaction.targetFingerprint),
        inspectInstallation(backup, transaction.skillId, transaction.originalFingerprint),
    ]);

    if (
        destinationState.kind === "valid" &&
        destinationState.fingerprint === transaction.targetFingerprint
    ) {
        await writeUpdateTransaction(workspace, transaction, "completed");
        return { outcome: "completed", workspace };
    }

    if (
        destinationState.kind === "valid" &&
        destinationState.fingerprint === transaction.originalFingerprint &&
        backupState.kind === "missing"
    ) {
        await writeUpdateTransaction(workspace, transaction, "cancelled");
        return { outcome: "cancelled", workspace };
    }

    if (destinationState.kind !== "missing") {
        const reason = destinationState.kind === "invalid"
            ? destinationState.reason
            : "fingerprint does not match either transaction version";
        throw new Error(`Existing destination is unsafe (${reason}); refusing to overwrite it.`);
    }

    if (backupState.kind !== "valid") {
        const reason = backupState.kind === "invalid" ? backupState.reason : "backup is missing";
        throw new Error(`Cannot recover transaction because the verified original ${reason}.`);
    }

    if (stagedState.kind === "valid") {
        await ensureRegularDirectory(adapter.getSkillsDirectory(), true);
        await rename(staged, destination);
        try {
            await writeUpdateTransaction(workspace, transaction, "completed");
        } catch (error) {
            throw new Error(
                `The new installation is present at "${destination}", but completion could not be recorded. Run recover again.`,
                { cause: error },
            );
        }
        return { outcome: "completed", workspace };
    }

    await ensureRegularDirectory(adapter.getSkillsDirectory(), true);
    await rename(backup, destination);
    try {
        await writeUpdateTransaction(workspace, transaction, "restored");
    } catch (error) {
        throw new Error(
            `The previous installation was restored at "${destination}", but restoration could not be recorded. Run recover again.`,
            { cause: error },
        );
    }
    return { outcome: "restored", workspace };
}

export async function recoverUpdate(
    adapter: AgentAdapter,
    transactionName: string,
): Promise<RecoveryResult> {
    return withInstallationLock(adapter, () => recoverUpdateUnlocked(adapter, transactionName));
}
