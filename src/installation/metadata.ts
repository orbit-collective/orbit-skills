import { randomUUID } from "node:crypto";
import {
    readFile,
    rename,
    rm,
    writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { packageName, packageVersion } from "../package-info.js";

export interface InstallationMetadata {
    schemaVersion: 1;
    managedBy: string;
    skillId: string;
    packageVersion: string;
    fingerprint: string;
}

export async function writeInstallationMetadata(
    directory: string,
    skillId: string,
    fingerprint: string,
): Promise<void> {
    const metadata: InstallationMetadata = {
        schemaVersion: 1,
        managedBy: packageName,
        skillId,
        packageVersion,
        fingerprint,
    };

    const temporaryPath = join(
        directory,
        `.orbit-skill-${randomUUID()}.tmp`,
    );

    const destination = join(directory, ".orbit-skill.json");

    try {
        await writeFile(
            temporaryPath,
            JSON.stringify(metadata, null, 2) + "\n",
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

export async function readInstallationMetadata(
    directory: string,
    skillId: string,
): Promise<InstallationMetadata | null> {
    const value: unknown = JSON.parse(
        await readFile(
            join(directory, ".orbit-skill.json"),
            "utf8",
        ),
    );

    if (
        typeof value !== "object" ||
        value === null ||
        !("schemaVersion" in value) ||
        value.schemaVersion !== 1 ||
        !("managedBy" in value) ||
        value.managedBy !== packageName ||
        !("skillId" in value) ||
        value.skillId !== skillId ||
        !("packageVersion" in value) ||
        typeof value.packageVersion !== "string" ||
        !("fingerprint" in value) ||
        typeof value.fingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.fingerprint)
    ) {
        return null;
    }

    return {
        schemaVersion: 1,
        managedBy: value.managedBy,
        skillId: value.skillId,
        packageVersion: value.packageVersion,
        fingerprint: value.fingerprint,
    };
}