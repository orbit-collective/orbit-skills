import { lstat } from "node:fs/promises";
import { getSkillFingerprint } from "./fingerprint.js";
import { readInstallationMetadata } from "./metadata.js";

export type InstallationState =
    | { kind: "missing" }
    | { kind: "valid"; fingerprint: string }
    | { kind: "invalid"; reason: string };

export async function inspectInstallation(
    path: string,
    skillId: string,
    expectedFingerprint?: string,
): Promise<InstallationState> {
    let stat;
    try {
        stat = await lstat(path);
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return { kind: "missing" };
        }
        throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
        return { kind: "invalid", reason: "not a regular directory" };
    }
    const metadata = await readInstallationMetadata(path, skillId);
    if (!metadata) return { kind: "invalid", reason: "invalid or missing ownership metadata" };

    let fingerprint: string;
    try {
        fingerprint = await getSkillFingerprint(path);
    } catch (error) {
        return {
            kind: "invalid",
            reason: error instanceof Error ? error.message : "cannot fingerprint contents",
        };
    }
    if (metadata.fingerprint !== fingerprint) {
        return { kind: "invalid", reason: "contents differ from the installation baseline" };
    }
    if (expectedFingerprint && fingerprint !== expectedFingerprint) {
        return { kind: "invalid", reason: "fingerprint does not match the transaction" };
    }
    return { kind: "valid", fingerprint };
}
