import { randomUUID } from "node:crypto";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { packageName, packageVersion } from "../package-info.js";

export type TransactionPhase =
    | "preparing"
    | "prepared"
    | "committing"
    | "completed"
    | "cancelled"
    | "restored";

export interface UpdateTransaction {
    schemaVersion: 1;
    managedBy: string;
    packageVersion: string;
    agentId: string;
    skillId: string;
    originalFingerprint: string;
    targetFingerprint: string;
    createdAt: string;
    updatedAt: string;
    phase: TransactionPhase;
}

interface CreateTransactionOptions {
    agentId: string;
    skillId: string;
    originalFingerprint: string;
    targetFingerprint: string;
}

export function createUpdateTransaction(
    options: CreateTransactionOptions,
): UpdateTransaction {
    const now = new Date().toISOString();

    return {
        schemaVersion: 1,
        managedBy: packageName,
        packageVersion,
        ...options,
        createdAt: now,
        updatedAt: now,
        phase: "preparing",
    };
}

export async function writeUpdateTransaction(
    workspace: string,
    transaction: UpdateTransaction,
    phase: TransactionPhase,
): Promise<void> {
    const temporaryPath = join(
        workspace,
        `.transaction-${randomUUID()}.tmp`,
    );

    const destination = join(workspace, "transaction.json");

    const nextTransaction: UpdateTransaction = {
        ...transaction,
        phase,
        updatedAt: new Date().toISOString(),
    };

    try {
        await writeFile(
            temporaryPath,
            JSON.stringify(nextTransaction, null, 2) + "\n",
            {
                encoding: "utf8",
                flag: "wx",
            },
        );

        await rename(temporaryPath, destination);
    } finally {
        await rm(temporaryPath, { force: true });
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isFingerprint(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isIdentifier(value: unknown): value is string {
    return (
        typeof value === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    );
}

function isTimestamp(value: unknown): value is string {
    if (typeof value !== "string") {
        return false;
    }

    const timestamp = Date.parse(value);

    return (
        Number.isFinite(timestamp) &&
        new Date(timestamp).toISOString() === value
    );
}

function isTransactionPhase(value: unknown): value is TransactionPhase {
    return (
        value === "preparing" ||
        value === "prepared" ||
        value === "committing" ||
        value === "completed" ||
        value === "cancelled" ||
        value === "restored"
    );
}

export async function readUpdateTransaction(
    workspace: string,
): Promise<UpdateTransaction | null> {
    let content: string;

    try {
        const stat = await lstat(join(workspace, "transaction.json"));
        if (!stat.isFile() || stat.isSymbolicLink()) {
            throw new Error("Update transaction journal is not a regular file or is a symbolic link.");
        }
        content = await readFile(
            join(workspace, "transaction.json"),
            "utf8",
        );
    } catch (error) {
        if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
        ) {
            return null;
        }

        throw error;
    }

    const value: unknown = JSON.parse(content);

    if (
        !isRecord(value) ||
        value.schemaVersion !== 1 ||
        value.managedBy !== packageName ||
        typeof value.packageVersion !== "string" ||
        value.packageVersion.trim().length === 0 ||
        !isIdentifier(value.agentId) ||
        !isIdentifier(value.skillId) ||
        !isFingerprint(value.originalFingerprint) ||
        !isFingerprint(value.targetFingerprint) ||
        !isTimestamp(value.createdAt) ||
        !isTimestamp(value.updatedAt) ||
        !isTransactionPhase(value.phase) ||
        Date.parse(value.updatedAt) < Date.parse(value.createdAt)
    ) {
        throw new Error("Invalid update transaction.");
    }

    return {
        schemaVersion: 1,
        managedBy: value.managedBy,
        packageVersion: value.packageVersion,
        agentId: value.agentId,
        skillId: value.skillId,
        originalFingerprint: value.originalFingerprint,
        targetFingerprint: value.targetFingerprint,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        phase: value.phase,
    };
}
