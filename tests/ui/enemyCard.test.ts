import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { trapPuddle } from "../../src/content/skunk/puddles";
import { skunk } from "../../src/content/skunk/skunk";
import type { Buff } from "../../src/engine/public/types";
import { createStockEngine } from "../../src/stock";
import type { GameLogPresentationEntry } from "../../src/ui/presentation/gameLog";
import { Presentation } from "../../src/ui/presentation/presentation";
import { EnemyCard } from "../../src/ui/web/app/components/EnemyCard";
import { IntentRow } from "../../src/ui/web/app/components/IntentRow";
import { TargetHeader } from "../../src/ui/web/app/components/TargetHeader";
import { battleOverviewFixture } from "../../src/ui/web/app/fixtures/battleOverview";
import { BattleOverviewPanel } from "../../src/ui/web/app/panels/BattleOverviewPanel";
import { createBattleOverviewViewModel } from "../../src/ui/web/app/viewModels/battleOverview";
import { createEnemyCardViewModel } from "../../src/ui/web/app/viewModels/enemyCard";
import { createGameLogHistory } from "../../src/ui/web/app/viewModels/gameLogHistory";
import { createIntentViewModel } from "../../src/ui/web/app/viewModels/intentRow";
import { makeCharacterDef, makeEncounterDef } from "../helpers/helpers";
import { stockStrings } from "../helpers/stockStrings";
import { createTestEngine } from "../helpers/testCatalog";

describe("enemy card", () => {
    it("renders the real Latex Puddle preview band on Battle Overview without changing the stored roll", () => {
        const fixture = battleOverviewFixture;
        const hero = makeCharacterDef("ko");
        const encounter = makeEncounterDef("puddle-overview", {
            enemies: [skunk.id], traps: [{ definition: trapPuddle, amount: 0 }],
        });
        const load = () => {
            const engine = createTestEngine([encounter], [hero], 16, { enemies: [skunk] });
            engine.loadCharacter(hero.id); engine.loadEncounter(encounter.id);
            return engine;
        };
        const engine = load();
        const control = load();
        const state = engine.getGameState();
        expect(state.enemies[0]!.intentions[0]).toMatchObject({ move: "latexPuddle", targets: [], band: "graze" });
        const presentation = new Presentation({ ...stockStrings, "hitBand.graze.name": "Effleure" });
        const html = renderToString(() => createComponent(BattleOverviewPanel, {
            state, actions: engine.getActionView(), thresholds: fixture.thresholds, presentation,
        }));
        expect(html).toContain("Latex Puddle");
        expect(html).toContain("kcq-status-chip--outcome-graze");
        expect(html).toContain("Effleure");
        expect(engine.getGameState()).toEqual(state);
        expect(engine.executeAction({ type: "endTurn" })).toEqual(control.executeAction({ type: "endTurn" }));
    });

    it.each(["miss", "graze", "hit", "crit"] as const)("reuses the existing positioned chip for a zero-target %s preview", band => {
        const intent = createIntentViewModel({ move: "throwOff", targets: [], effects: [], band }, battleOverviewFixture.presentation);
        expect(intent).toMatchObject({ outcome: band, outcomeLabel: battleOverviewFixture.presentation.hitBand(band) });
        const html = renderToString(() => createComponent(IntentRow, { intent }));
        expect(html).toMatch(new RegExp('kcq-intent-row__content[^>]*>.*</span>.*kcq-status-chip--outcome-' + band, "s"));
        expect(html).not.toContain("kcq-intent-row--move-only");
        expect(html).not.toContain("kcq-intent-row__target-group");
    });

    it("keeps targeted and zero-target accuracy independent on a card and no-accuracy moves unchanged", () => {
        const fixture = battleOverviewFixture;
        const model = createEnemyCardViewModel({
            ...fixture.state.enemies[0]!, intentions: [
                { move: "latexSpray", targets: [{ target: "ko", band: "hit", effects: [] }], effects: [] },
                { move: "latexPuddle", targets: [], effects: [], band: "graze" },
            ]
        }, fixture.presentation, fixture.state.characters);
        expect(model.visibleIntentions.map(intent => intent.outcome)).toEqual(["hit", "graze"]);
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));
        expect(html.match(/kcq-enemy-card__intent-slot/g)).toHaveLength(2);
        expect(html.match(/kcq-status-chip--outcome-/g)).toHaveLength(2);
        expect(html).toContain("kcq-status-chip--outcome-hit");
        expect(html).toContain("kcq-status-chip--outcome-graze");
        const noAccuracy = createEnemyCardViewModel({
            ...fixture.state.enemies[0]!, intentions: [
                { move: "callReinforcements", targets: [], effects: [] },
            ]
        }, fixture.presentation, fixture.state.characters);
        expect(noAccuracy.visibleIntentions[0]!.outcome).toBeUndefined();
        const noAccuracyHtml = renderToString(() => createComponent(EnemyCard, { enemy: noAccuracy }));
        expect(noAccuracyHtml).toContain("kcq-intent-row--move-only");
        expect(noAccuracyHtml).not.toContain("kcq-status-chip--outcome-");
    });


    it("renders only actual intention rows without an empty placeholder slot", () => {
        const fixture = battleOverviewFixture;
        const enemy = fixture.state.enemies[0];
        const model = createEnemyCardViewModel(
            enemy,
            fixture.presentation,
            fixture.state.characters,
        );
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));

        expect(model.visibleIntentions).toHaveLength(1);
        expect((html.match(/kcq-enemy-card__intent-slot/g) ?? [])).toHaveLength(1);
        expect(html).not.toContain("kcq-enemy-card__empty-intent");
    });

    it("keeps compact linked-player icons beside shrinkable enemy names", () => {
        const fixture = battleOverviewFixture;
        const enemy = {
            ...fixture.state.enemies[0],
            intentions: [],
            buffs: [
                { id: "pounce", linkedEntity: "ko" },
                { id: "pounce", linkedEntity: "matsuko" },
            ],
        };
        const model = createEnemyCardViewModel(
            enemy, fixture.presentation, fixture.state.characters,
        );
        const cardHtml = renderToString(() => createComponent(EnemyCard, { enemy: model }));
        const targetHtml = renderToString(() => createComponent(TargetHeader, {
            target: {
                id: enemy.id,
                target: enemy.id,
                name: model.name,
                valid: true,
                effects: [],
                linkedEntities: model.linkedEntities,
                tone: "neutral",
            },
        }));
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const iconRule = css.match(/\.kcq-linked-entity-chip--icon-only\s*\{([^}]*)\}/)?.[1] ?? "";
        const enemyNameRule = css.match(/\.kcq-enemy-card__name\s*\{([^}]*)\}/)?.[1] ?? "";
        const targetNameRule = css.match(/\.kcq-target-header__name\s*\{([^}]*)\}/)?.[1] ?? "";

        for (const html of [cardHtml, targetHtml]) {
            expect(html).toContain('aria-label="Linked to Ko-chan"');
            expect(html).toContain('aria-label="Linked to Matsuko"');
            expect(html).not.toContain(">Ko-chan</span>");
            expect(html).not.toContain(">Matsuko</span>");
        }
        expect(iconRule).toContain("flex: 0 0 auto");
        expect(enemyNameRule).toContain("flex: 1 1 auto");
        expect(enemyNameRule).toContain("text-overflow: ellipsis");
        expect(targetNameRule).toContain("min-width: 0");
        expect(targetNameRule).toContain("text-overflow: ellipsis");
    });

    it("colors intention targets from EntityId and outcomes from HitBand", () => {
        const fixture = battleOverviewFixture;
        const multiTarget = createIntentViewModel({
            move: "latexSpray",
            targets: [
                { target: "ko", band: "none", effects: [] },
                { target: "matsuko", band: "none", effects: [] },
                { target: "hinari", band: "none", effects: [] },
                { target: "unknown-target", band: "none", effects: [] },
            ],
            effects: [],
        }, fixture.presentation);
        const targetsHtml = renderToString(() => createComponent(IntentRow, { intent: multiTarget }));

        expect(multiTarget.targets?.map(({ id, tone }) => [id, tone])).toEqual([
            ["ko", "ko"],
            ["matsuko", "matsuko"],
            ["hinari", "hinari"],
            ["unknown-target", "neutral"],
        ]);
        expect(targetsHtml).toContain("kcq-intent-row__target--ko");
        expect(targetsHtml).toContain("kcq-intent-row__target--matsuko");
        expect(targetsHtml).toContain("kcq-intent-row__target--hinari");
        expect(targetsHtml).toContain("kcq-intent-row__target--neutral");

        for (const band of ["miss", "graze", "hit", "crit"] as const) {
            const intent = createIntentViewModel({
                move: "latexSpray",
                targets: [{ target: "ko", band, effects: [] }],
                effects: [],
            }, fixture.presentation);
            const html = renderToString(() => createComponent(IntentRow, { intent }));
            expect(html).toContain(`kcq-status-chip--outcome-${band}`);
        }

        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const outcomeColors = {
            miss: "var(--kcq-text-muted)",
            graze: "var(--kcq-state-warning)",
            hit: "var(--kcq-binding-heavy)",
            crit: "var(--kcq-state-danger)",
        } as const;
        for (const [band, color] of Object.entries(outcomeColors)) {
            const rule = css.match(new RegExp(`\\.kcq-status-chip--outcome-${band}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
            expect(rule).toContain(`color: ${color}`);
        }
    });

    it("keeps short intentions inline and wraps long target groups without displacing outcomes", () => {
        const fixture = battleOverviewFixture;
        const shortIntent = createIntentViewModel({
            move: "pounce",
            targets: [{ target: "ko", band: "graze", effects: [] }],
            effects: [],
        }, fixture.presentation);
        const longIntent = {
            ...shortIntent,
            moveLabel: "Empowering Magic",
            targetLabel: "Skunk Queen",
            targets: [{ id: "skunketteQueen", label: "Skunk Queen", tone: "neutral" as const }],
            outcome: "hit" as const,
            outcomeLabel: "Hit",
        };
        const shortHtml = renderToString(() => createComponent(IntentRow, { intent: shortIntent }));
        const longHtml = renderToString(() => createComponent(IntentRow, { intent: longIntent }));
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const rowRule = css.match(/\.kcq-intent-row\s*\{([^}]*)\}/)?.[1] ?? "";
        const contentRule = css.match(/\.kcq-intent-row__content\s*\{([^}]*)\}/)?.[1] ?? "";
        const moveRule = css.match(/\.kcq-intent-row__move\s*\{([^}]*)\}/)?.[1] ?? "";
        const targetGroupRule = css.match(/\.kcq-intent-row__target-group\s*\{([^}]*)\}/)?.[1] ?? "";
        const intentionsRule = css.match(/\.kcq-enemy-card__intentions\s*\{([^}]*)\}/)?.[1] ?? "";
        const slotRule = css.match(/\.kcq-enemy-card__intent-slot\s*\{([^}]*)\}/)?.[1] ?? "";

        for (const html of [shortHtml, longHtml]) {
            expect(html).toMatch(/kcq-intent-row__content[^>]*>.*kcq-intent-row__move/s);
            expect(html).toMatch(/kcq-intent-row__target-group[^>]*>.*kcq-intent-row__arrow.*kcq-intent-row__targets/s);
        }
        expect(shortHtml).toContain("Pounce");
        expect(shortHtml).toContain("Ko-chan");
        expect(longHtml).toContain("Empowering Magic");
        expect(longHtml).toContain("Skunk Queen");
        expect(longHtml).toContain("kcq-status-chip--outcome-hit");
        expect(rowRule).toContain("grid-template-columns: minmax(0, 1fr) auto");
        expect(rowRule).toContain("min-height: 20px");
        expect(rowRule).not.toMatch(/(^|\n)\s*height:/);
        expect(rowRule).not.toContain("white-space: nowrap");
        expect(contentRule).toContain("flex-wrap: wrap");
        expect(moveRule).toContain("flex: 0 0 auto");
        expect(targetGroupRule).toContain("flex: 0 0 auto");
        expect(targetGroupRule).toContain("white-space: nowrap");
        expect(css).toMatch(/\.kcq-intent-row>\.kcq-status-chip\s*\{[^}]*align-self: start[^}]*margin-top: 1px/s);
        expect(intentionsRule).toContain("grid-auto-rows: minmax(20px, auto)");
        expect(slotRule).toContain("min-height: 20px");
        expect(slotRule).not.toMatch(/(^|\n)\s*height:/);
    });

    it("renders multiple intentions in separate content-driven slots", () => {
        const fixture = battleOverviewFixture;
        const enemy = fixture.state.enemies.find(({ intentions }) => intentions.length > 1);
        expect(enemy).toBeDefined();

        const model = createEnemyCardViewModel(
            enemy!, fixture.presentation, fixture.state.characters,
        );
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));

        expect(model.visibleIntentions.length).toBeGreaterThan(1);
        expect((html.match(/kcq-enemy-card__intent-slot/g) ?? [])).toHaveLength(model.visibleIntentions.length);
        expect((html.match(/kcq-intent-row__content/g) ?? [])).toHaveLength(model.visibleIntentions.length);
    });

    it("collapses a complete current-party intention to localized ALL only on overview cards", () => {
        const fixture = battleOverviewFixture;
        const enemy = {
            ...fixture.state.enemies[0],
            intentions: [{
                move: "latexSpray",
                targets: fixture.state.characters.map(({ id }) => ({
                    target: id,
                    band: "none" as const,
                    effects: [],
                })),
                effects: [],
            }],
        };
        const overview = createEnemyCardViewModel(
            enemy, fixture.presentation, fixture.state.characters,
        );
        const overviewHtml = renderToString(() => createComponent(EnemyCard, { enemy: overview }));
        const general = createIntentViewModel(enemy.intentions[0], fixture.presentation);

        expect(overview.intentions[0]).toMatchObject({
            moveLabel: "Latex Spray",
            allTargetsLabel: "ALL",
            targetLabel: "ALL",
        });
        expect(overview.intentions[0].targets).toBeUndefined();
        expect(overviewHtml).toContain("ALL");
        expect(overviewHtml).not.toContain("Ko-chan");
        expect(general.targets?.map(({ label }) => label)).toEqual([
            "Ko-chan", "Matsuko", "Hinari",
        ]);
    });

    it("keeps partial overview intentions as EntityId-colored player names", () => {
        const fixture = battleOverviewFixture;
        const enemy = {
            ...fixture.state.enemies[0],
            intentions: [{
                move: "latexSpray",
                targets: [
                    { target: "ko", band: "none" as const, effects: [] },
                    { target: "matsuko", band: "none" as const, effects: [] },
                ],
                effects: [],
            }],
        };
        const model = createEnemyCardViewModel(
            enemy, fixture.presentation, fixture.state.characters,
        );
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));

        expect(model.intentions[0].allTargetsLabel).toBeUndefined();
        expect(model.intentions[0].targets?.map(({ id, tone }) => [id, tone])).toEqual([
            ["ko", "ko"],
            ["matsuko", "matsuko"],
        ]);
        expect(html).toContain("Ko-chan");
        expect(html).toContain("Matsuko");
        expect(html).toContain("kcq-intent-row__target--ko");
        expect(html).toContain("kcq-intent-row__target--matsuko");
        expect(html).not.toContain("ALL");
    });
});

function application(actor: string, buff: Buff, target = battleOverviewFixture.state.enemies[0]!.id): GameLogPresentationEntry {
    return {
        kind: "move", actor, move: "arbitrary-move", outcomes: [{
            kind: "buff", buff: buff.id, participants: [{
                target,
                initial: { present: false }, final: { present: true, details: buff },
            }],
        }]
    };
}

describe("enemy card names and duration clusters", () => {
    it("allows two name lines with bounded overflow while HP remains unwrapped", () => {
        const fixture = battleOverviewFixture;
        const model = { ...createEnemyCardViewModel(fixture.state.enemies[0]!, fixture.presentation), name: "Skunkette Queen" };
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));
        expect(html).toContain('title="Skunkette Queen"');
        expect(html).toContain("Skunkette Queen</h3>");
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const name = css.match(/\.kcq-enemy-card__name\s*\{([^}]*)\}/)![1];
        const header = css.match(/\.kcq-enemy-card__header\s*\{([^}]*)\}/)![1];
        const hp = [...css.matchAll(/\.kcq-enemy-card__hp\s*\{([^}]*)\}/g)].at(-1)![1];
        expect(name).toContain("white-space: normal");
        expect(name).toContain("-webkit-line-clamp: 2");
        expect(name).toContain("overflow: hidden");
        expect(name).toContain("overflow-wrap: anywhere");
        expect(header).toContain("min-height: 16px");
        expect(header).not.toMatch(/(^|\n)\s*height:/);
        expect(hp).toContain("white-space: nowrap");
        expect(hp).toContain("flex: 0 0 auto");
    });

    it("projects separately spaced clusters from actual actors and current durations without mutation", () => {
        const fixture = battleOverviewFixture;
        const buffs: Buff[] = [
            { id: "effect-a", duration: 3, modifiers: { hit: -2 } },
            { id: "effect-b", duration: 2, statuses: [{ id: "servitude", value: 1 }] },
            { id: "effect-c", duration: 1, modifiers: { defense: -2 }, linkedEntity: "ko" },
        ];
        const enemy = { ...fixture.state.enemies[0]!, buffs };
        const history = buffs.map((buff, i) => application(["ko", "matsuko", "hinari"][i]!, buff));
        const before = JSON.stringify({ enemy, history });
        const model = createEnemyCardViewModel(enemy, fixture.presentation, fixture.state.characters, history);
        expect(model.effectDurations.map(({ tone, duration }) => [tone, duration]))
            .toEqual([["ko", 3], ["matsuko", 2], ["hinari", 1]]);
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model, shortcut: "4", onSelect: () => { } }));
        expect(html.match(/kcq-enemy-card__debuff kcq-player-identity--/g)).toHaveLength(3);
        expect(html.match(/kcq-status-chip__segment/g)).toHaveLength(6);
        expect(html).toContain("Hinari: [buff.effect-c.name]");
        expect(html).not.toContain("kcq-status-chip--timed");
        expect(JSON.stringify({ enemy, history })).toBe(before);
        const css = readFileSync(resolve("src/ui/web/app/app.css"), "utf8");
        const border = css.match(/\.kcq-enemy-card__debuffs\s*\{([^}]*)\}/)![1];
        expect(border).toContain("position: absolute");
        expect(border).toContain("top: -1px");
        expect(border).toContain("right: 22px");
        expect(border).toContain("gap: 8px");
    });

    it("includes buffs and unknown sources while omitting expired, permanent, and invalid durations", () => {
        const fixture = battleOverviewFixture;
        const buffs: Buff[] = [
            { id: "beneficial", duration: 2, modifiers: { defense: 2 } },
            { id: "expired", duration: 0, modifiers: { hit: -2 } },
            { id: "negative", duration: -1, modifiers: { hit: -2 } },
            { id: "fractional", duration: 1.5 },
            { id: "infinite", duration: Infinity },
            { id: "permanent", modifiers: { hit: -2 } },
            { id: "unknown", duration: 2, modifiers: { hit: -2 }, linkedEntity: "ko" },
            { id: "enemy-source", duration: 2, modifiers: { hit: -2 } },
        ];
        const history = buffs.filter(buff => buff.id !== "unknown")
            .map(buff => application(buff.id === "enemy-source" ? "skunkette1" : "ko", buff));
        const model = createEnemyCardViewModel({ ...fixture.state.enemies[0]!, buffs }, fixture.presentation, fixture.state.characters, history);
        expect(model.effectDurations.map(({ tone, duration }) => [tone, duration]))
            .toEqual([["ko", 2], ["neutral", 2], ["enemy", 2]]);
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));
        expect(html.match(/kcq-status-chip__segment/g)).toHaveLength(6);
        expect(model.effectDurations[1]!.accessibleLabel).not.toContain("Ko-chan");
    });

    it("uses serialized icons for both buffs and debuffs, with enemy and neutral sources", () => {
        const fixture = battleOverviewFixture;
        const target = fixture.state.enemies[0]!;
        const source = fixture.state.enemies[1]!.id;
        const buffs: Buff[] = [
            { id: "arbitrary-shield", duration: 3, icon: "shield", modifiers: { defense: 2 } },
            { id: "arbitrary-sword", duration: 2, icon: "sword" },
            { id: "arbitrary-disabled", duration: 4, icon: "shield-off", modifiers: { defense: -2 } },
            { id: "barrierMagic", duration: 1 },
        ];
        const state = { ...fixture.state, enemies: [{ ...target, buffs }, ...fixture.state.enemies.slice(1)] };
        const history = [application(source, buffs[0]!), application(source, buffs[1]!), application("ko", buffs[2]!)];
        const presentation = new Presentation({
            ...stockStrings,
            "buff.arbitrary-shield.name": "Bouclier",
            "ui.characterDetails.rounds": "{count} Tours",
        });
        const model = createBattleOverviewViewModel(state, fixture.actions, fixture.thresholds, presentation, history).enemies[0]!;
        expect(model.effectDurations.map(({ tone, icon, duration }) => [tone, icon, duration])).toEqual([
            ["enemy", "shield", 3], ["enemy", "sword", 2], ["ko", "shield-off", 4], ["neutral", undefined, 1],
        ]);
        expect(model.effectDurations[0]!.accessibleLabel).toContain("Bouclier (3 Tours)");
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));
        expect(html.match(/data-icon="shield"/g)).toHaveLength(3);
        expect(html.match(/data-icon="sword"/g)).toHaveLength(2);
        expect(html.match(/data-icon="shield-off"/g)).toHaveLength(4);
        expect(html.match(/kcq-status-chip__segment/g)).toHaveLength(1);
        expect(html.match(/kcq-player-identity--enemy/g)).toHaveLength(2);
        expect(html).toContain('title="' + model.effectDurations[0]!.accessibleLabel + '"');
    });

    it.each(["ko", "matsuko", "hinari"])("colors the same icon by its %s source", source => {
        const fixture = battleOverviewFixture;
        const buff: Buff = { id: "arbitrary-icon", duration: 1, icon: "shield" };
        const model = createEnemyCardViewModel({ ...fixture.state.enemies[0]!, buffs: [buff] },
            fixture.presentation, fixture.state.characters, [application(source, buff)]);
        expect(model.effectDurations).toMatchObject([{ tone: source, icon: "shield" }]);
        const html = renderToString(() => createComponent(EnemyCard, { enemy: model }));
        expect(html).toContain("kcq-player-identity--" + source);
        expect(html).toContain('data-icon="shield"');
    });

    it("uses the latest application actor and cannot revive ownership across an unowned reapplication", () => {
        const fixture = battleOverviewFixture;
        const buff: Buff = { id: "control", duration: 2, modifiers: { hit: -2 } };
        const enemy = { ...fixture.state.enemies[0]!, buffs: [buff] };
        const added = application("ko", buff);
        const refreshed = application("matsuko", buff);
        const removal: GameLogPresentationEntry = {
            kind: "phase", phase: "player", outcomes: [{
                kind: "buff", buff: buff.id,
                participants: [{ target: enemy.id, initial: { present: true, details: buff }, final: { present: false } }],
            }]
        };
        const unowned: GameLogPresentationEntry = { ...removal, outcomes: added.outcomes };
        const project = (history: GameLogPresentationEntry[]) => createEnemyCardViewModel(enemy, fixture.presentation, fixture.state.characters, history).effectDurations;
        expect(project([added, refreshed])).toMatchObject([{ tone: "matsuko", duration: 2 }]);
        expect(project([added, removal])).toMatchObject([{ tone: "neutral", duration: 2 }]);
        expect(project([added, removal, unowned])).toMatchObject([{ tone: "neutral", duration: 2 }]);
        expect(project([added, removal, unowned, refreshed])).toMatchObject([{ tone: "matsuko" }]);
    });

    it("uses stock application history when Buff lacks a source, then counts down from current state", () => {
        const engine = createStockEngine(1);
        engine.loadCharacter("ko"); engine.loadEncounter("plains_2");
        const initial = engine.getGameState();
        const target = initial.enemies[0]!.id;
        const history = createGameLogHistory(initial);
        const result = engine.executeAction({ type: "move", actor: "ko", move: "starlightBindings", targets: [target] });
        expect(result.success).toBe(true);
        if (!result.success) throw Error(result.reason);
        const entries = history.record(result.frames);
        const current = engine.getGameState();
        expect(current.enemies[0]!.buffs.find(buff => buff.id === "starlightBindings")?.linkedEntity).toBeUndefined();
        const project = (state: typeof current, entries: GameLogPresentationEntry[]) => createBattleOverviewViewModel(
            state, engine.getActionView(), battleOverviewFixture.thresholds, battleOverviewFixture.presentation, entries,
        ).enemies[0]!.effectDurations;
        expect(project(current, entries)).toMatchObject([{ tone: "ko", duration: 3 }]);
        const next = engine.executeAction({ type: "endTurn" });
        expect(next.success).toBe(true);
        if (!next.success) throw Error(next.reason);
        expect(project(engine.getGameState(), history.record(next.frames))).toMatchObject([{ tone: "ko", duration: 2 }]);
    });
});
