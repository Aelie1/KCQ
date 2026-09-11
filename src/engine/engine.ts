import { calculateAccuracy, evaluateProfile, evaluateResult, isValidTarget, resolveEscape, resolveMove, setStance, tickBuffs, tickCooldowns, tickPlayers } from "./combat";
import { GameEffects } from "./effects";
import { evaluateIntention, spawnEnemy, updateIntention } from "./enemies";
import { findBinding, findCharacter, findEntity, findMove } from "./find";
import { getMoves } from "./helpers";
import { type CharacterDef, type EncounterDef, type iEntity, type iGameState, type iIntention, type iMove, type iTargetInfo } from "./itypes";
import { Random } from "./random";
import { serializeEffect, serializeGameState, serializeMove } from "./serialize";
import { canAct, canAssist, canAttack, canBonusEscape, canUseMoveType, isIncapacitated, isSkipped } from "./status";
import type { AccuracyProfile, AccuracyResult, ActionFailureReason, ActionInfo, ActionResult, AvailabilityInfo, EncounterId, EntityId, EscapeOptions, GameEvent, GameState, MoveId, PlayerAction, StanceInfo, ValidityInfo } from "./types";

export class GameEngine {
    private state: iGameState;
    private seed: number;
    private rng: Random;
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
        this.rng = new Random(seed);
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
        const result = new GameEffects();
        const encounter = this.encounters.find(x => x.id === id);
        if (!encounter) {
            result.addEvent({
                type: "encounter",
                id: id,
                success: false
            });
            return result.getEvents();
        }
        for (const enemy of encounter.enemies) {
            result.fromResult(this.state, spawnEnemy(this.state, enemy));
        }
        if (encounter.setup) {
            encounter.setup(this.state);
        }
        this.updateIntentions();
        result.addEvent({
            type: "encounter",
            id: id,
            success: true
        });
        return result.getEvents();
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

    getMoves(actor: EntityId): ActionInfo[] {
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

    getTargets(actor: EntityId, move: MoveId): ValidityInfo[] {
        const result: ValidityInfo[] = [];
        const character = findCharacter(this.state, actor);
        if (!character) {
            result.push({
                valid: false,
                reason: "invalidActor"
            })
            return result;
        }

        const moveState = findMove(character, move);
        if (!moveState) {
            result.push({
                valid: false,
                reason: "invalidMove"
            })
            return result;
        }

        switch (moveState.side) {
            case "none":
                result.push(isValidTarget(character, null, moveState));
                break;
            case "player":
                for (const target of this.state.characters) {
                    result.push(isValidTarget(character, target, moveState));
                }
                break;
            case "enemy":
                for (const target of this.state.enemies) {
                    result.push(isValidTarget(character, target, moveState));
                }
                break;
        }

        return result;
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

    executeAction(action: PlayerAction): ActionResult {
        const result = new GameEffects();
        if (this.state.turn.phase !== "player") {
            return {
                success: false,
                reason: "wrongPhase"
            };
        }
        if (action.type === "endTurn") {
            result.fromResult(this.state, this.advancePhase());
            result.fromResult(this.state, this.executeEnemyPhase());
            result.fromResult(this.state, this.advancePhase());

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

        const capability = canAct(actor, action.type);
        if (capability) {
            return capability;
        }

        switch (action.type) {
            case "attack": {
                const move = findMove(actor, action.move);
                if (!move) {
                    return {
                        success: false,
                        reason: "invalidMove"
                    };
                }

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
                    switch (move.side) {
                        case "enemy":
                            targetStates.push(...this.state.enemies);
                            break;
                        case "player":
                            for (const character of this.state.characters) {
                                const info = isValidTarget(actor, character, move);
                                if (info.valid) {
                                    targetStates.push(character);
                                }
                            }
                            break;
                    }
                } else {
                    for (const target of action.targets) {
                        const targetState = findEntity(this.state, target);
                        if (targetState) {
                            const info = isValidTarget(actor, targetState, move);
                            if (info.valid) {
                                targetStates.push(targetState);
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
                    if (targetStates.length != move.targets) {
                        return {
                            success: false,
                            reason: "invalidTargetCount"
                        };
                    }
                }
                
                const iMove: iMove = { definition: move };
                const targets: iTargetInfo[] = [];
                let anyHits: boolean = false;
                if (move.accuracy) {
                    for (const target of targetStates) {
                        const roll: number = this.rng.accuracy();
                        const accuracy: AccuracyProfile = calculateAccuracy(actor, target, move);
                        const targetInfo: iTargetInfo = evaluateResult(target, accuracy, roll);
                        targets.push(targetInfo);
                        if (targetInfo.band !== "miss") {
                            anyHits = true;
                        }
                    }
                    if (move.side === "none") {
                        const roll: number = this.rng.accuracy();
                        const accuracy: AccuracyProfile = calculateAccuracy(actor, null, move);
                        const result: AccuracyResult = evaluateProfile(accuracy, roll, 0);
                        iMove.band = result.band;
                        iMove.effectiveness = result.effectiveness;
                        if (result.band !== "miss") {
                            anyHits = true;
                        }
                    }
                } else {
                    for (const target of targetStates) {
                        targets.push({
                            target: target,
                            effectiveness: 0,
                            band: "none"
                        })
                    }
                    anyHits = true;
                }

                //Now we have a valid actor, targets and move -- execute the move
                result.addEvent({
                    type: "moveUsed",
                    actor: action.actor,
                    move: action.move,
                    targets: targets.map(x => ({ target: x.target.id, result: x.band }))
                })
                result.fromEffects(this.state, resolveMove(this.state, iMove, actor, targets));

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
                result.fromEffects(this.state, resolveEscape(actor, target, binding));
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
                    events: result.getEvents(),
                    state: this.getGameState(),
                };
            }
            case "stance": {
                result.fromResult(this.state, setStance(actor, actor.standing ? "moving" : "standing"));
                return {
                    success: true,
                    events: result.getEvents(),
                    state: this.getGameState(),
                };
            }
        }
    }

    private executeEnemyAction(intention: iIntention): GameEffects {
        const result = new GameEffects();
        const actor = intention.actor;
        const move = intention.move;
        if (!actor) {
            return result;
        }

        if (!canAttack(actor) || isSkipped(actor)) {
            return result;
        }

        const targets: iTargetInfo[] = evaluateIntention(intention);

        //Now we have a valid actor, targets and move -- execute the move
        result.addEvent({
            type: "moveUsed",
            actor: actor.id,
            move: move.definition.id,
            targets: targets.map(x => ({ target: x.target.id, result: x.band }))
        });
        result.fromEffects(this.state, resolveMove(this.state, move, actor, targets));
        this.state.turn.step++;
        return result;
    }

    private executeEnemyPhase(): GameEffects {
        const result = new GameEffects();
        for (const enemy of this.state.enemies) {
            if (enemy.intention) {
                result.fromResult(this.state, this.executeEnemyAction(enemy.intention));
                const move = enemy.intention.move.definition;
                if (move.cooldown) {
                    enemy.cooldowns[move.id] = move.cooldown;
                }
            }
            enemy.intention = null;
        }
        return result;
    }

    private advancePhase(): GameEffects {
        const result = new GameEffects();

        if (this.state.turn.phase === "player") {
            this.state.turn.phase = "enemy";
        } else {
            tickCooldowns(this.state.enemies);
            result.fromResult(this.state, tickBuffs(this.state));
            result.fromResult(this.state, tickPlayers(this.state));
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
        for (const enemy of this.state.enemies) {
            enemy.intention = null;
        }
        for (const enemy of this.state.enemies) {
            updateIntention(this.state, enemy, this.rng);
        }
    }
}