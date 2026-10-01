import { readFileSync } from "node:fs";

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

export const packageVersion = packageJson.version;
export const packageName = "@orbit-collective/skills";