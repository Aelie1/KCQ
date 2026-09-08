import { calculateProgress, removeBinding } from "./bindings";
import { tickBuffs } from "./buffs";
import { calculateAccuracy, evaluateIntention, evaluateResult, isValidMove, loadEnemy, processEffects, resolveMove, setStance, updateIntention } from "./combat";
import { findBinding, findCharacter, findEntity, findMove } from "./helpers";
import type { CharacterDef, EncounterDef, iEntity, iGameState, iIntention, iTargetInfo } from "./itypes";
import { XorShift32 } from "./random";
import { serializeGameState, serializeMove } from "./serialize";
import { canAttack, canBonusEscape, canMove, canUseEscape, canUseMove, isSkipped } from "./status";
import type { AccuracyProfile, ActionFailureReason, ActionInfo, ActionResult, EncounterId, EntityId, GameEvent, GameState, MoveId, PlayerAction } from "./types";

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

    getActions(name: EntityId): ActionInfo[] {
        const actions: ActionInfo[] = [];
        const character = findCharacter(this.state, name);
        if (character) {
            for (const move of character.definition.moves) {
                let available = true;
                let reason: ActionFailureReason = "moveUnavailable";
                if (this.state.turn.phase !== "player") {
                    available = false;
                    reason = "wrongPhase";
                }
                else if (character.acted) {
                    available = false;
                    reason = "actorAlreadyActed";
                }
                else if (!canAttack(character)) {
                    available = false;
                    reason = "statusRestriction";
                }
                else if (!canUseMove(character, move.type)) {
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

    getAccuracyPreview(actor: EntityId, target: EntityId, move: MoveId): AccuracyProfile | null {
        const actorState = findEntity(this.state, actor);
        const targetState = findEntity(this.state, target);

        if (!actorState || !targetState) {
            return null;
        }

        const moveState = findMove(actorState,move);

        if (!moveState) {
            return null;
        }

        return calculateAccuracy(actorState,targetState,moveState);
    }

    executeAction(action: PlayerAction): ActionResult {
        const events: GameEvent[] = [];
        if (this.state.turn.phase !== "player") {
            return {
                success: false,
                reason: "wrongPhase"
            };
        }

        switch (action.type) {
            case "attack": {
                const actor = findCharacter(this.state, action.actor);
                if (!actor) {
                    return {
                        success: false,
                        reason: "invalidActor"
                    };
                }

                if (actor.acted) {
                    return {
                        success: false,
                        reason: "actorAlreadyActed"
                    };
                }

                const foundMove = findMove(actor, action.move);
                if (!foundMove) {
                    return {
                        success: false,
                        reason: "invalidMove"
                    };
                }

                const move = { ...foundMove };

                if (!canAttack(actor)) {
                    return {
                        success: false,
                        reason: "statusRestriction"
                    };
                }

                if (!canUseMove(actor, move.type)) {
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

                const targets: iTargetInfo[] = [];
                if (move.targets > 0) {
                    const roll: number = this.rng.accuracy();
                    for (const target of targetStates) {
                        const accuracy: AccuracyProfile = calculateAccuracy(actor, target, move);
                        const targetInfo: iTargetInfo = evaluateResult(target, accuracy, roll);
                        targets.push(targetInfo);
                    }
                }

                //Now we have a valid actor, targets and move -- execute the move
                events.push({ type: "moveUsed", actor: action.actor, move: action.move, targets: targets.map(x => ({target: x.target.id, result: x.result})) })
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
                const actor = findCharacter(this.state, action.actor);
                if (!actor) {
                    return {
                        success: false,
                        reason: "invalidActor"
                    };
                }

                if (actor.acted && !actor.bonusEscapes) {
                    return {
                        success: false,
                        reason: "actorAlreadyActed"
                    };
                }

                const target = findCharacter(this.state, action.target);
                if (!target) {
                    return {
                        success: false,
                        reason: "invalidTarget"
                    };
                }

                const amount = calculateProgress(actor, target, action.binding);
                const binding = findBinding(target, action.binding);
                if (!binding) {
                    return {
                        success: false,
                        reason: "invalidBinding"
                    }
                }

                if (actor === target && !canUseEscape(actor, target, binding)) {
                    return {
                        success: false,
                        reason: "escapeUnavailable"
                    }
                }

                if (actor !== target && !canUseEscape(actor, target, binding)) {
                    return {
                        success: false,
                        reason: "assistUnavailable"
                    }
                }

                events.push(...removeBinding(target, binding.definition, amount))
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
                const actor = findCharacter(this.state, action.actor);
                if (!actor) {
                    return {
                        success: false,
                        reason: "invalidActor"
                    };
                }
                if (actor.acted) {
                    return {
                        success: false,
                        reason: "actorAlreadyActed"
                    };
                }
                if (action.stance === "moving" && !canMove(actor)) {
                    return {
                        success: false,
                        reason: "actorImmobilized"
                    };
                }
                events.push(...setStance(actor, action.stance));
                return {
                    success: true,
                    events: events,
                    state: this.getGameState(),
                };
            }
            case "endTurn": {
                events.push(...this.advancePhase());
                events.push(...this.executeEnemyPhase());
                events.push(...this.advancePhase());

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

        const targets: iTargetInfo[] = (move.targets > 0) ? evaluateIntention(intention) : [];

        //Now we have a valid actor, targets and move -- execute the move
        events.push({ type: "moveUsed", actor: actor.id, move: move.id, targets: targets.map(x => ({target: x.target.id, result: x.result})) })
        const effects = resolveMove(this.state, move, actor, targets);
        events.push(...processEffects(this.state,effects));
        this.state.turn.step++;
        return events;
    }

    private executeEnemyPhase(): GameEvent[] {
        const events: GameEvent[] = [];
        for (const enemy of this.state.enemies) {
            if (enemy.intention) {
                events.push(...this.executeEnemyAction(enemy.intention));
            }
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