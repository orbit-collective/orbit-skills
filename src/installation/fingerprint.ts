import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

interface FileFingerprint {
    path: string;
    hash: string;
}

export async function getSkillFingerprint(
    directory: string,
): Promise<string> {
    const root = await lstat(directory);

    if (!root.isDirectory()) {
        throw new Error(`Not a regular directory: "${directory}".`);
    }

    const files: FileFingerprint[] = [];

    async function walk(
        currentDirectory: string,
        relativeDirectory: string,
    ): Promise<void> {
        const entries = await readdir(currentDirectory, {
            withFileTypes: true,
        });

        for (const entry of entries) {
            // Pomijamy tylko oznaczenie w głównym folderze skilla.
            if (
                relativeDirectory === "" &&
                entry.name === ".orbit-skill.json"
            ) {
                continue;
            }

            const absolutePath = join(currentDirectory, entry.name);

            const relativePath = relativeDirectory
                ? `${relativeDirectory}/${entry.name}`
                : entry.name;

            if (entry.isDirectory()) {
                await walk(absolutePath, relativePath);
            } else if (entry.isFile()) {
                const content = await readFile(absolutePath);

                files.push({
                    path: relativePath,
                    hash: createHash("sha256")
                        .update(content)
                        .digest("hex"),
                });
            } else {
                throw new Error(
                    `Unsupported file or symbolic link: "${absolutePath}".`,
                );
            }
        }
    }

    await walk(directory, "");

    files.sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );

    return createHash("sha256")
        .update(JSON.stringify(files))
        .digest("hex");
}