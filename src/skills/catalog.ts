import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import type { AgentId } from "../adapters/types.js";
import { packageVersion } from "../package-info.js";

const SKILL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SKILL_IDS = new Set(["synced", "anthropic-skills"]);
const RESERVED_FILES = new Set([".orbit-skill.json"]);

export interface SkillDefinition {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly usage: string;
    readonly supportedAgents: readonly AgentId[];
    readonly resources: readonly string[];
}

export interface SkillInfo extends SkillDefinition {
    readonly packageVersion: string;
}

export type SkillOperation = "install" | "update" | "uninstall";

interface DeclaredSkill {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly usage: string;
    readonly supportedAgents: readonly AgentId[];
}

const declaredSkills: readonly DeclaredSkill[] = [
    {
        id: "document-feature",
        name: "Document Feature",
        description: "Write a step-by-step \"how do I extend X\" developer guide for a feature/extensibility point in this repo, in both documentation/en/ and documentation/pl/, following this project's established documentation format. Use whenever the user asks to document a feature, write a guide for something, or after building a genuinely new extensibility point per CLAUDE.md's \"## Documentation\" rule.",
        usage: "Use it to create or extend a bilingual, repository-specific developer guide after first inspecting that repository's documentation conventions.",
        supportedAgents: ["codex", "claude-code"],
    },
    {
        id: "review",
        name: "Review",
        description: "Review code changes in the Orbit repository (working tree, branch, or PR) and report confirmed bugs, regressions, and significant risks without editing code. Use for /review and for requests to review code or assess changes before merging.",
        usage: "Use it to review a working tree, branch, or PR in the Orbit repository and get prioritized, evidence-backed findings without any code being changed.",
        supportedAgents: ["codex", "claude-code"],
    },
    {
        id: "frontend-polish",
        name: "Frontend Polish",
        description: "Polish an existing Orbit screen or component for visual consistency, responsiveness, accessibility, and interaction quality. Use for /frontend-polish and for requests to improve the UI/UX or feel of an existing interface.",
        usage: "Use it to refine an existing Orbit page or component for consistency, accessibility, responsiveness, and interaction quality within the current design system.",
        supportedAgents: ["codex", "claude-code"],
    },
    {
        id: "cleanup",
        name: "Cleanup",
        description: "Clean up code in the Orbit repository within a defined scope without changing its behavior. Use for /cleanup and for requests to remove dead code, unused imports, redundant fragments, or outdated comments.",
        usage: "Use it to remove verified dead code, unused imports, and outdated comments in a defined scope of the Orbit repository without changing behavior.",
        supportedAgents: ["codex", "claude-code"],
    },
    {
        id: "fix-review",
        name: "Fix Review",
        description: "Fix findings from an Orbit code review (the review skill's P0-P3 output, PR review comments, or a pasted list) one at a time, each with a regression test and verification, without widening the scope. Use for /fix-review and for requests to address or apply review feedback.",
        usage: "Use it to apply findings from the review skill or PR review comments in the Orbit repository, one fix and regression test per finding.",
        supportedAgents: ["codex", "claude-code"],
    },
    {
        id: "extend-orbit",
        name: "Extend Orbit",
        description: "Extend Orbit by following its own step-by-step guides in documentation/en/ (permissions, notifications, integrations, automation, issue types, shortcuts, settings tabs, theme colors and more), so new code matches the established pattern and nothing in the checklist is missed. Use for /extend-orbit and whenever the user asks to add a new instance of an existing Orbit concept, such as a permission, notification type, integration, alert type, shortcut, or settings tab.",
        usage: "Use it to add a new instance of an existing Orbit extensibility point by following the matching guide in documentation/en/.",
        supportedAgents: ["codex", "claude-code"],
    },
    {
        id: "fix-ci",
        name: "Fix CI",
        description: "Diagnose and fix a failing Orbit CI run (type check, lint, Vitest with coverage, build, Pest with coverage) by reading the real logs, reproducing the failing job locally in Docker, and fixing the root cause. Use for /fix-ci and whenever the user says CI, a check, or a GitHub Actions job is red.",
        usage: "Use it to diagnose a failing Orbit CI run from its logs, reproduce the failing job in Docker, and fix the root cause without weakening checks.",
        supportedAgents: ["codex", "claude-code"],
    },
    {
        id: "deps-update",
        name: "Deps Update",
        description: "Review and land dependency updates in Orbit (Dependabot npm and Docker PRs, or a manual npm/composer update) by checking changelogs for breaking changes, running the full CI suite in Docker with fresh dependencies, and fixing or reporting incompatibilities. Use for /deps-update and for requests to handle Dependabot PRs or update packages.",
        usage: "Use it to assess Dependabot or manual dependency updates in Orbit, check changelogs for breaking changes, and verify them with the full CI suite.",
        supportedAgents: ["codex", "claude-code"],
    },
    {
        id: "create-pr",
        name: "Create PR",
        description: "Open a GitHub pull request for the branch that is currently checked out, covering every change on it against master. Runs the full CI suite locally first (the same jobs as .github/workflows/ci.yml), then writes a conventional-commit title and a fully filled-in .github/pull_request_template.md body in English. Use whenever the user asks to create, open, raise, or prepare a PR.",
        usage: "Use it to open an Orbit pull request after running the full CI suite locally, with a conventional-commit title and a filled-in PR template.",
        supportedAgents: ["codex", "claude-code"],
    },
    {
        id: "commit",
        name: "Commit",
        description: "Turn existing changes in the Orbit repository into small, logical commits following Orbit's Conventional Commit rules, with a checked staged diff and scope. Use for /commit and for requests to commit changes or split them into commits.",
        usage: "Use it to split existing Orbit changes into small, logical Conventional Commits with a checked staged diff, without pushing or rewriting history.",
        supportedAgents: ["codex", "claude-code"],
    },
    {
        id: "responsive-check",
        name: "Responsive Check",
        description: "Audit and fix the responsiveness of existing Orbit pages or components across viewport widths, browser zoom, and touch input. Use for /responsive-check and for requests to audit or improve layout on phones, tablets, and desktop.",
        usage: "Use it to audit or fix an Orbit page or component across viewport widths, zoom, and touch, with a report of what was actually checked.",
        supportedAgents: ["codex", "claude-code"],
    },
];

export function getSkillDirectoryUrl(skillId: string): URL {
    validateSkillId(skillId);
    return new URL(`../../skills/${skillId}/`, import.meta.url);
}

export function getSkillFileUrl(skillId: string): URL {
    return new URL("SKILL.md", getSkillDirectoryUrl(skillId));
}

function validateSkillId(skillId: string): void {
    if (!SKILL_ID_PATTERN.test(skillId)) {
        throw new Error(`Invalid skill ID: ${skillId}`);
    }
    if (RESERVED_SKILL_IDS.has(skillId)) {
        throw new Error(`Skill ID "${skillId}" is reserved by a supported agent.`);
    }
}

function parseRequiredFrontmatter(
    content: string,
    skillId: string,
): { name: string; description: string } {
    const lines = content.replaceAll("\r\n", "\n").split("\n");
    if (lines[0] !== "---") {
        throw new Error(`SKILL.md for "${skillId}" has no YAML frontmatter.`);
    }
    const end = lines.indexOf("---", 1);
    if (end < 0) {
        throw new Error(`SKILL.md for "${skillId}" has unclosed YAML frontmatter.`);
    }
    const document = parseDocument(lines.slice(1, end).join("\n"), {
        schema: "core",
        uniqueKeys: true,
    });
    if (document.errors.length > 0) {
        throw new Error(
            `SKILL.md for "${skillId}" has invalid YAML frontmatter: ${document.errors[0]?.message ?? "unknown YAML error"}`,
        );
    }
    const value: unknown = document.toJS({ maxAliasCount: 0 });
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`SKILL.md for "${skillId}" frontmatter must be a mapping.`);
    }
    const frontmatter = value as Record<string, unknown>;
    const name = frontmatter.name;
    const description = frontmatter.description;
    if (
        typeof name !== "string" || name.trim().length === 0 ||
        typeof description !== "string" || description.trim().length === 0
    ) {
        throw new Error(`SKILL.md for "${skillId}" requires non-empty name and description frontmatter.`);
    }
    return { name, description };
}

async function validateSkillSource(declared: DeclaredSkill): Promise<SkillDefinition> {
    validateSkillId(declared.id);
    if (declared.name.trim().length === 0 || declared.usage.trim().length === 0) {
        throw new Error(`Skill "${declared.id}" has incomplete catalog metadata.`);
    }
    if (declared.supportedAgents.length === 0) {
        throw new Error(`Skill "${declared.id}" supports no agents.`);
    }
    if (new Set(declared.supportedAgents).size !== declared.supportedAgents.length) {
        throw new Error(`Skill "${declared.id}" repeats a supported agent.`);
    }

    const sourceDirectory = fileURLToPath(getSkillDirectoryUrl(declared.id));
    const skillFile = join(sourceDirectory, "SKILL.md");
    let skillFileStat;
    let content: string;
    try {
        skillFileStat = await lstat(skillFile);
        content = await readFile(skillFile, "utf8");
    } catch (error) {
        throw new Error(`Cannot read SKILL.md for "${declared.id}".`, { cause: error });
    }
    if (!skillFileStat.isFile() || skillFileStat.isSymbolicLink()) {
        throw new Error(`SKILL.md for "${declared.id}" must be a regular file.`);
    }
    if (content.trim().length === 0) {
        throw new Error(`SKILL.md for "${declared.id}" is empty.`);
    }
    const closingFrontmatter = content.replaceAll("\r\n", "\n").indexOf("\n---", 4);
    if (closingFrontmatter < 0 || content.slice(closingFrontmatter + 4).trim().length === 0) {
        throw new Error(`SKILL.md for "${declared.id}" has no instructions after frontmatter.`);
    }
    const frontmatter = parseRequiredFrontmatter(content, declared.id);
    if (frontmatter.name !== declared.id) {
        throw new Error(`SKILL.md name for "${declared.id}" must match its catalog ID.`);
    }
    if (frontmatter.description !== declared.description) {
        throw new Error(`SKILL.md description for "${declared.id}" does not match the catalog.`);
    }

    const resources: string[] = [];
    async function walk(directory: string, relativeDirectory: string): Promise<void> {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const absolutePath = join(directory, entry.name);
            const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
            const stat = await lstat(absolutePath);
            if (stat.isSymbolicLink()) {
                throw new Error(`Skill "${declared.id}" contains symbolic link "${relativePath}".`);
            }
            if (RESERVED_FILES.has(entry.name) || /^\.orbit-skill-.*\.tmp$/.test(entry.name)) {
                throw new Error(`Skill "${declared.id}" contains reserved file "${relativePath}".`);
            }
            if (stat.isDirectory()) {
                await walk(absolutePath, relativePath);
            } else if (stat.isFile()) {
                if (relativePath !== "SKILL.md") resources.push(relativePath);
            } else {
                throw new Error(`Skill "${declared.id}" contains unsupported entry "${relativePath}".`);
            }
        }
    }
    await walk(sourceDirectory, "");
    resources.sort();
    return { ...declared, resources };
}

export async function getAvailableSkills(): Promise<readonly SkillDefinition[]> {
    const ids = new Set<string>();
    const result: SkillDefinition[] = [];
    for (const skill of declaredSkills) {
        if (ids.has(skill.id)) throw new Error(`Duplicate skill ID: ${skill.id}`);
        ids.add(skill.id);
        result.push(await validateSkillSource(skill));
    }
    return result;
}

export async function resolveSkillSelection(
    requestedIds: readonly string[],
    agentId: string,
    operation: SkillOperation,
): Promise<readonly SkillDefinition[]> {
    const skills = await getAvailableSkills();
    if (requestedIds.length === 0) {
        if (operation === "uninstall") {
            throw new Error("Uninstall requires at least one skill ID.");
        }
        return skills.filter((skill) => skill.supportedAgents.includes(agentId as AgentId));
    }
    const seen = new Set<string>();
    const byId = new Map(skills.map((skill) => [skill.id, skill]));
    const selected: SkillDefinition[] = [];
    for (const id of requestedIds) {
        validateSkillId(id);
        if (seen.has(id)) throw new Error(`Duplicate skill ID in selection: ${id}.`);
        seen.add(id);
        const skill = byId.get(id);
        if (!skill) throw new Error(`Unknown skill ID: ${id}.`);
        if (!skill.supportedAgents.includes(agentId as AgentId)) {
            throw new Error(`Skill "${id}" does not support agent "${agentId}".`);
        }
        selected.push(skill);
    }
    return selected;
}

export async function getSkillInfo(skillId: string): Promise<SkillInfo> {
    validateSkillId(skillId);
    const skill = (await getAvailableSkills()).find((candidate) => candidate.id === skillId);
    if (!skill) throw new Error(`Unknown skill ID: ${skillId}.`);
    return { ...skill, packageVersion };
}
