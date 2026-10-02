import { lstat, mkdir } from "node:fs/promises";

export async function ensureRegularDirectory(
    path: string,
    create: boolean,
): Promise<void> {
    if (create) await mkdir(path, { recursive: true });
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`Path is not a regular directory or is a symbolic link: "${path}".`);
    }
}
