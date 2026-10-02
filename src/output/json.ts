export const JSON_SCHEMA_VERSION = 1 as const;

export interface JsonErrorDocument {
    readonly schemaVersion: 1;
    readonly command: string;
    readonly error: {
        readonly code: string;
        readonly message: string;
    };
}

export function jsonDocument<T extends object>(
    command: string,
    data: T,
): { readonly schemaVersion: 1; readonly command: string } & T {
    return { schemaVersion: JSON_SCHEMA_VERSION, command, ...data };
}

export function jsonErrorDocument(
    command: string,
    message: string,
    code = "COMMAND_FAILED",
): JsonErrorDocument {
    return {
        schemaVersion: JSON_SCHEMA_VERSION,
        command,
        error: { code, message },
    };
}

export function writeJsonDocument(value: unknown): void {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
