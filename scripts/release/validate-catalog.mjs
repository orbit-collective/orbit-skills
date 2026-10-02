import { getAvailableSkills } from "../../dist/skills/catalog.js";

const skills = await getAvailableSkills();
if (skills.length === 0) throw new Error("The official skill catalog is empty.");
process.stdout.write(`Validated ${skills.length} official skill(s).\n`);

