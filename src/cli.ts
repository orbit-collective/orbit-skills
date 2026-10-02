#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { Command } from "commander";
import { listSkills } from "./commands/list.js";
import { showSkillsPath } from "./commands/path.js";
import { installSkills } from "./commands/install.js";
import { showSkillsStatus } from "./commands/status.js";
import { updateSkills } from "./commands/update.js";
import { diagnoseInstallation } from "./commands/doctor.js";
import { recoverInterruptedUpdate } from "./commands/recover.js";
import { cleanupBackups } from "./commands/cleanup.js";
import { uninstallSkills } from "./commands/uninstall.js";
import { showSkillInfo } from "./commands/info.js";
import { packageVersion } from "./package-info.js";

const packageJson: unknown = JSON.parse(
    readFileSync(
        new URL("../package.json", import.meta.url),
        "utf8",
    ),
);

if (
    typeof packageJson !== "object" ||
    packageJson === null ||
    !("version" in packageJson) ||
    typeof packageJson.version !== "string"
) {
    throw new Error("Missing or invalid version in package.json.");
}

const program = new Command();

program
    .name("orbit-skills")
    .description("Manage shared AI agent skills.")
    .version(packageVersion)
    .showHelpAfterError()
    .showSuggestionAfterError();

program
    .command("list")
    .description("List available skills.")
    .action(listSkills);

program
    .command("path")
    .description("Show the skills installation directory.")
    .requiredOption("--agent <id>", "Target agent.")
    .action(showSkillsPath);

program
    .command("install")
    .description(
        "Install selected skills, or every available skill when none are named.",
    )
    .argument("[skills...]", "Official skill IDs.")
    .requiredOption("--agent <id>", "Target agent.")
    .option("--dry-run", "Show the current plan without changing files.")
    .action(
        async (
            skills: string[],
            options: { agent: string; dryRun?: boolean },
        ) => {
            await installSkills(skills, options);
        },
    );

program
    .command("status")
    .description("Compare installed skills with the package.")
    .requiredOption("--agent <id>", "Target agent.")
    .action(showSkillsStatus);

program
    .command("update")
    .description(
        "Update selected skills, or every available skill when none are named.",
    )
    .argument("[skills...]", "Official skill IDs.")
    .requiredOption("--agent <id>", "Target agent.")
    .option("--dry-run", "Show the current plan without changing files.")
    .action(
        async (
            skills: string[],
            options: { agent: string; dryRun?: boolean },
        ) => {
            await updateSkills(skills, options);
        },
    );

program
    .command("uninstall")
    .description("Remove explicitly selected, managed skills.")
    .argument("<skills...>", "Official skill IDs to remove.")
    .requiredOption("--agent <id>", "Target agent.")
    .option("--dry-run", "Show the current plan without changing files.")
    .option("--force", "Remove local changes in only the selected managed skills.")
    .action(
        async (
            skills: string[],
            options: {
                agent: string;
                dryRun?: boolean;
                force?: boolean;
            },
        ) => {
            await uninstallSkills(skills, options);
        },
    );

program
    .command("info")
    .description("Show catalog information for one official skill.")
    .argument("<skill>", "Official skill ID.")
    .action(async (skill: string) => {
        await showSkillInfo(skill);
    });

program
    .command("doctor")
    .description("Inspect installation locks and update workspaces.")
    .requiredOption("--agent <id>", "Target agent.")
    .option("--clear-lock <lock-id>", "Clear a provably abandoned lock with this exact lock ID.")
    .action(diagnoseInstallation);

program
    .command("recover")
    .description("Recover one interrupted update transaction.")
    .requiredOption("--agent <id>", "Target agent.")
    .requiredOption("--transaction <name>", "Exact update workspace name shown by doctor.")
    .action(recoverInterruptedUpdate);

program
    .command("cleanup")
    .description("Remove verified backups from completed updates.")
    .requiredOption("--agent <id>", "Target agent.")
    .option("--dry-run", "Show what would be removed without changing files.")
    .option("--keep <count>", "Keep this many newest verified backups.", "3")
    .action(cleanupBackups);

program.action(() => {
    program.help();
});

try {
    await program.parseAsync();
} catch (error) {
    const message =
        error instanceof Error ? error.message : "Unexpected error.";

    console.error(`Error: ${message}`);
    process.exitCode = 1;
}
