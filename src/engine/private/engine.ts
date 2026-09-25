import { type CharacterDef, type EncounterDef } from "../protected/definitions";
import { findBinding, findCharacter, findEntity, findMove, isEnemy, isValidEntity, thresholds } from "../protected/helpers";
import { mixSeed, Random } from "../protected/random";
import { GameStatus, StatusMap } from "../protected/status";
import { iEffect, iMoveResult, type iGameState, type iIntention, type iMove, type iTargetInfo } from "../protected/types";
import type { AccuracyResult, ActionResult, ActionView, EncounterEvent, EncounterId, Engine, EntityId, EventFrame, FailureReason, GameEvent, GameState, MoveEvent, PlayerAction, ThresholdInfo, TrapEvent } from "../public/types";
import {
    evaluateIntention, evaluateProfile, evaluateResult, isValidTarget, resolveEscape,
    resolveMove, tickBindings, tickBuffs, tickCooldowns, tickPlayers
} from "./combat";
import { TRAP_MODIFIER } from "./constants";
import { GameEffects } from "./effects";
import { serializeGameState } from "./serialize";
import { iValidityInfo } from "./types";
import { getActionView, getStatusMap } from "./view";

export class GameEngine implements Engine {
    private state: iGameState;
    private statuses: StatusMap;
    private viewState: GameState;
    private viewActions: ActionView[];
    private seed: number;
    private aiRng: Random;
    private accRng: Random;
    private encounters: EncounterDef[];
    private characters: CharacterDef[];

    constructor(encounters: EncounterDef[], characters: CharacterDef[], seed?: number) {
        this.state = {
            turn: { round: 1, step: 1, phase: "player" },
            nextId: {},
            characters: [],
            enemies: [],
            traps: [],
            encounter: null
        };
        this.statuses = getStatusMap(this.state);
        this.viewState = serializeGameState(this.state, this.statuses);
        this.viewActions = getActionView(this.state, this.statuses);
        seed ??= Math.floor(Math.random() * 0x100000000);
        this.seed = seed;
        this.aiRng = new Random(mixSeed(seed, 1));
        this.accRng = new Random(mixSeed(seed, 2));
        this.encounters = encounters;
        this.characters = characters;
    }

    getSeed(): number {
        return this.seed;
    }

    getActionView(): ActionView[] {
        return this.viewActions;
    }

    getGameState(): GameState {
        return this.viewState;
    }

    private refreshView() {
        this.refreshState();
        this.refreshActions();
    }

    private refreshState() {
        this.statuses = getStatusMap(this.state);
        this.viewState = serializeGameState(this.state, this.statuses);
    }

    private refreshActions() {
        this.viewActions = getActionView(this.state, this.statuses);
    }

    getThresholds(): ThresholdInfo {
        return {
            thresholds: {
                easy: thresholds.easy,
                medium: thresholds.medium,
                hard: thresholds.hard,
                extreme: thresholds.extreme,
                impossible: thresholds.impossible
            },
            max: thresholds.max
        }
    }

    listCharacters(): EntityId[] {
        const characterList: EntityId[] = [];
        for (const character of this.characters) {
            characterList.push(character.id);
        }
        return characterList;
    }

    loadCharacter(id: EntityId): GameEvent {
        const result = new GameEffects(this.state, this.accRng);
        const character = this.characters.find(x => x.id === id);
        if (!character) {
            return {
                type: "loadCharacter",
                id: id,
                success: false,
                effects: [],
            };
        }
        this.state.characters.push({
            id: character.id,
            definition: character,
            acted: false,
            standing: false,
            bonusEscapes: 0,
            bindings: [],
            buffs: [],
            data: { ...(character.data ?? {}) },
        });
        this.refreshView();
        return {
            type: "loadCharacter",
            id: id,
            success: true,
            effects: [],
        };
    }

    listEncounters(): EncounterId[] {
        const encounterList: EncounterId[] = [];
        for (const encounter of this.encounters) {
            encounterList.push(encounter.id);
        }
        return encounterList;
    }

    loadEncounter(id: EncounterId): GameEvent {
        const effects = new GameEffects(this.state, this.accRng);
        const encounter = this.encounters.find(x => x.id === id);
        if (!encounter) {
            return {
                type: "loadEncounter",
                id: id,
                success: false,
                bindings: [],
                effects: [],
            };
        }

        this.state.enemies.length = 0;
        this.state.traps.length = 0;
        this.state.nextId = {};
        this.state.turn = { round: 1, step: 1, phase: "player" };

        this.state.encounter = encounter;

        const spawns: iEffect[] = [];
        for (const enemy of encounter.enemies) {
            spawns.push({
                type: "enemy",
                operation: "spawn",
                definition: enemy
            });
        }
        effects.merge(spawns);

        for (const trap of encounter.traps) {
            this.state.traps.push({
                id: trap.definition.id,
                definition: trap.definition,
                amount: trap.amount
            });
        }

        if (encounter.setup) {
            effects.merge(encounter.setup(this.state));
        }

        this.updateIntentions();
        const result: EncounterEvent = {
            type: "loadEncounter",
            id: id,
            success: true,
            bindings: encounter.bindings.map(x => x.id),
            effects: effects.getEvents()
        };
        this.refreshView();
        return result;
    }

    executeAction(action: PlayerAction): ActionResult {
        const result: EventFrame[] = [];
        const effects = new GameEffects(this.state, this.accRng);
        if (this.state.turn.phase !== "player") {
            return {
                success: false,
                reason: "wrongPhase"
            };
        }
        if (action.type === "endTurn") {
            result.push(this.advancePhase());
            result.push(...this.executeEnemyPhase());
            result.push(this.advancePhase());

            this.refreshActions();
            return {
                success: true,
                frames: result,
                actions: this.getActionView(),
            };
        }

        const actor = findCharacter(this.state, action.actor);
        if (!actor) {
            return {
                success: false,
                reason: "invalidActor"
            };
        }

        let status = new GameStatus(actor);
        const capability = status.canAct(action.type);
        if (capability) {
            return {
                success: false,
                reason: capability
            }
        }

        switch (action.type) {
            case "move": {
                const move = findMove(actor, action.move);
                if (!move) {
                    return {
                        success: false,
                        reason: "invalidMove"
                    };
                }

                if (!move.alwaysAvailable && !status.canAttack()) {
                    return {
                        success: false,
                        reason: "attackUnavailable"
                    };
                }

                if (!status.canUseMoveType(move.type)) {
                    return {
                        success: false,
                        reason: "bindingRestriction"
                    };
                }

                const targetInfo: iValidityInfo[] = [];

                if (move.targets === "all") {
                    if (action.targets.length !== 0) {
                        return {
                            success: false,
                            reason: "invalidTargetCount"
                        }
                    }
                    if (move.targetSide === "either" || move.targetSide === "enemy") {
                        for (const enemy of this.state.enemies) {
                            const targetStatus = new GameStatus(enemy);
                            targetInfo.push(isValidTarget(this.state, actor, status, enemy, targetStatus, move));
                        }
                    }
                    if (move.targetSide === "either" || move.targetSide === "player") {

                        for (const character of this.state.characters) {
                            const targetStatus = new GameStatus(character);
                            targetInfo.push(isValidTarget(this.state, actor, status, character, targetStatus, move));
                        }
                    }
                } else if (move.targets === 0) {
                    if (action.targets.length !== 0) {
                        return {
                            success: false,
                            reason: "invalidTargetCount"
                        }
                    }
                    targetInfo.push(isValidTarget(this.state, actor, status, null, null, move));
                }
                else {
                    if (new Set(action.targets).size != action.targets.length) {
                        return {
                            success: false,
                            reason: "duplicateTargets"
                        }
                    }
                    for (const target of action.targets) {
                        const targetState = findEntity(this.state, target);
                        if (targetState) {
                            const targetStatus = new GameStatus(targetState);
                            const info = isValidTarget(this.state, actor, status, targetState, targetStatus, move);
                            if (info.valid) {
                                targetInfo.push(info);
                            } else {
                                return {
                                    success: false,
                                    reason: info.reason
                                };
                            }
                        } else {
                            return {
                                success: false,
                                reason: "invalidTarget"
                            };
                        }
                    }
                    if (targetInfo.length != move.targets) {
                        return {
                            success: false,
                            reason: "invalidTargetCount"
                        };
                    }
                }

                //If moving, check for traps
                if (!actor.standing && !status.ignoresTraps()) {
                    for (const trap of this.state.traps) {
                        const roll = Math.max(0, this.accRng.accuracy() + status.getModifier("traps") * TRAP_MODIFIER);
                        if (roll < trap.amount) {
                            const origValue = trap.amount;
                            const triggered: TrapEvent = {
                                type: "trapTriggered",
                                actor: actor.id,
                                trap: trap.id,
                                amount: 0
                            };
                            effects.addEvent(triggered);
                            effects.merge(trap.definition.onTrigger(actor, trap, roll));
                            triggered.amount = origValue - trap.amount;
                        }
                    }
                    //Redo some checks in case status has changed
                    status = new GameStatus(actor);
                    let reason: FailureReason | undefined;

                    const capability = status.canAct(action.type);
                    if (capability) {
                        reason = capability;
                    }

                    if (!reason && !move.alwaysAvailable && !status.canAttack()) {
                        reason = "attackUnavailable";
                    }

                    if (!reason && !status.canUseMoveType(move.type)) {
                        reason = "bindingRestriction";
                    }

                    if (reason) {
                        effects.addEvent({
                            type: "actionInterrupted",
                            actor: actor.id,
                            reason: reason
                        });
                        actor.acted = true;
                        this.state.turn.step++;
                        this.refreshView();
                        result.push({
                            event: {
                                type: "useMove",
                                actor: action.actor,
                                move: action.move,
                                targets: [],
                                effects: effects.getEvents()
                            },
                            state: this.getGameState()
                        });
                        return {
                            success: true,
                            frames: result,
                            actions: this.getActionView(),
                        };
                    }
                }

                const iMove: iMove = { definition: move };
                const targets: iTargetInfo[] = [];
                let anyHits: boolean = false;
                const totalHits = move.baseHits ?? 1;

                for (const target of targetInfo) {
                    if (target.valid) {
                        if (target.target) {
                            for (let i = 0; i < totalHits; i++) {
                                if (target.accuracy) {
                                    const roll: number = this.accRng.accuracy();
                                    const result: iTargetInfo = evaluateResult(actor, status, target.target, target.status, move, target.accuracy, roll);
                                    targets.push(result);
                                    if (result.band !== "miss") {
                                        anyHits = true;
                                    }
                                } else {
                                    targets.push({
                                        target: target.target,
                                        effectiveness: 0,
                                        band: "none"
                                    });
                                    anyHits = true;
                                }
                            }
                        } else {
                            if (target.accuracy) {
                                const roll: number = this.accRng.accuracy();
                                const result: AccuracyResult = evaluateProfile(actor, status, move, target.accuracy, roll, 0);
                                iMove.band = result.band;
                                iMove.effectiveness = result.effectiveness;
                                if (result.band !== "miss") {
                                    anyHits = true;
                                }
                            } else {
                                iMove.band = "none";
                                iMove.effectiveness = 0;
                                anyHits = true;
                            }
                        }
                    }
                }

                //Now we have a valid actor, targets and move -- execute the move
                const moveResults: iMoveResult = resolveMove(this.state, iMove, actor, targets);
                const moveEvent: MoveEvent = {
                    type: "useMove",
                    actor: actor.id,
                    move: move.id,
                    effects: [],
                    targets: []
                }
                const targetResults: GameEffects = new GameEffects(this.state, this.accRng);
                for (const target of moveResults.targets) {
                    targetResults.clear();
                    targetResults.merge(target.effects);
                    moveEvent.targets.push({
                        target: target.target.id,
                        result: target.result,
                        effects: targetResults.getEvents()
                    });
                }
                effects.merge(moveResults.effects);
                moveEvent.effects = effects.getEvents();

                if (move.freeOnHit !== true || anyHits === false) {
                    actor.acted = true;
                }
                this.state.turn.step++;
                this.refreshView();
                result.push({
                    event: moveEvent,
                    state: this.getGameState()
                });
                return {
                    success: true,
                    frames: result,
                    actions: this.getActionView(),
                };
            }
            case "escape": {

                const target = findCharacter(this.state, action.target);
                if (!target) {
                    return {
                        success: false,
                        reason: "invalidTarget"
                    };
                }

                if (actor !== target && !status.canAssist()) {
                    return {
                        success: false,
                        reason: "assistUnavailable"
                    }
                }

                const binding = findBinding(target, action.binding);
                if (!binding) {
                    return {
                        success: false,
                        reason: "invalidBinding"
                    }
                }

                //If moving, check for traps
                if (!actor.standing && !status.ignoresTraps()) {
                    for (const trap of this.state.traps) {
                        const roll = Math.max(0, this.accRng.accuracy() + status.getModifier("traps") * TRAP_MODIFIER);
                        if (roll < trap.amount) {
                            const origValue = trap.amount;
                            const triggered: TrapEvent = {
                                type: "trapTriggered",
                                actor: actor.id,
                                trap: trap.id,
                                amount: 0
                            };
                            effects.addEvent(triggered);
                            effects.merge(trap.definition.onTrigger(actor, trap, roll));
                            triggered.amount = origValue - trap.amount;
                        }
                    }

                    //Redo some checks in case status has changed
                    status = new GameStatus(actor);
                    let reason: FailureReason | undefined;

                    const capability = status.canAct(action.type);
                    if (capability) {
                        reason = capability;
                    }

                    if (!reason && actor !== target && !status.canAssist()) {
                        reason = "assistUnavailable";
                    }

                    if (reason) {
                        effects.addEvent({
                            type: "actionInterrupted",
                            actor: actor.id,
                            reason: reason
                        });
                        actor.acted = true;
                        this.state.turn.step++;
                        this.refreshView();
                        result.push({
                            event: {
                                type: "useEscape",
                                actor: actor.id,
                                target: target.id,
                                effects: effects.getEvents(),
                            }, state: this.getGameState()
                        });
                        return {
                            success: true,
                            frames: result,
                            actions: this.getActionView(),
                        };
                    }
                }

                //now we have a valid actor, target, and binding -- execute the escape
                const targetStatus = new GameStatus(target);
                effects.merge(resolveEscape(actor, status, target, targetStatus, binding));
                if (!actor.acted) {
                    actor.acted = true;
                    status = new GameStatus(actor);
                    const hasFollowUpEscape = status.canAct("escape") && this.state.characters.some(x => x.bindings.length > 0 && (x === actor || status.canAssist()));
                    if (actor.standing && status.canBonusEscape() && hasFollowUpEscape) {
                        actor.bonusEscapes++;
                    }
                } else {
                    actor.bonusEscapes--;
                }
                this.state.turn.step++;
                this.refreshView();
                result.push({
                    event: {
                        type: "useEscape",
                        actor: actor.id,
                        target: target.id,
                        effects: effects.getEvents(),
                    }, state: this.getGameState()
                });
                return {
                    success: true,
                    frames: result,
                    actions: this.getActionView(),
                };
            }
            case "stance": {
                effects.merge([{
                    type: "stance",
                    actor: actor,
                    stance: actor.standing ? "moving" : "standing"
                }]);
                this.state.turn.step++;
                this.refreshView();
                result.push({
                    event: {
                        type: "changeStance",
                        actor: actor.id,
                        effects: effects.getEvents(),
                    }, state: this.getGameState()
                });
                return {
                    success: true,
                    frames: result,
                    actions: this.getActionView(),
                };
            }
        }
    }

    private executeEnemyAction(intention: iIntention): GameEvent | undefined {
        const effects = new GameEffects(this.state, this.accRng);
        const actor = intention.actor;
        const move = intention.move;
        if (!actor) {
            return;
        }

        const status = new GameStatus(actor);
        if (!status.canAttack() || status.isSkipped()) {
            return;
        }

        const targets: iTargetInfo[] = evaluateIntention(this.state, intention, status);

        //Now we have a valid actor, targets and move -- execute the move
        const moveResults: iMoveResult = resolveMove(this.state, move, actor, targets);
        const moveEvent: MoveEvent = {
            type: "useMove",
            actor: actor.id,
            move: move.definition.id,
            effects: [],
            targets: []
        }
        const targetResults: GameEffects = new GameEffects(this.state, this.accRng);
        for (const target of moveResults.targets) {
            targetResults.clear();
            targetResults.merge(target.effects);
            moveEvent.targets.push({
                target: target.target.id,
                result: target.result,
                effects: targetResults.getEvents()
            });
        }
        effects.merge(moveResults.effects);
        moveEvent.effects = effects.getEvents();

        if (move.definition.cooldown) {
            if (isEnemy(intention.actor)) {
                intention.actor.cooldowns[move.definition.id] = move.definition.cooldown;
            }
        }
        return moveEvent;
    }

    private executeEnemyPhase(): EventFrame[] {
        const result: EventFrame[] = [];
        for (const enemy of [...this.state.enemies]) {
            for (const intention of enemy.intentions) {
                if (isValidEntity(this.state, enemy)) {
                    const event = this.executeEnemyAction(intention);
                    if (event) {
                        this.state.turn.step++;
                        this.refreshState();
                        result.push({ event: event, state: this.getGameState() });
                    }
                }
            }
            enemy.intentions.length = 0;
        }
        return result;
    }

    private advancePhase(): EventFrame {
        const result = new GameEffects(this.state, this.accRng);

        if (this.state.turn.phase === "player") {
            result.merge(tickBindings(this.state));
            this.state.turn.phase = "enemy";
        } else {
            tickCooldowns(this.state.enemies);
            result.merge(tickBuffs(this.state));
            result.merge(tickPlayers(this.state));
            this.updateIntentions();
            this.state.turn.phase = "player";
            this.state.turn.step = 1;
            this.state.turn.round++;
        }
        this.refreshState();
        return {
            event: {
                type: "changePhase",
                phase: this.state.turn.phase,
                effects: result.getEvents()
            },
            state: this.getGameState()
        };

    }

    private updateIntentions() {
        const result = new GameEffects(this.state, this.accRng);
        for (const enemy of this.state.enemies) {
            enemy.intentions.length = 0;
        }
        for (const enemy of this.state.enemies) {
            result.merge(enemy.definition.ai(this.state, enemy, this.aiRng));
        }
    }
}
