import { resolveEscape } from "./bindings";
import { tickBuffs } from "./buffs";
import { calculateAccuracy, evaluateIntention, evaluateResult, loadEnemy, processEffects, setStance, updateIntention } from "./combat";
import { findBinding, findCharacter, findEntity, findMove } from "./find";
import type { CharacterDef, EncounterDef, iEntity, iGameState, iIntention, iTargetInfo } from "./itypes";
import { getMoves, isValidMove, resolveMove } from "./moves";
import { XorShift32 } from "./random";
import { serializeEffect, serializeGameState, serializeMove } from "./serialize";
import { canAct, canAssist, canAttack, canBonusEscape, canMove, canUseMoveType, isIncapacitated, isSkipped } from "./status";
import type { AccuracyProfile, ActionFailureReason, ActionInfo, ActionResult, AvailabilityInfo, EncounterId, EntityId, EscapeOptions, GameEvent, GameState, MoveId, PlayerAction, StanceInfo } from "./types";

export class GameEngine {
    private state: iGameState;
    private seed: number;
    private rng: XorShift32;
    private encounters: EncounterDef[];

    constructor(encounters: EncounterDef[], seed?: number) {
        this.state = {
            turn: { round: 1, step: 1, phase: "player" },
            nextEntityId: 1,
            characters: [],
            enemies: []
        };
        seed ??= Math.floor(Math.random() * 0x100000000)
        this.seed = seed;
        this.rng = new XorShift32(seed);
        this.encounters = encounters;
    }

    getSeed(): number {
        return this.seed;
    }

    getGameState(): GameState {
        return serializeGameState(this.state);
    }

    listEncounters(): EncounterId[] {
        const encounterList: EncounterId[] = [];
        for (const encounter of this.encounters) {
            encounterList.push(encounter.id);
        }
        return encounterList;
    }

    loadCharacter(character: CharacterDef) {
        this.state.characters.push({
            id: character.id,
            definition: character,
            acted: false,
            standing: false,
            bonusEscapes: 0,
            bindings: [],
            buffs: []
        });
    }

    loadEncounter(id: EncounterId): GameEvent[] {
        const events: GameEvent[] = [];
        const encounter = this.encounters.find(x => x.id === id);
        if (!encounter) {
            events.push({ type: "encounter", id: id, success: false });
            return events;
        }
        for (const enemy of encounter.enemies) {
            events.push(...loadEnemy(this.state, enemy));
        }
        if (encounter.setup) {
            encounter.setup(this.state);
        }
        this.updateIntentions();
        events.push({ type: "encounter", id: id, success: true });
        return events;
    }

    getAvailability(): AvailabilityInfo[] {
        const info: AvailabilityInfo[] = [];
        for (const character of this.state.characters) {
            if (isIncapacitated(character)) {
                info.push({
                    id: character.id,
                    available: false,
                    reason: "actorIncapacitated"
                });
            }
            else if (isSkipped(character)) {
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

        const result = canAct(character, "stance");
        if (result) {
            return {
                available: false,
                reason: result.reason
            }
        }
        return {
            available: true
        }
    }

    getActions(actor: EntityId): ActionInfo[] {
        const actions: ActionInfo[] = [];
        const character = findCharacter(this.state, actor);
        if (character) {
            const result = canAct(character, "attack");
            for (const move of getMoves(character)) {
                let available = true;
                let reason: ActionFailureReason = "moveUnavailable";
                if (result) {
                    available = false;
                    reason = result.reason;
                }
                else if (!move.alwaysAvailable && !canAttack(character)) {
                    available = false,
                        reason = "attackUnavailable"
                }
                else if (!canUseMoveType(character, move.type)) {
                    available = false;
                    reason = "bindingRestriction";
                }
                if (available) {
                    actions.push({
                        move: serializeMove(move),
                        available: true
                    });
                } else {
                    actions.push({
                        move: serializeMove(move),
                        available: false,
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

        const result = canAct(character, "escape");
        if (result) {
            return {
                options: [],
                assistAllowed: false
            }
        }

        const options: EscapeOptions = { options: [], assistAllowed: canAssist(character) };
        for (const target of this.state.characters) {
            if (character !== target && !options.assistAllowed) {
                continue;
            }
            for (const binding of target.bindings) {
                options.options.push({
                    actor: actor,
                    target: target.id,
                    binding: binding.id,
                    effects: resolveEscape(character, target, binding).map(serializeEffect)
                })
            }
        }

        return options;
    }

    getAccuracyPreview(actor: EntityId, target: EntityId, move: MoveId): AccuracyProfile | null {
        const actorState = findCharacter(this.state, actor);
        const targetState = findEntity(this.state, target);

        if (!actorState || !targetState) {
            return null;
        }

        const moveState = findMove(actorState, move);

        if (!moveState) {
            return null;
        }

        return calculateAccuracy(actorState, targetState, moveState);
    }

    executeAction(action: PlayerAction): ActionResult {
        const events: GameEvent[] = [];
        if (this.state.turn.phase !== "player") {
            return {
                success: false,
                reason: "wrongPhase"
            };
        }
        if (action.type === "endTurn") {
            events.push(...this.advancePhase());
            events.push(...this.executeEnemyPhase());
            events.push(...this.advancePhase());

            return {
                success: true,
                events: events,
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

        const result = canAct(actor, action.type);
        if (result) {
            return result;
        }

        switch (action.type) {
            case "attack": {
                const foundMove = findMove(actor, action.move);
                if (!foundMove) {
                    return {
                        success: false,
                        reason: "invalidMove"
                    };
                }

                const move = { ...foundMove };
                if (!move.alwaysAvailable && !canAttack(actor)) {
                    return {
                        success: false,
                        reason: "attackUnavailable"
                    };
                }

                if (!canUseMoveType(actor, move.type)) {
                    return {
                        success: false,
                        reason: "bindingRestriction"
                    };
                }

                const targetStates: iEntity[] = [];
                if (move.targets === "all") {
                    if (move.target === "enemy") {
                        targetStates.push(...this.state.enemies);
                    } else {
                        targetStates.push(...this.state.characters);
                    }
                    move.targets = targetStates.length
                } else {
                    for (const target of action.targets) {
                        const targetState = findEntity(this.state, target);
                        if (targetState) {
                            targetStates.push(targetState);
                        } else {
                            return {
                                success: false,
                                reason: "invalidTarget"
                            };
                        }
                    }
                }

                if (!isValidMove(this.state, actor, targetStates, move)) {
                    return {
                        success: false,
                        reason: "moveUnavailable"
                    };
                }

                //do this so targetless moves can still get a roll result
                if (foundMove.targets === 0) {
                    targetStates.push(actor);
                }

                const targets: iTargetInfo[] = [];
                if (move.accuracy !== undefined) {
                    const roll: number = this.rng.accuracy();
                    for (const target of targetStates) {
                        const accuracy: AccuracyProfile = calculateAccuracy(actor, target, move);
                        const targetInfo: iTargetInfo = evaluateResult(target, accuracy, roll);
                        targets.push(targetInfo);
                    }
                } else {
                    for (const target of targetStates) {
                        targets.push({
                            target: target,
                            effectiveness: 0,
                            result: "none"
                        })
                    }
                }

                //Now we have a valid actor, targets and move -- execute the move
                events.push({ type: "moveUsed", actor: action.actor, move: action.move, targets: targets.map(x => ({ target: x.target.id, result: x.result })) })
                const effects = resolveMove(this.state, move, actor, targets);
                events.push(...processEffects(this.state, effects));
                actor.acted = true;
                this.state.turn.step++;
                return {
                    success: true,
                    events: events,
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

                if (actor !== target && !canAssist(actor)) {
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

                //now we have a valid actor, target, and binding -- execute the escape
                const effects = resolveEscape(actor, target, binding);
                events.push(...processEffects(this.state, effects))
                if (!actor.acted) {
                    actor.acted = true;
                    if (actor.standing && canBonusEscape(actor)) {
                        actor.bonusEscapes++;
                    }
                } else {
                    actor.bonusEscapes--;
                }
                this.state.turn.step++;
                return {
                    success: true,
                    events: events,
                    state: this.getGameState(),
                };
            }
            case "stance": {
                events.push(...setStance(actor, actor.standing ? "moving" : "standing"));
                return {
                    success: true,
                    events: events,
                    state: this.getGameState(),
                };
            }
        }
    }

    private executeEnemyAction(intention: iIntention): GameEvent[] {
        const events: GameEvent[] = [];
        const actor = intention.action.actor;
        if (!actor) {
            return events;
        }
        const move = { ...intention.action.move };

        if (!canAttack(actor) || isSkipped(actor)) {
            return events;
        }

        let targetStates: iEntity[] = [...intention.action.targets];
        if (move.targets === "all") {
            if (move.target === "enemy") {
                targetStates = this.state.enemies;
            } else {
                targetStates = this.state.characters;
            }
            move.targets = targetStates.length
        }

        if (!isValidMove(this.state, actor, targetStates, move)) {
            return events;
        }

        const targets: iTargetInfo[] = evaluateIntention(intention);

        //Now we have a valid actor, targets and move -- execute the move
        events.push({ type: "moveUsed", actor: actor.id, move: move.id, targets: targets.map(x => ({ target: x.target.id, result: x.result })) })
        const effects = resolveMove(this.state, move, actor, targets);
        events.push(...processEffects(this.state, effects));
        this.state.turn.step++;
        return events;
    }

    private executeEnemyPhase(): GameEvent[] {
        const events: GameEvent[] = [];
        for (const enemy of this.state.enemies) {
            if (enemy.intention) {
                events.push(...this.executeEnemyAction(enemy.intention));
            }
            enemy.intention = null;
        }
        return events;
    }

    private advancePhase(): GameEvent[] {
        const events: GameEvent[] = [];

        if (this.state.turn.phase === "player") {
            this.state.turn.phase = "enemy";
        } else {
            for (const actor of this.state.characters) {
                actor.acted = false;
                if (canMove(actor)) {
                    events.push(...setStance(actor, "moving"));
                }
                actor.bonusEscapes = 0;
            }
            this.state.turn.phase = "player";
            this.state.turn.step = 1;
            this.state.turn.round++;
            events.push(...tickBuffs(this.state));
            this.updateIntentions();
        }
        events.push({ type: "phaseChanged", phase: this.state.turn.phase });

        return events;
    }

    private updateIntentions() {
        for (const enemy of this.state.enemies) {
            enemy.intention = null;
        }
        for (const enemy of this.state.enemies) {
            const roll = this.rng.accuracy();
            updateIntention(this.state, enemy, roll);
        }
    }
}