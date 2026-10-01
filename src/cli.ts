#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { Command } from "commander";
import { listSkills } from "./commands/list.js";

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
    .version(packageJson.version)
    .showHelpAfterError()
    .showSuggestionAfterError();

program
    .command("list")
    .description("List available skills.")
    .action(listSkills);

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