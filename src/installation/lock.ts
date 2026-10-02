import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import type { AgentAdapter } from "../adapters/types.js";
import { packageName } from "../package-info.js";

export interface InstallationLockOwner {
    schemaVersion: 2;
    managedBy: string;
    lockId: string;
    pid: number;
    hostname: string;
    machineId: string | null;
    bootId: string | null;
    processStartTicks: string | null;
    startedAt: string;
    agentId: string;
}

function lockDirectoryFor(adapter: AgentAdapter): string {
    return join(dirname(adapter.getSkillsDirectory()), ".orbit-skills.lock");
}

function hasCode(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && error.code === code;
}

function isTimestamp(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isOwner(value: unknown): value is InstallationLockOwner {
    if (typeof value !== "object" || value === null) return false;
    const owner = value as Record<string, unknown>;
    return (
        owner.schemaVersion === 2 &&
        owner.managedBy === packageName &&
        typeof owner.lockId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(owner.lockId) &&
        typeof owner.pid === "number" &&
        Number.isSafeInteger(owner.pid) &&
        owner.pid > 0 &&
        typeof owner.hostname === "string" && owner.hostname.length > 0 &&
        (owner.machineId === null ||
            (typeof owner.machineId === "string" && /^[0-9a-f]{32}$/.test(owner.machineId))) &&
        (owner.bootId === null ||
            (typeof owner.bootId === "string" &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(owner.bootId))) &&
        (owner.processStartTicks === null ||
            (typeof owner.processStartTicks === "string" && /^[0-9]+$/.test(owner.processStartTicks))) &&
        isTimestamp(owner.startedAt) &&
        typeof owner.agentId === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(owner.agentId)
    );
}

function sameOwner(
    left: InstallationLockOwner,
    right: InstallationLockOwner,
): boolean {
    return (
        left.schemaVersion === right.schemaVersion &&
        left.managedBy === right.managedBy &&
        left.lockId === right.lockId &&
        left.pid === right.pid &&
        left.hostname === right.hostname &&
        left.machineId === right.machineId &&
        left.bootId === right.bootId &&
        left.processStartTicks === right.processStartTicks &&
        left.startedAt === right.startedAt &&
        left.agentId === right.agentId
    );
}

async function readBootId(): Promise<string | null> {
    try {
        const value = (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
            ? value
            : null;
    } catch (error) {
        if (hasCode(error, "ENOENT") || hasCode(error, "EACCES")) return null;
        throw error;
    }
}

async function readMachineId(): Promise<string | null> {
    for (const path of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
        try {
            const value = (await readFile(path, "utf8")).trim();
            if (/^[0-9a-f]{32}$/.test(value)) return value;
        } catch (error) {
            if (!hasCode(error, "ENOENT") && !hasCode(error, "EACCES")) throw error;
        }
    }
    return null;
}

async function readProcessStartTicks(pid: number): Promise<string | null> {
    let content: string;
    try {
        content = await readFile(`/proc/${pid}/stat`, "utf8");
    } catch (error) {
        if (hasCode(error, "ENOENT")) return null;
        throw new Error(
            `Cannot establish identity of process ${pid}; refusing lock recovery.`,
            { cause: error },
        );
    }

    const closingParenthesis = content.lastIndexOf(")");
    const fields = closingParenthesis < 0
        ? []
        : content.slice(closingParenthesis + 1).trim().split(/\s+/);
    const startTicks = fields[19];
    if (!startTicks || !/^[0-9]+$/.test(startTicks)) {
        throw new Error("Invalid process start identity; refusing lock recovery.");
    }
    return startTicks;
}

export async function readInstallationLock(
    adapter: AgentAdapter,
): Promise<InstallationLockOwner | null> {
    const lockDirectory = lockDirectoryFor(adapter);
    let directoryStat;
    try {
        directoryStat = await lstat(lockDirectory);
    } catch (error) {
        if (hasCode(error, "ENOENT")) return null;
        throw error;
    }
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
        throw new Error(`Installation lock is not a regular directory: "${lockDirectory}".`);
    }

    const ownerPath = join(lockDirectory, "owner.json");
    try {
        const ownerStat = await lstat(ownerPath);
        if (!ownerStat.isFile() || ownerStat.isSymbolicLink()) {
            throw new Error("Installation lock owner metadata is not a regular file.");
        }
        const value: unknown = JSON.parse(await readFile(ownerPath, "utf8"));
        if (!isOwner(value)) {
            throw new Error(
                "Installation lock uses invalid or legacy owner metadata; refusing automatic changes.",
            );
        }
        return value;
    } catch (error) {
        if (hasCode(error, "ENOENT")) {
            throw new Error(
                "Installation lock owner metadata is missing; refusing automatic changes.",
            );
        }
        if (error instanceof SyntaxError) {
            throw new Error("Installation lock owner metadata is invalid; refusing automatic changes.");
        }
        throw error;
    }
}

export async function clearAbandonedInstallationLock(
    adapter: AgentAdapter,
    expectedLockId: string,
): Promise<void> {
    const owner = await readInstallationLock(adapter);
    if (!owner) throw new Error("No installation lock exists.");
    if (owner.lockId !== expectedLockId) {
        throw new Error("Lock ID does not match; the lock may have changed.");
    }
    if (owner.agentId !== adapter.id) {
        throw new Error("The installation lock belongs to another agent.");
    }
    if (owner.hostname !== hostname()) {
        throw new Error("The installation lock belongs to another host; refusing removal.");
    }
    const machineId = await readMachineId();
    if (owner.machineId === null || machineId === null) {
        throw new Error("The machine identity is unavailable; refusing ambiguous lock removal.");
    }
    if (owner.machineId !== machineId) {
        throw new Error("The installation lock belongs to another machine; refusing removal.");
    }
    const bootId = await readBootId();
    if (owner.bootId === null || bootId === null) {
        throw new Error(
            "The operating-system boot identity is unavailable; refusing ambiguous lock removal.",
        );
    }
    if (owner.bootId === bootId) {
        const currentStartTicks = await readProcessStartTicks(owner.pid);
        if (owner.processStartTicks === null) {
            throw new Error("The lock has no process-start identity; refusing ambiguous removal.");
        }
        if (currentStartTicks === owner.processStartTicks) {
            throw new Error(`Installation lock owner process ${owner.pid} is active; refusing removal.`);
        }
    }

    const confirmed = await readInstallationLock(adapter);
    if (!confirmed || !sameOwner(confirmed, owner)) {
        throw new Error("Installation lock changed during recovery; refusing removal.");
    }
    await rm(lockDirectoryFor(adapter), { recursive: true, force: false });
}

export async function withInstallationLock<T>(
    adapter: AgentAdapter,
    operation: () => Promise<T>,
): Promise<T> {
    const parentDirectory = dirname(adapter.getSkillsDirectory());
    const lockDirectory = lockDirectoryFor(adapter);
    await mkdir(parentDirectory, { recursive: true });

    try {
        await mkdir(lockDirectory);
    } catch (error) {
        if (hasCode(error, "EEXIST")) {
            throw new Error(
                `Another installation operation may be running. Lock: "${lockDirectory}". ` +
                "Use doctor to inspect it; do not remove it based only on age or PID.",
            );
        }
        throw error;
    }

    let owner: InstallationLockOwner;
    try {
        const processStartTicks = await readProcessStartTicks(process.pid);
        owner = {
            schemaVersion: 2,
            managedBy: packageName,
            lockId: randomUUID(),
            pid: process.pid,
            hostname: hostname(),
            machineId: await readMachineId(),
            bootId: await readBootId(),
            processStartTicks,
            startedAt: new Date().toISOString(),
            agentId: adapter.id,
        };
        await writeFile(
            join(lockDirectory, "owner.json"),
            JSON.stringify(owner, null, 2) + "\n",
            { encoding: "utf8", flag: "wx" },
        );
    } catch (error) {
        await rm(lockDirectory, { recursive: true, force: true });
        throw error;
    }

    try {
        return await operation();
    } finally {
        const current = await readInstallationLock(adapter);
        if (!current || !sameOwner(current, owner)) {
            throw new Error(
                "Installation lock ownership changed; refusing to remove another owner's lock.",
            );
        }
        await rm(lockDirectory, { recursive: true, force: false });
    }
}
