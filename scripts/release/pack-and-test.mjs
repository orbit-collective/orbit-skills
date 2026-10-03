import { spawnSync } from "node:child_process";
import { spawnNpm } from "./npm.mjs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const destination = await mkdtemp(join(tmpdir(), "orbit-skills-pack-"));

try {
    const packed = spawnNpm(
        ["pack", "--pack-destination", destination],
        { encoding: "utf8" },
    );
    if (packed.error) throw packed.error;
    if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout);
    const tarballs = (await readdir(destination)).filter((path) => path.endsWith(".tgz"));
    if (tarballs.length !== 1) throw new Error("npm pack did not create exactly one tarball.");

    const tested = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("./test-tarball.mjs", import.meta.url)), join(destination, tarballs[0])],
        { encoding: "utf8", stdio: "inherit" },
    );
    if (tested.error) throw tested.error;
    if (tested.status !== 0) throw new Error(`Tarball smoke test failed with exit code ${tested.status}.`);
} finally {
    await rm(destination, { recursive: true, force: true });
}
