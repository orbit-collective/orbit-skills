---
name: frontend-polish
description: Polish an existing Orbit screen or component for visual consistency, responsiveness, accessibility, and interaction quality. Use for /frontend-polish and for requests to improve the UI/UX or feel of an existing interface.
---

# Frontend Polish

Refine the specified Orbit interface (Inertia.js + React/TypeScript + Tailwind) within the existing design system. Make changes that help users complete their current tasks more easily.

## Boundaries

- Keep the product's current style, features, and data semantics. Do not redesign the whole application.
- Edit the specified page or component and the frontend pieces it strictly needs. Do not expand the scope to other modules.
- Do not change controllers, routes, Inertia prop shapes, the database, business rules, Policies, or permissions. Work with the props and contracts that already exist.
- Do not add dependencies, a new component library, or a new icon set without a separate request. Icons come from `lucide-react` via `Components/Atoms/Icon`; overlays use the existing `Modal`/`useFloatingDropdown` patterns and `@headlessui/react` already in the project.
- Do not implement actions the backend does not support. Never show fake success or fake progress.
- Do not create commits, PRs, or publish anything unless the user already asked for it. When they do, use the `commit` and `create-pr` skills.
- Preserve the user's existing changes and follow `CLAUDE.md`.

## Process

1. Read `CLAUDE.md`, check the Git state, and identify the target page (`resources/js/Pages/**`) or component (`resources/js/Components/{Atoms,Molecules,Organisms}/**`). If no target is given, use the unambiguous context of the current task; otherwise ask for one.
2. Review the components, styles, CSS variables in `resources/css/global.css`, existing states, and similar screens. Check where a shared component is used (`rg "<ComponentName"`) so a change does not break other views.
3. If you have access to the running app (`composer dev` on :8000 or `make up`) and browser tools, look at the screen before changing it. Record a baseline and try the main interaction. Never claim a visual audit based on code alone.
4. Pick concrete problems in scope: usability obstacles, accessibility, and inconsistent states first, visual details second. Briefly describe the planned fixes, then implement them within the request.
5. Make small changes using existing components, `cva` variants, `cn()` from `@/utils/cn`, and CSS variables. Avoid editing `global.css` when the fix can be scoped to the view.
6. Verify the result visually and functionally if tools allow. Review the diff and run the relevant project checks.

## Areas to check

Check only what applies to the target interface.

### Visual consistency

- Keep the product's spacing rhythm, type hierarchy, colors, icon sizes, and button patterns. Prefer existing Atoms (`Button`, `IconButton`, `Badge`, `Input`, …) over ad-hoc markup.
- Fix alignment, label readability, and long-content behavior. Provide access to the full text when it is truncated (e.g. `title` or a tooltip pattern already used in the project).
- Check both themes: Orbit supports dark and light via `data-theme` (`ThemeContext`) and the user-selectable accent (`AccentContext`). Use the CSS variables (`bg-[var(--bg-color)]`, `text-[var(--text-gray-color)]`, `border-[var(--border-color)]`, `var(--accent-color)`, …) instead of hardcoded colors.
- Do not add decorations, gradients, or animations purely for effect.

### States and messages

- Check loading, empty, error, success, and disabled states using existing signals (Inertia `processing`, `errors`, `AlertContext`).
- Fit the empty state to the situation: "no data yet" and "no results for these filters" must be distinguishable. Reuse `EmptyStateCard` where it fits.
- Keep entered data after an error (Inertia `useForm` keeps it by default — do not reset it). Show the cause and an available next action when the contract allows it.
- Limit layout shift while loading. Prevent double submission of an in-flight action (e.g. disable on `processing`).
- Do not introduce optimistic updates without a supported error path and state rollback. Remember mutations redirect back and Inertia re-renders with fresh props.

### Interactions and accessibility

- Check hover, focus-visible, active, and disabled. Never convey information only through color or hover.
- Use semantic elements, accessible names, form labels (`FormField`), and correct error associations (`aria-describedby`, `aria-invalid`).
- Keep a logical Tab order and keyboard support. For dialogs, check focus entry, focus trapping, Escape, and focus return to the trigger, following the existing `Modal`/`ModalContext` pattern.
- Never remove a visible focus indicator. Avoid conflicts with the global shortcuts registered through `ShortcutContext` (see `ShortcutHelpModal` for the current list).
- Check contrast in both themes and comfortable click/touch targets.
- Respect `prefers-reduced-motion` (Tailwind `motion-reduce:`). Keep animations short and never delay the action.

### Responsiveness and performance

- Check narrow and wide viewports and text zoom. For a full breakpoint matrix (360 to 1440, zoom, touch), use the `responsive-check` skill. Match breakpoints to the layout's existing Tailwind breakpoints and `Sidebar` behavior.
- Check overflow, long project/issue/label names, many items (boards, tables, member lists), and that important actions are reachable without hover.
- Avoid extra network requests (e.g. unnecessary `router.reload`), expensive effects, and unjustified memoization. Base optimization on a concrete problem.

## Verification

- Check the main user path, keyboard use, relevant states, both themes, and screen sizes.
- Review the other usages of a shared component if the fix can affect them.
- Run `npx tsc --noEmit`, `npm run lint`, and the relevant Vitest tests (`npx vitest run <path>`), or `make type-check`, `make lint`, `make test-js` in Docker. Keep the frontend coverage gate in `vite.config.js` in mind.
- Add or update a colocated `*.test.tsx` (Testing Library) only for a meaningful interaction change; do not write tests that copy CSS values.
- If no browser is available or the app does not run, do the code-level verification you can and clearly state that visual verification was not done. Never claim the screen looks correct.

## Final report

List the most important fixes and how they affect using the screen, the changed files, the checks you ran, and limitations. Include a before/after comparison only if you actually captured one. Report problems that need backend work or a larger design effort separately.
