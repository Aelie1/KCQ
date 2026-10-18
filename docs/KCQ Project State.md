# KCQ Project State

**Updated:** 2026-10-18  
**Repository:** `Aelie1/KCQ`  
**Purpose:** Brief current-state and decision record for future KCQ conversations. This is not a patch history, implementation reference, or rules specification.

## Source of truth

For implementation, inspect the **current repository and tests**; do not infer current behavior from this snapshot. `docs/Game Rules.md` records intended stable mechanics, and `docs/Patch Notes.md` records release history. The state document captures the project's goals, key decisions, and active work. The latest release/deployment version has not been reverified here; the repository's patch notes checked during this update begin at **0.17.0 (2026-10-16)**.

## Project identity and design direction

**Ko-chan's Quest (KCQ)** is a browser-playable, deterministic, turn-based tactical combat game and a reboot of BQuest. Its engine, presentation/UI, and automated clients are deliberately separated. It should reward recognizing intentions, responding to bindings, choosing abilities, and recovering from setbacks; it must not collapse into an auto-attack simulator.

The intended **1.0 milestone is a coherent, publicly playable tactical-combat foundation**, not the completion of every earlier design idea. Preserve seeded reproducibility, a usable public engine interface, and informative combat presentation. Prefer targeted improvements to new frameworks or sweeping redesigns.

## Current major capabilities

- **Five playable characters:** Ko-chan, Matsuko, Hinari, **Naruyo, and Sakari**. The repository contains implementations and tests for the latter two. Players form a **three-character party** from the available roster.
- **In-game Game Guide is implemented.** The repository contains guide content, UI integration, localization, and tests. Do **not** suggest writing or implementing the Guide as remaining 1.0 work.
- **Five difficulties:** Casual, Standard, Veteran, Extreme, Mythic; encounter and enemy behavior can vary with difficulty.
- **Playable browser UI** with title/campaign/encounter/difficulty selection, character and enemy details, action targeting and previews, combat feedback and logs, adaptive desktop/mobile layouts, and an in-game reference Library.
- **Lightweight story/progression** for *Latex Skunk Attacks!* including story scenes, encounter unlocking, Show All, and Next Level. Browser storage records unlocks and best clears.
- **Battle autosave/resume** with handling for incompatible or corrupted saves.
- **Automated harness** supports deterministic runs, policy comparisons (idle/basic/escape/smart), metrics, replay capture, and investigations of unusual fights. Party and difficulty matrix testing are active improvement requests, **not yet verified as implemented**.
- **Anonymous gameplay telemetry** and replay infrastructure support playtesting and balance investigation.

## Active pre-1.0 work

1. **Player preferences:** remember the last confirmed three-character party and selected difficulty across sessions, without compromising autosave restoration.
2. **Party-selection navigation:** make party selection optional instead of mandatory after campaign selection; offer Change Party from the title and encounter selection screens.
3. **Tag-tone consistency:** consolidate duplicate semantic move-trait color mappings used by the Library and combat UI.
4. **Harness upgrades:** allow explicit party and difficulty inputs, multiple difficulties in batch comparisons, and optional enumeration of every valid three-character party. Support these selections in the interactive harness. Audit character-specific assumptions in the policies (notably Escape), propagate configuration through batch workers, summaries, and replay metadata, and avoid confusing weak policies with weak parties.
5. **Release readiness:** run practical balance and regression checks for the five-character roster and five difficulties; fix meaningful defects, ensure documentation and packaging match actual behavior, then ship 1.0.

**Work status note (2026-10-18):** A Codex prompt has been prepared for items 1–3, explicitly excluding the harness. This document does **not** assume Codex has completed those changes. Verify their status in the repository before describing them as done.

## Decisions and non-goals

- The formerly proposed **deep campaign / cross-encounter carryover system has been abandoned as a near-term direction**. Do not mistake the existing lightweight story and unlock system for an unfinished commitment to that larger design.
- Do not add Castle content, Super Skills, Double/Triple Techs, broad meta-progression, or speculative generalized mechanics merely to reach 1.0.
- Do not build a perfect human-performance simulator or open-ended automatic party optimizer. The harness should support meaningful, reproducible comparisons, while recognizing that policy performance is not equivalent to human play or proof of balance.
- The Game Guide and five-character roster are **completed milestones**, not outstanding tasks.

## Update discipline

Keep this file short and replace stale statements when milestones change. For details, use repository source, tests, Game Rules, and Patch Notes rather than copying them here. In particular, verify whether preferences/navigation/tag consolidation and harness support have landed before any future update.
