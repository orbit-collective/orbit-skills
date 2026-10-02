import type { SkillDefinition } from "../skills/catalog.js";

export interface SkillSelectionState {
    readonly skills: readonly SkillDefinition[];
    readonly selectedIds: ReadonlySet<string>;
    readonly query: string;
}

export function createSkillSelectionState(
    skills: readonly SkillDefinition[],
    selectedIds: readonly string[] = [],
): SkillSelectionState {
    const known = new Set(skills.map((skill) => skill.id));
    return {
        skills,
        selectedIds: new Set(selectedIds.filter((id) => known.has(id))),
        query: "",
    };
}

export function filterSkillSelection(
    state: SkillSelectionState,
): readonly SkillDefinition[] {
    const query = state.query.trim().toLocaleLowerCase();
    if (query.length === 0) return state.skills;
    return state.skills.filter((skill) =>
        skill.id.toLocaleLowerCase().includes(query) ||
        skill.name.toLocaleLowerCase().includes(query)
    );
}

export function applyVisibleSelection(
    state: SkillSelectionState,
    visibleSelectedIds: readonly string[],
): SkillSelectionState {
    const visible = new Set(filterSkillSelection(state).map((skill) => skill.id));
    const selected = new Set(
        [...state.selectedIds].filter((id) => !visible.has(id)),
    );
    for (const id of visibleSelectedIds) {
        if (visible.has(id)) selected.add(id);
    }
    return { ...state, selectedIds: selected };
}
