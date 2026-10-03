import { spawnSync } from "node:child_process";

// Node refuses to spawn .cmd files without a shell (EINVAL on Windows), so run
// npm's JS entry point with the current Node binary when it is known.
export function spawnNpm(args, options) {
    const npmCli = process.env.npm_execpath;
    if (npmCli && /\.c?js$/.test(npmCli)) {
        return spawnSync(process.execPath, [npmCli, ...args], options);
    }
    return spawnSync("npm", args, { ...options, shell: process.platform === "win32" });
}
