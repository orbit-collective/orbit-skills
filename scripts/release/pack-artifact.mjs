import { spawnNpm } from "./npm.mjs";
import { mkdir, mkdtemp, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const parent = resolve(process.argv[2] ?? process.cwd());
await mkdir(parent, { recursive: true });
const destination = await mkdtemp(join(parent, "orbit-skills-release-"));
const result = spawnNpm(
    ["pack", "--pack-destination", destination],
    { encoding: "utf8" },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
const tarballs = (await readdir(destination)).filter((path) => path.endsWith(".tgz"));
if (tarballs.length !== 1) throw new Error("npm pack did not create exactly one tarball.");
process.stdout.write(`path=${resolve(destination, tarballs[0])}\n`);
