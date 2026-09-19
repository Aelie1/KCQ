import { characterList, encounterList } from "../../content/content";
import {
    evaluateIntention, evaluateProfile, evaluateResult, getTargets, isValidTarget, resolveEscape, resolveMove,
    tickBindings, tickBuffs, tickCooldowns, tickPlayers
} from "../private/combat";
import { TRAP_MODIFIER } from "../private/constants";
import { GameEffects } from "../private/effects";
import { serializeEffects, serializeGameState, serializeMove, serializeValidity } from "../private/serialize";
import { iValidityInfo } from "../private/types";
import { type CharacterDef, type EncounterDef } from "../protected/definitions";
import { findBinding, findCharacter, findEntity, findMove, getMoves, isValidEntity, thresholds } from "../protected/helpers";
import { mixSeed, Random } from "../protected/random";
import { GameStatus } from "../protected/status";
import { iEffect, type iGameState, type iIntention, type iMove, type iTargetInfo } from "../protected/types";
import type {
    AccuracyResult,
    ActionInfo, ActionResult, AvailabilityInfo,
    EncounterId, EntityId, EscapeOptions,
    FailureReason,
    GameEvent, GameState, PlayerAction, StanceInfo
} from "./types";

export function createEngine(seed?: number): GameEngine {
    return new GameEngine(encounterList, characterList, seed);
}

export class GameEngine {
    private state: iGameState;
    private seed: number;
    private aiRng: Random;
    private accRng: Random;
    private encounters: EncounterDef[];
    private characters: CharacterDef[];

    constructor(encounters: EncounterDef[], characters: CharacterDef[], seed?: number) {
        this.state = {
            turn: { round: 1, step: 1, phase: "player", outcome: "ongoing" },
            nextId: {},
            characters: [],
            enemies: [],
            traps: [],
            encounter: null
        };
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

    getGameState(): GameState {
        return serializeGameState(this.state);
    }

    getThresholds() {
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

    loadCharacter(id: EntityId): GameEvent[] {
        const result = new GameEffects(this.state, this.accRng);
        const character = this.characters.find(x => x.id === id);
        if (!character) {
            result.addEvent({
                type: "characterLoad",
                id: id,
                success: false
            });
            return result.getEvents();
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
        result.addEvent({
            type: "characterLoad",
            id: id,
            success: true
        });
        return result.getEvents();
    }

    listEncounters(): EncounterId[] {
        const encounterList: EncounterId[] = [];
        for (const encounter of this.encounters) {
            encounterList.push(encounter.id);
        }
        return encounterList;
    }

    loadEncounter(id: EncounterId): GameEvent[] {
        const result = new GameEffects(this.state, this.accRng);
        const encounter = this.encounters.find(x => x.id === id);
        if (!encounter) {
            result.addEvent({
                type: "encounterLoad",
                id: id,
                success: false,
                bindings: []
            });
            return result.getEvents();
        }

        this.state.enemies.length = 0;
        this.state.traps.length = 0;
        this.state.nextId = {};
        this.state.encounter = encounter;

        const spawns: iEffect[] = [];
        for (const enemy of encounter.enemies) {
            spawns.push({
                type: "enemy",
                operation: "spawn",
                definition: enemy
            });
        }
        result.fromEffects(spawns);

        for (const trap of encounter.traps) {
            this.state.traps.push({
                id: trap.definition.id,
                definition: trap.definition,
                amount: trap.amount
            });
        }

        if (encounter.setup) {
            result.fromEffects(encounter.setup(this.state));
        }

        this.updateIntentions();
        result.addEvent({
            type: "encounterLoad",
            id: id,
            success: true,
            bindings: encounter.bindings.map(x => x.id)
        });
        return result.getEvents();
    }

    getAvailability(): AvailabilityInfo[] {
        const info: AvailabilityInfo[] = [];
        for (const character of this.state.characters) {
            const status = new GameStatus(character);
            if (status.isIncapacitated()) {
                info.push({
                    id: character.id,
                    available: false,
                    reason: "actorIncapacitated"
                });
            }
            else if (status.isSkipped()) {
                info.push({
                    id: character.id,
                    available: false,
                    reason: "actorSkipped"
                });
            }
            else if (character.acted && !character.bonusEscapes) {
                info.push({
                    id: character.id,
                    available: false,
                    reason: "actorAlreadyActed"
                });
            }
            else {
                info.push({
                    id: character.id,
                    available: true
                });
            }
        }
        return info;
    }

    stanceAvailable(name: EntityId): StanceInfo {
        const character = findCharacter(this.state, name);
        if (!character) {
            return {
                available: false,
                reason: "invalidActor"
            }
        }

        const status = new GameStatus(character);
        const result = status.canAct("stance");
        if (result) {
            return {
                available: false,
                reason: result
            }
        }
        return {
            available: true
        }
    }

    getMoves(actor: EntityId): ActionInfo[] {
        const actions: ActionInfo[] = [];
        const character = findCharacter(this.state, actor);
        if (character) {
            const status = new GameStatus(character);
            const result = status.canAct("move");
            for (const move of getMoves(character)) {
                let available = true;
                let reason: FailureReason = "moveUnavailable";
                const targets = getTargets(this.state, character, move);
                if (result) {
                    available = false;
                    reason = result;
                }
                else if (!move.alwaysAvailable && !status.canAttack()) {
                    available = false;
                    reason = "attackUnavailable";
                }
                else if (!status.canUseMoveType(move.type)) {
                    available = false;
                    reason = "bindingRestriction";
                }
                else if (move.targets !== "all"
                    && !targets.some(x => x.valid)) {
                    available = false;
                    if (targets.length && !targets[0].valid) {
                        reason = targets[0].reason;
                    }
                }
                if (available) {
                    actions.push({
                        move: serializeMove(move),
                        available: true,
                        targets: targets.map(serializeValidity)
                    });
                } else {
                    actions.push({
                        move: serializeMove(move),
                        available: false,
                        targets: targets.map(serializeValidity),
                        reason: reason
                    });
                }
            }
        }
        return actions;
    }

    getEscapes(actor: EntityId): EscapeOptions | null {
        const character = findCharacter(this.state, actor);
        if (!character) {
            return null;
        }

        const status = new GameStatus(character);
        const result = status.canAct("escape");
        if (result) {
            return {
                options: [],
                assistAllowed: false,
                reason: result
            }
        }

        const options: EscapeOptions = { options: [], assistAllowed: status.canAssist() };
        for (const target of this.state.characters) {
            if (character !== target && !options.assistAllowed) {
                continue;
            }
            for (const binding of target.bindings) {
                options.options.push({
                    actor: actor,
                    target: target.id,
                    binding: binding.id,
                    effects: serializeEffects(resolveEscape(character, status, target, binding))
                });
            }
        }

        return options;
    }

    executeAction(action: PlayerAction): ActionResult {
        const result = new GameEffects(this.state, this.accRng);
        if (this.state.turn.phase !== "player") {
            return {
                success: false,
                reason: "wrongPhase"
            };
        }
        if (action.type === "endTurn") {
            result.fromResult(this.advancePhase());
            result.fromResult(this.executeEnemyPhase());
            result.fromResult(this.advancePhase());

            return {
                success: true,
                events: result.getEvents(),
                state: this.getGameState(),
            };
        }

        const actor = findCharacter(this.state, action.actor);
        if (!actor) {
            return {
                success: false,
                reason: "invalidActor"
            };
        }

        const status = new GameStatus(actor);
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
                            targetInfo.push(isValidTarget(this.state, actor, status, enemy, move));
                        }
                    }
                    if (move.targetSide === "either" || move.targetSide === "player") {

                        for (const character of this.state.characters) {
                            targetInfo.push(isValidTarget(this.state, actor, status, character, move));
                        }
                    }
                } else if (move.targets === 0) {
                    if (action.targets.length !== 0) {
                        return {
                            success: false,
                            reason: "invalidTargetCount"
                        }
                    }
                    targetInfo.push(isValidTarget(this.state, actor, status, null, move));
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
                            const info = isValidTarget(this.state, actor, status, targetState, move);
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
                            result.fromEffects(trap.definition.onTrigger(actor, trap, roll));
                            result.addEvent({
                                type: "trapTriggered",
                                actor: actor.id,
                                trap: trap.id,
                                amount: origValue - trap.amount
                            });
                        }
                    }
                    //Redo some checks in case status has changed
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
                        result.addEvent({
                            type: "actionInterrupted",
                            actor: actor.id,
                            reason: reason
                        });
                        actor.acted = true;
                        this.state.turn.step++;
                        return {
                            success: true,
                            events: result.getEvents(),
                            state: this.getGameState(),
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
                result.addEvent({
                    type: "moveUsed",
                    actor: action.actor,
                    move: action.move,
                    targets: targets.map(x => ({ target: x.target.id, result: x.band }))
                });
                result.fromEffects(resolveMove(this.state, iMove, actor, targets));

                if (move.freeOnHit !== true || anyHits === false) {
                    actor.acted = true;
                }
                this.state.turn.step++;
                return {
                    success: true,
                    events: result.getEvents(),
                    state: this.getGameState(),
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
                            result.fromEffects(trap.definition.onTrigger(actor, trap, roll));
                            result.addEvent({
                                type: "trapTriggered",
                                actor: actor.id,
                                trap: trap.id,
                                amount: origValue - trap.amount
                            });
                        }
                    }

                    //Redo some checks in case status has changed
                    let reason: FailureReason | undefined;

                    const capability = status.canAct(action.type);
                    if (capability) {
                        reason = capability;
                    }

                    if (!reason && actor !== target && !status.canAssist()) {
                        reason = "assistUnavailable";
                    }

                    if (reason) {
                        result.addEvent({
                            type: "actionInterrupted",
                            actor: actor.id,
                            reason: reason
                        });
                        actor.acted = true;
                        this.state.turn.step++;
                        return {
                            success: true,
                            events: result.getEvents(),
                            state: this.getGameState(),
                        };
                    }
                }

                //now we have a valid actor, target, and binding -- execute the escape
                result.fromEffects(resolveEscape(actor, status, target, binding));
                if (!actor.acted) {
                    actor.acted = true;
                    if (actor.standing && status.canBonusEscape()) {
                        actor.bonusEscapes++;
                    }
                } else {
                    actor.bonusEscapes--;
                }
                this.state.turn.step++;
                return {
                    success: true,
                    events: result.getEvents(),
                    state: this.getGameState(),
                };
            }
            case "stance": {
                result.fromEffects([{
                    type: "stance",
                    actor: actor,
                    stance: actor.standing ? "moving" : "standing"
                }]);
                return {
                    success: true,
                    events: result.getEvents(),
                    state: this.getGameState(),
                };
            }
        }
    }

    private executeEnemyAction(intention: iIntention): GameEffects {
        const result = new GameEffects(this.state, this.accRng);
        const actor = intention.actor;
        const move = intention.move;
        if (!actor) {
            return result;
        }

        const status = new GameStatus(actor);
        if (!status.canAttack() || status.isSkipped()) {
            return result;
        }

        const targets: iTargetInfo[] = evaluateIntention(this.state, intention);

        //Now we have a valid actor, targets and move -- execute the move
        result.addEvent({
            type: "moveUsed",
            actor: actor.id,
            move: move.definition.id,
            targets: targets.map(x => ({ target: x.target.id, result: x.band }))
        });
        result.fromEffects(resolveMove(this.state, move, actor, targets));
        this.state.turn.step++;
        return result;
    }

    private executeEnemyPhase(): GameEffects {
        const result = new GameEffects(this.state, this.accRng);
        for (const enemy of [...this.state.enemies]) {
            for (const intention of enemy.intentions) {
                if (isValidEntity(this.state, enemy)) {
                    result.fromResult(this.executeEnemyAction(intention));
                    const move = intention.move.definition;
                    if (move.cooldown) {
                        enemy.cooldowns[move.id] = move.cooldown;
                    }
                }
            }
            enemy.intentions.length = 0;
        }
        return result;
    }

    private advancePhase(): GameEffects {
        const result = new GameEffects(this.state, this.accRng);

        if (this.state.turn.phase === "player") {
            result.fromEffects(tickBindings(this.state));
            this.state.turn.phase = "enemy";
        } else {
            tickCooldowns(this.state.enemies);
            result.fromEffects(tickBuffs(this.state));
            result.fromEffects(tickPlayers(this.state));
            this.updateIntentions();
            this.state.turn.phase = "player";
            this.state.turn.step = 1;
            this.state.turn.round++;
        }
        result.addEvent({
            type: "phaseChanged",
            phase: this.state.turn.phase
        });

        return result;
    }

    private updateIntentions() {
        const result = new GameEffects(this.state, this.accRng);
        for (const enemy of this.state.enemies) {
            enemy.intentions.length = 0;
        }
        for (const enemy of this.state.enemies) {
            result.fromEffects(enemy.definition.ai(this.state, enemy, this.aiRng));
        }
    }
}