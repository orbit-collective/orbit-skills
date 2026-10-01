import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
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