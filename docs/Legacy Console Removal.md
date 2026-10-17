# Legacy console removal

Phase 2 is complete: the legacy browser and terminal interfaces, console replay
viewer, dedicated tests, and viewer wiring have been removed. Harness replay data
and automated analysis remain intact. The Phase 1 record and deletion checklist
below are retained for reference.

## Phase 1 record

Phase 1 keeps both browser interfaces, the terminal combat client, and the console
replay viewer. No engine, content, build configuration, scripts, or runtime paths
change.

## Shared code separated

- `src/ui/web/app.ts` retains its graphical APIs: `createBattle`,
  `attachBattlePageLifecycle`, difficulty constants, and associated types.
  Console-only `startBattle` moved unchanged to `src/ui/console/app.ts`.
- `eventEntries` moved to `src/ui/presentation/eventEntries.ts`. Console formatting
  and test helpers now import it there.
- Only `numberedShortcut` moved to `src/ui/presentation/shortcuts.ts`. The graphical
  keyboard and console share it; console-specific choice mapping stays in console.
- `BattleObserver` moved to `src/ui/battleObserver.ts`. Telemetry no longer imports
  console controller types.
- The harness launcher uses its existing injected viewer dependency. Its concrete
  console import now lives in `src/harness/cli/launcher-main.ts`, which supplies it
  at startup. The launcher core and tests no longer import console code or types.

## Remaining legacy dependencies

The only production imports into `src/ui/console/` outside that directory are:

- `src/ui/web/main.ts` and `src/ui/web/view.ts`: the legacy browser interface.
- `src/harness/cli/launcher-main.ts`: viewer import and injected startup binding.
- `src/harness/cli/replay-csv-main.ts`: CSV-to-console-viewer entry.

No surviving source or test imports these legacy entries. The boundary test checks
local imports, including type imports, exports, and literal dynamic imports,
transitively across production code and surviving tests. The two harness CLI entries
are legacy composition points, not shared harness dependencies.

Replay capture, serialization, `FightReplay` and step/decision types remain in
`src/harness/harness.ts`. CSV parsing, replay reconstruction, release compatibility,
archives, replay sampling, policy diagnostics, batch runs, comparisons, and metrics
already live outside console and remain intact. The historical replay interface in
`console/replay.ts` is viewer-only; release reconstruction does not import it.

## Phase 2 deletion checklist

Delete:

- `src/ui/console/` in full, including the newly isolated `app.ts`.
- `src/ui/web/main.ts`, `src/ui/web/view.ts`, `src/ui/web/style.css`, and `console.html`.
- `src/harness/cli/replay-csv-main.ts` and the `replay:csv` package script (a viewer
  command; keep `src/harness/replay/posthog-replay.ts` and its tests).
- `tests/ui/console.test.ts`, `consoleApp.test.ts`, `controller.test.ts`,
  `presentation.test.ts`, and `replay.test.ts`.
- `tests/web/consoleEntry.test.ts` and `tests/web/view.test.ts`.

Remove only the replay integration from the surviving launcher: the import and
startup binding in `launcher-main.ts`; the optional `runConsoleReplay` dependency,
replay menu item/case, `runInteractiveReplay`, and then-unused `getThresholds`/
`FightReplay`/`ThresholdInfo` imports in `launcher.ts`; and the `replay launcher path`
describe block and its unused imports in `tests/harness/launcher.test.ts`. Preserve
all non-viewer launcher actions and tests. These are mechanical deletions.

Remove the console input from `vite.config.mts`; remove obsolete console assertions
from `tests/web/entries.test.ts` while retaining graphical/dev entry coverage.
Remove the stale `src/ui/web/main.ts` exclusions from `tsconfig.build.json` and
`tsconfig.test.json`. Generic source globs need no redesign. Update legacy exception
lists in the dependency tests as entries disappear. No build edits occur in Phase 1.

Keep `src/main.ts` (library inspection, not a terminal combat entry), the `start` and
`harness` scripts, `.vscode/launch.json`, replay runtime paths, all harness replay
modules/tests/fixtures, and shared presentation modules. Historical release runtimes
must continue loading `dist/harness/replay/posthog-replay.js` at the existing path.

No architectural blockers remain. The viewer-specific tests above must leave with
their implementation; the mixed entry/launcher tests need only the listed removals.
