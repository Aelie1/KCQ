# KCQ Project State

**Updated:** 2026-10-16  
**Repository:** `Aelie1/KCQ`  
**Source reviewed:** current `master` repository files and `docs/Patch Notes.md`  
**Latest documented release:** **0.17.0 — 2026-10-16**  
**Status:** Current-state reference and 1.0 planning baseline; not a substitute for live repository code or tests.

## 1. Authority and scope

Use, in descending order: (1) current repository and tests for implemented behavior, (2) `docs/Game Rules.md` for stable mechanics, (3) this status document for direction and goals, (4) planning boards, and (5) older design notes and conversations. Repository documentation may lag implementation. `package.json` version metadata is not the KCQ gameplay/release version.

This update reflects the **0.17.0 patch notes**, direct inspection of current UI, Library, and character source files, and the creator's **2026-10-16 decisions**. Release notes verify what has been documented in the repository; the exact currently deployed GitHub Pages tag was not verified. Do not equate `master` automatically with the public deployed version.

## 2. Identity and near-term objective

**Ko-chan's Quest (KCQ)** is a reboot of BQuest focused on a deterministic, tactically meaningful turn-based combat game. It deliberately separates engine behavior from presentation and automated clients. Avoiding an auto-attack simulator remains a core design goal.

**Current explicit 1.0 target (creator decision, 2026-10-16):**

1. Author an in-game **Game Guide**, with the creator writing the prose.
2. Implement **Naruyo and Sakari** as playable characters, completing the intended five-character roster.
3. Stabilize and release **1.0** as a complete tactical-combat foundation.

The goal is a bounded stopping point, **not** a promise to implement every historically imagined mechanic. This is a target, not work already completed. Character selection and changes to fixed-party assumptions may be required as the roster expands; implementation details remain to be decided.

## 3. Current implementation snapshot

### Playable content

- **Three implemented characters:** Ko-chan, Matsuko, Hinari. This was confirmed against `src/content/characters/ko.ts`, `matsuko.ts`, and `hinari.ts`.
- **Naruyo and Sakari are not implemented playable characters yet**; they are the immediate roster goal.
- Existing character kits include Ko-chan's Telekinesis, Starlight Bindings, Reflect, Fairy Transformation/Empowerment and Power of Denial; Matsuko's White Flame, Phoenix Kick, Immolation and Compulsions; Hinari's Rockfall, Store, Brace, Release, and **Power of Space**.
- **Ten combat encounters:** three Plains (`plains_1`–`plains_3`), three Forest (`forest_1`–`forest_3`), three Tower (`tower_1`–`tower_3`), and Outside Realm (`outside`). These span standard encounters, bosses, and deliberately extreme challenge scenarios.
- **Five difficulties:** Casual, Standard, Veteran, Extreme, Mythic. The 0.15 release reduced enemy Potency from +2 to +1 for Veteran and Extreme; Mythic retains +2. Extreme/Mythic also enable encounter/enemy-specific mechanics.

### Game flow and presentation

- Browser-playable graphical interface with the legacy console client separately available (`console.html`).
- Graphical title screen; campaign selection; encounter picker/details; difficulty selection; battle; story and result screens.
- **0.15 delivered a lightweight connected story/progression path** for *Latex Skunk Attacks!*: Prologue, three Interludes, Epilogue, narrative encounter introductions, victory/defeat scenes, encounter unlocking, and Next Level navigation. The picker has **Show All**, allowing direct scenario selection without forced progression.
- Local best-clear records and encounter unlocks persist across browser sessions.
- **0.16 added automatic save/resume for active battles**, including Continue and delete-save controls and incompatible/corrupted-save handling.
- **0.17 added dedicated one-, two-, and three-column battle layouts.** Two-column views keep character and enemy/command information side by side. Three-column views add a persistent independently scrollable Game Log. Responsive layout preserves the compact mobile interface.
- Layout settings include automatic/manual column counts, compact/expanded enemy cards, stored preferences, and reset-to-defaults controls. Expanded enemy cards show complete intentions, per-target projections, and HP meters.
- Graphical battle views include character and enemy details, command selection, targeting, Escape/Assist, previews, intentions, bindings, status/effect information, and combat logs.
- Combat playback, visual feedback, result summaries, keyboard shortcuts, and configurable presentation settings are implemented.

### Library and authoring

- **0.15 added the in-game Library** with reference categories: Difficulties, Characters, Enemies, Moves, Passives, Bindings, Traps, and Statuses; it supports references and links between entries.
- **0.17 added a desktop-oriented Library** with persistent navigation and a content pane, while preserving compact navigation on smaller screens.
- Current source locations: `src/ui/web/app/panels/LibraryPanel.tsx` renders the Library; `src/ui/web/app/viewModels/library.ts` defines existing categories, pages, navigation, and reference behavior; `src/engine/public/library.ts` contains the sanitized combat reference types.
- **A prose Game Guide is not yet an implemented category in the inspected Library model.** It is part of the 1.0 goal.
- Proposed five guide topics: **Getting Started**, **Combat Basics**, **Bindings and Escaping**, **Character Abilities**, **Advanced Mechanics**.
- **Authoring decision:** the creator wants to write the guide text personally; Codex may integrate/layout the finished content. Avoid building an elaborate MDX/tutorial framework as a prerequisite. Prefer small, reusable existing in-game components where illustrations help, with modest engineering scope.

## 4. Story progression versus abandoned campaign expansion

**Important distinction:** the repo's 0.15 story/unlock progression is *already implemented* and should not be described as missing or retroactively removed. However, on 2026-10-16 the creator explicitly said they have **abandoned the larger campaign-structure feature** because of negative reception.

For planning purposes:

- Keep the **existing lightweight story scenes, encounter unlocking, Show All, and Next Level behavior** as the currently shipped state unless later changed.
- **Do not propose a deeper connected campaign/carryover system as a 1.0 requirement.** In particular, persistent cross-battle resources, mandatory linear gauntlets, inter-fight recovery/economy, or new campaign frameworks are **not** assumed roadmap commitments.
- Existing `docs/Campaign + Meta Progression Design.md` is **historical/deferred ideation**, not an active plan that overrides this decision.
- Exact scope of what might be removed or retained from current 0.15 story progression has **not** been specified; do not infer that implemented story screens are to be deleted.

## 5. Engine and API architecture

- TypeScript deterministic engine; seeded RNG; combat rules, validation, action resolution, turn phases, statuses, bindings, enemy intentions, and win/loss evaluation remain engine responsibilities.
- UIs, harness policies, replays, and other consumers use public engine state, action views, previews, events, and sanitized metadata rather than duplicating private combat logic.
- The reference Library exposes safe definitions of combat content through the public library layer. The game's presentation/localization layer resolves IDs to player-facing strings. English remains the bundled language described by the release notes.
- The engine preserves causal event relationships: action → target results and corresponding changes; traps and triggered effects remain attached to causes. This supports playback, diagnostics, and replays.
- Special-case content such as Skunk effects belongs in content definitions; prefer generic engine support only when a concrete new character or encounter genuinely needs it.

## 6. Key current combat rules

The latest inspected `docs/Game Rules.md` remains the human-readable mechanics reference, but its header still cites an older September 24 source baseline. Verify against current code/tests before revising exact mechanics.

- One primary action per character per player phase, with exceptions including special free actions, bonus escapes, and action refreshes.
- Attacks may Miss, Graze, Hit, or Critically Hit; outcomes scale damage and similar effects. Defensive stats, attack type, Potency/Vulnerability, and Willpower checks can change outcomes.
- Bindings are numeric meters with increasingly restrictive severity bands. Escaping is deterministic; assisting is ordinarily stronger than self-escaping.
- Moving may trigger encounter traps. Standing avoids normal movement-trap checks during attacks/escapes and can grant an extra escape but carries a Defense penalty.
- Enemies commit intentions in advance; players can alter their ultimate outcomes through defensive/status changes, cancellation, or retargeting.
- Player move cooldowns, statuses, immunities, and temporary effects can restrict or alter available actions.

## 7. Simulation, balance, telemetry, and replay

- Determinism and reproducibility remain first-class constraints. Previews, diagnostics, rendering, and telemetry must not change combat RNG outcomes.
- Automated harness policies: **idle**, **basic**, **escape**, **smart**. Basic is deliberately naive offense, Escape adds a simple recovery heuristic, and Smart is a full-kit tactical reference, not a perfect human emulator or optimal solver.
- Harness supports large deterministic batches, policy comparisons, combat metrics, replay capture and sampling, and investigation of unusual seeds/fights.
- Anonymous browser gameplay telemetry collects reconstructable action/run information rather than general browsing behavior. Replay and telemetry are useful for external playtests, regression investigation, and balance analysis.
- The guiding balance question remains whether special moves, binding recovery, enemy intentions, and tactical tradeoffs matter. A hard encounter reliably beaten by blindly repeating simple attacks is a design warning.
- Do **not** return to an endless project of creating a perfect human-performance simulator. Maintain Smart as practical test infrastructure while advancing content.

## 8. Release milestones since the old status document

| Release | Date | Principal change |
|---|---|---|
| 0.11.x | Oct 5–6 | Graphical combat baseline, usability and effect-preview improvements |
| 0.12.x | Oct 6 onward | Graphical encounter/difficulty selection and shared screen layout improvements |
| 0.13.0 | Oct 8 | Title screen, campaign selector, graphical battle results |
| 0.14.0 | Oct 9 | Game Log overhaul, targeting improvements |
| 0.15.0 | Oct 14 | Story/unlocks, persistent clears, Library, enemy inspection, animations, keyboard controls, Hinari Power of Space, balance updates |
| 0.16.0 | Oct 14 | Automatic battle save/resume |
| 0.17.0 | Oct 16 | One/two/three-column desktop combat layouts and desktop Library |

`docs/Patch Notes.md` is authoritative for the details of each release; this document records their overall significance.

## 9. Current priorities and explicit non-priorities

### Immediate path toward 1.0

1. **Game Guide:** creator-authored text for five short reference/tutorial pages, integrated into the current Library and ideally illustrated with existing battle UI elements where useful.
2. **Naruyo:** implement a distinctive, worthwhile fifth-roster combat role (one of two new characters). Design actual mechanics before adding generic framework features.
3. **Sakari:** implement a distinct combat role complementary to the rest of the party.
4. **Integration and release readiness:** update selection/party assumptions as required, presentation/localization data, Library references, harness policy handling, balance tests, and UI flows for the new roster. Verify that new content has meaningful decisions and that existing encounters still behave as intended.
5. **Cut 1.0** once the above is coherent, rather than endlessly expanding the goalposts.

### Not part of this 1.0 commitment

- A new deep campaign/encounter-carryover framework or mandatory sequential gauntlet.
- Full Castle content; generalized binding spread/locks or advanced traps merely for possible future use.
- Super Skills, Double/Triple Techs, or a broad meta-progression framework.
- Another wholesale UI redesign or new documentation framework unless a concrete blocking problem demands it.
- A theoretically optimal Smart policy or another open-ended balance-harness initiative.

## 10. Documentation maintenance and verification notes

- **Supersede older `KCQ Project State.md` assumptions** that still identify 0.11.0 as current and treat graphical selection/results, Library, save/resume, enemy inspection, and desktop UI as future work.
- The `docs/Game Rules.md` baseline header is old; the 0.15 difficulty tuning also makes its earlier Veteran/Extreme +2 statement outdated. Confirm all numerical rules in code/tests before updating the rules document.
- `docs/Campaign + Meta Progression Design.md` currently describes a future campaign layer. Label it abandoned/deferred or clearly historical rather than treating it as active 1.0 scope.
- A few historical design principles remain valid: preserve engine/UI boundaries, determinism, replayability, transparent combat decisions, content-driven generic mechanics, and the willingness to stop polishing once a coherent version is ready.
- This document **does not claim** that 1.0 tasks are implemented or that the 0.17 tag is the currently deployed public version.

## 11. Snapshot conclusion

As of **October 16, 2026**, KCQ is a substantially functional browser tactical-combat game, with battle presentation, story framing, reference Library, persistent progress, save/resume, and adaptable desktop/mobile interfaces. The game remains at a **three-character playable roster**. The intended near-term finishing line is now unusually clear: **write the guide, implement Naruyo and Sakari, and release 1.0**. Treat earlier ambitions for a much larger campaign layer as historical planning, not unfinished obligations.
