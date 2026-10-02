#!/usr/bin/env node

import { Command, CommanderError } from "commander";
import { cleanupBackups } from "./commands/cleanup.js";
import { diagnoseInstallation } from "./commands/doctor.js";
import { showSkillInfo } from "./commands/info.js";
import { installSkills } from "./commands/install.js";
import { listSkills } from "./commands/list.js";
import { showSkillsPath } from "./commands/path.js";
import { recoverInterruptedUpdate } from "./commands/recover.js";
import { showSkillsStatus } from "./commands/status.js";
import { uninstallSkills } from "./commands/uninstall.js";
import { updateSkills } from "./commands/update.js";
import { runInteractiveMenu } from "./menu/menu.js";
import { inquirerPromptAdapter } from "./menu/prompts.js";
import { jsonErrorDocument, writeJsonDocument } from "./output/json.js";
import { packageVersion } from "./package-info.js";
import { TerminalPresenter } from "./presentation/terminal.js";

function createProgram(jsonRequested: boolean): Command {
    const program = new Command();
    program
        .name("orbit-skills")
        .description("Manage shared AI agent skills.")
        .version(packageVersion)
        .showHelpAfterError()
        .showSuggestionAfterError()
        .exitOverride()
        .configureOutput({
            writeErr: jsonRequested
                ? () => {}
                : (value) => process.stderr.write(value),
        });

    program
        .command("list")
        .description("List available skills.")
        .option("--json", "Write one versioned JSON document.")
        .action(async (options: { json?: boolean }) => {
            await listSkills(options);
        });

    program
        .command("path")
        .description("Show the skills installation directory.")
        .requiredOption("--agent <id>", "Target agent.")
        .action(showSkillsPath);

    program
        .command("install")
        .description("Install selected skills, or every available skill when none are named.")
        .argument("[skills...]", "Official skill IDs.")
        .requiredOption("--agent <id>", "Target agent.")
        .option("--dry-run", "Show the current plan without changing files.")
        .action(async (skills: string[], options: { agent: string; dryRun?: boolean }) => {
            await installSkills(skills, options);
        });

    program
        .command("status")
        .description("Compare installed skills with the package.")
        .requiredOption("--agent <id>", "Target agent.")
        .option("--json", "Write one versioned JSON document.")
        .action(async (options: { agent: string; json?: boolean }) => {
            await showSkillsStatus(options);
        });

    program
        .command("update")
        .description("Update selected skills, or every available skill when none are named.")
        .argument("[skills...]", "Official skill IDs.")
        .requiredOption("--agent <id>", "Target agent.")
        .option("--dry-run", "Show the current plan without changing files.")
        .action(async (skills: string[], options: { agent: string; dryRun?: boolean }) => {
            await updateSkills(skills, options);
        });

    program
        .command("uninstall")
        .description("Remove explicitly selected, managed skills.")
        .argument("<skills...>", "Official skill IDs to remove.")
        .requiredOption("--agent <id>", "Target agent.")
        .option("--dry-run", "Show the current plan without changing files.")
        .option("--force", "Remove local changes in only the selected managed skills.")
        .action(async (
            skills: string[],
            options: { agent: string; dryRun?: boolean; force?: boolean },
        ) => {
            await uninstallSkills(skills, options);
        });

    program
        .command("info")
        .description("Show catalog information for one official skill.")
        .argument("<skill>", "Official skill ID.")
        .option("--json", "Write one versioned JSON document.")
        .action(async (skill: string, options: { json?: boolean }) => {
            await showSkillInfo(skill, options);
        });

    program
        .command("doctor")
        .description("Inspect installation locks and update workspaces.")
        .requiredOption("--agent <id>", "Target agent.")
        .option("--clear-lock <lock-id>", "Clear a provably abandoned lock with this exact lock ID.")
        .option("--json", "Write one versioned JSON document.")
        .action(async (options: { agent: string; clearLock?: string; json?: boolean }) => {
            await diagnoseInstallation(options);
        });

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

    return program;
}

function commandName(args: readonly string[]): string {
    return args.find((argument) => !argument.startsWith("-")) ?? "orbit-skills";
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const jsonRequested = args.includes("--json");
    const program = createProgram(jsonRequested);

    if (args.length === 0) {
        if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
            await runInteractiveMenu({
                prompts: inquirerPromptAdapter,
                presenter: new TerminalPresenter(process.stdout),
            });
        } else {
            program.outputHelp();
        }
        return;
    }

    try {
        await program.parseAsync(process.argv);
    } catch (error) {
        if (
            error instanceof CommanderError &&
            (error.code === "commander.helpDisplayed" || error.code === "commander.version")
        ) {
            process.exitCode = error.exitCode;
            return;
        }
        const message = error instanceof Error ? error.message : "Unexpected error.";
        process.exitCode = error instanceof CommanderError ? error.exitCode : 1;
        if (jsonRequested) {
            writeJsonDocument(jsonErrorDocument(commandName(args), message));
        } else if (!(error instanceof CommanderError)) {
            process.stderr.write(`Error: ${message}\n`);
        }
    }
}

await main();
