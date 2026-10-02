import ora from "ora";
import picocolors from "picocolors";
import { packageVersion } from "../package-info.js";
import type { InstallationStatus } from "../operations/status.js";

export type TerminalOutput = NodeJS.WritableStream & {
    readonly isTTY?: boolean;
    readonly columns?: number;
};

const WIDE_BANNER = "\n".repeat(99) + [
    "   ██████╗ ██████╗ ██████╗ ██╗████████╗",
    "  ██╔═══██╗██╔══██╗██╔══██╗██║╚══██╔══╝",
    "  ██║   ██║██████╔╝██████╔╝██║   ██║",
    "  ██║   ██║██╔══██╗██╔══██╗██║   ██║",
    "  ╚██████╔╝██║  ██║██████╔╝██║   ██║",
    "   ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝   ╚═╝",
    "",
    "           ✦  S K I L L S  ✦",
    "",
].join("\n");

function hardWrapWord(word: string, width: number): string[] {
    const result: string[] = [];
    for (let index = 0; index < word.length; index += width) {
        result.push(word.slice(index, index + width));
    }
    return result;
}

export function wrapPlainText(
    text: string,
    width: number,
    indent = "",
): string {
    const available = Math.max(10, width - indent.length);
    const lines: string[] = [];
    let current = "";
    for (const paragraph of text.split("\n")) {
        for (const originalWord of paragraph.split(/\s+/).filter(Boolean)) {
            for (const word of hardWrapWord(originalWord, available)) {
                if (current.length === 0) current = word;
                else if (current.length + word.length + 1 <= available) {
                    current += ` ${word}`;
                } else {
                    lines.push(indent + current);
                    current = word;
                }
            }
        }
        if (current.length > 0) {
            lines.push(indent + current);
            current = "";
        }
    }
    return lines.join("\n");
}

export class TerminalPresenter {
    readonly output: TerminalOutput;
    readonly interactive: boolean;
    readonly colorEnabled: boolean;
    readonly colors: ReturnType<typeof picocolors.createColors>;
    private bannerShown = false;

    constructor(output: TerminalOutput = process.stdout) {
        this.output = output;
        this.interactive = output.isTTY === true;
        this.colorEnabled = this.interactive && process.env.NO_COLOR === undefined;
        this.colors = picocolors.createColors(this.colorEnabled);
    }

    get width(): number {
        return Math.max(24, this.output.columns ?? 80);
    }

    write(value: string): void {
        this.output.write(value);
    }

    line(value = ""): void {
        this.write(`${value}\n`);
    }

    banner(): void {
        if (this.bannerShown) return;
        this.bannerShown = true;
        if (this.width < 60) {
            this.line(this.colors.bold(this.colors.magenta("Orbit Skills")));
        } else {
            this.line(this.colors.bold(this.colors.magenta(WIDE_BANNER)));
        }
        this.line(this.colors.dim(`Skills · v${packageVersion}`));
        this.line();
    }

    header(title: string): void {
        this.line(this.colors.bold(this.colors.magenta(title)));
    }

    paragraph(text: string, indent = ""): void {
        this.line(wrapPlainText(text, this.width, indent));
    }

    hint(text: string): void {
        this.paragraph(this.colors.dim(text));
    }

    path(path: string, label = "Path"): void {
        this.paragraph(`${label}: ${path}`, "  ");
    }

    badge(status: InstallationStatus | "installed" | "updated" | "removed" | "skipped" | "error" | "planned"): string {
        const label = status.replaceAll("-", " ").toUpperCase();
        const badge = `[${label}]`;
        switch (status) {
            case "up-to-date":
            case "installed":
            case "updated":
            case "removed":
                return this.colors.green(badge);
            case "update-available":
            case "planned":
                return this.colors.blue(badge);
            case "locally-modified":
                return this.colors.yellow(badge);
            case "conflict":
            case "error":
                return this.colors.red(badge);
            default:
                return this.colors.dim(badge);
        }
    }

    status(status: InstallationStatus): void {
        this.line(this.badge(status));
    }

    success(message: string): void {
        this.paragraph(`${this.colors.green("✓")} ${message}`);
    }

    warning(message: string): void {
        this.paragraph(`${this.colors.yellow("!")} ${message}`);
    }

    error(message: string): void {
        this.paragraph(`${this.colors.red("×")} ${message}`);
    }

    info(message: string): void {
        this.paragraph(`${this.colors.blue("i")} ${message}`);
    }

    async runWithSpinner<T>(
        label: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        if (!this.interactive) return operation();
        const spinner = ora({
            text: label,
            stream: this.output,
            color: this.colorEnabled ? "blue" : false,
            isEnabled: true,
            discardStdin: false,
        }).start();
        try {
            const result = await operation();
            spinner.succeed(label);
            return result;
        } catch (error) {
            spinner.fail(label);
            throw error;
        } finally {
            if (spinner.isSpinning) spinner.stop();
        }
    }
}
