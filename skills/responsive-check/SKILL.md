---
name: responsive-check
description: Audit and fix the responsiveness of existing Orbit pages or components across viewport widths, browser zoom, and touch input. Use for /responsive-check and for requests to audit or improve layout on phones, tablets, and desktop.
---

# Responsive Check

Check the specified Orbit interface (Inertia.js + React/TypeScript + Tailwind) and find concrete layout problems or unreachable actions when the screen size changes. Keep the product's current style and features.

## Modes

- `audit`: check the screen and write a report. Do not change application files.
- `fix`: check the screen, fix the problems in scope, and verify again.
- If the user gave no mode, use `audit` unless they explicitly asked to fix responsiveness. State the chosen mode at the start.

## Scope and boundaries

- Read `CLAUDE.md` and check the Git state. Preserve the user's existing changes.
- Determine the page (`resources/js/Pages/**`), route, or component from the request and context. If the target is unclear, ask. Never audit the whole application by default.
- Do not change controllers, routes, Inertia props, the database schema, Policies, permissions, or business rules.
- Never remove information or features just to make a view fit. When changing a layout, keep access to the same data and actions.
- Use the existing CSS variables, Tailwind breakpoints, and components. Do not add libraries or a new layout system without a separate request.
- Do not create commits, PRs, or publish anything unless the user already asked for it. Use the `commit` skill when they do.

## Orbit layout facts

- Tailwind uses the **default breakpoints** (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536); `tailwind.config.js` does not override them.
- `md` (768px) is the main layout switch: below it the `Sidebar` becomes an off-canvas drawer (fixed, with an overlay and a hamburger button at the top left); from `md` up it sits in the layout.
- Intentional horizontal scroll containers already exist: `IssueBoard` (board columns), `IssueTable` (resizable columns via `useTableResizing`), `FilterBar`, `PageHeader`, `Pagination`, `NotificationFilterTabs`, `ShortcutHelpModal`. Scrolling inside these is expected; page-level horizontal overflow is not.
- Overlays: `Modal`/`ModalContext`, dropdowns positioned with `useFloatingDropdown`, `DatePickerOverlay`, `NotificationsPopup`, `MentionSuggestions`, `BulkActionBar`.
- Themes: dark and light via `data-theme` (`ThemeContext`), plus a user accent color (`AccentContext`).
- Global keyboard shortcuts come from `ShortcutContext`; touch users have no equivalent, so every shortcut-only action needs a visible control.

## Preparation

1. Review the layout, shared components, breakpoints, and the states relevant to the target. Identify the main user path.
2. If you have browser tools and the app is running (`composer dev` on :8000 or `make up`), look at the screen before changing anything and record a baseline for the problems you find. Use seeded data (`php artisan migrate:fresh --seed` only on a disposable database, never on the user's real `database/database.sqlite` without asking).
3. If you cannot run or view the app, analyze the code instead. Separate suspected problems from confirmed ones and state explicitly that no visual check was done.

## Check matrix

- Viewport widths in CSS pixels: **360, 390, 768, 1024, and 1440**, with realistic heights. Record the actual dimensions used.
- Also check just below and above the relevant breakpoints, at minimum **767/768** (sidebar switch) and **1023/1024**, plus any in-between size where the layout starts to break.
- Check landscape or low viewport height when it affects modals, the sidebar drawer, `BulkActionBar`, or other fixed/sticky elements.
- Check real browser zoom up to 200% if tools allow. Changing the viewport width or `deviceScaleFactor` is not equivalent to that test.
- Check both themes and representative data: long project, issue, label, and member names, unbroken strings (URLs, branch names), many items (board columns, table rows, labels on one issue), empty states, loading, and errors. Use seeders, factories, or test data; never touch production data.
- A viewport change tests layout, not a real phone. Note separately whether touch emulation or a physical device was used.

## Checklist

- Find unintended horizontal overflow and the element causing it. Check `min-width` of flex/grid children (`min-w-0` is often missing), long content, and fixed widths.
- Distinguish page overflow from intentional scrolling inside a table, board, or other container. Check that scrolling works and that actions stay reachable.
- Check clipping, overlapping elements, content order, label readability, and access to the full text of truncated values.
- Check the sidebar drawer (open, close, focus, overlay), page header, toolbars, `FilterBar`, forms, `IssueTable`, `IssueBoard`, issue detail panels, settings layouts, and pagination where they are in scope.
- Open modals, dropdowns, menus, date pickers, and tooltips. Check their position, scrolling, how to close them, and behavior at small heights.
- Check `fixed` and `sticky` elements: covered content, stacking (`z-*`), reaching the last items, and the space the navigation takes.
- Check keyboard use, focus visibility, and actions that work without hover. For touch, check target size and spacing and conflicts between gestures (board drag, column resizing) and scrolling.
- With a real device or suitable emulation, check forms with the on-screen keyboard open and safe-area insets. Do not count these as checked based on a desktop viewport.

## Fixes in fix mode

1. Fix the cause locally: size constraints, wrapping, layout, positioning, or scrolling of the right container.
2. Never mask problems with a global `overflow-x: hidden`. Use intentional clipping only where it does not hide content, focus, or actions.
3. Prefer fluid layout and the existing Tailwind breakpoints. Do not add a media query for every tested size, and avoid arbitrary breakpoint values.
4. Keep semantics, focus order, and component state when the layout changes. Avoid duplicating interactive elements for mobile and desktop.
5. When changing a shared component (Atoms/Molecules/Organisms), check its other relevant uses (`rg "<ComponentName"`). Do not extend the fix to unrelated screens.
6. If a fix needs a new product interaction or backend work, report the decision needed and continue with the other fixes in scope.

For broader visual polish beyond responsiveness, use the `frontend-polish` skill.

## Verification and report

- Recheck the fixed scenarios and neighboring sizes. Review the diff and run `npx tsc --noEmit`, `npx eslint resources/js`, and the relevant Vitest tests when interaction changes (or `make type-check`, `make test-js`).
- Report each finding by page or component, size/state, symptom, impact, and cause. In fix mode, add the fix and the result of the recheck.
- Give a table of the sizes and states actually checked with a result: OK, problem, or not checked. Never mark skipped checks as passed.
- Separate browser measurements and observations from conclusions drawn from code. Include screenshots only if you actually took them.
- If you found no problems, say that none were found in the checked scope. List the limitations, such as no physical device, no zoom test, or no on-screen keyboard.
