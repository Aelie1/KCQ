import { encounterList } from "../content/content";
import { calculateProgress, removeBinding } from "./bindings";
import { calculateAccuracy, evaluateResult, isValidMove, setStance, updateIntentions } from "./combat";
import { findBinding, findCharacter, findEntity, findMove, getIEntitySide, isCharacter } from "./helpers";
import type { CharacterDef, EnemyDef, iEnemy, iEntity, iGameState } from "./itypes";
import { XorShift32 } from "./random";
import { serializeGameState, serializeMove } from "./serialize";
import { canAttack, canBonusEscape, canMove, canUseEscape, canUseMove } from "./status";
import type { AccuracyProfile, ActionFailureReason, ActionInfo, ActionResult, EncounterId, EntityId, GameAction, GameEvent, GameState } from "./types";
import type { TargetInfo } from "./itypes";
import { tickBuffs } from "./buffs";

export class GameEngine {
    private state: iGameState;
    private nextEntityId = 1;
    private seed: number;
    private rng: XorShift32;

    constructor(seed?: number) {
        this.state = {
            turn: { round: 1, step: 1, phase: "player" },
            characters: [],
            enemies: []
        };
        seed ??= Math.floor(Math.random() * 0x100000000)
        this.seed = seed;
        this.rng = new XorShift32(seed);
    }

    getGameState(): GameState {
        return serializeGameState(this.state);
    }

    listEncounters(): EncounterId[] {
        const encounters: EncounterId[] = [];
        for (const encounter of encounterList) {
            encounters.push(encounter.id);
        }
        return encounters;
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

    loadEnemy(enemy: EnemyDef) : GameEvent[] {
        const events: GameEvent[] = [];
        this.state.enemies.push({
            definition: enemy,
            buffs: [],
            id: enemy.id + this.nextEntityId++,
            currHp: enemy.hp,
            currDef: enemy.defense,
            intention: null,
        });
        events.push({type:"enemySpawned",target:enemy.id});
        return events;
    }

    loadEncounter(id: EncounterId): GameEvent[] {
        const events: GameEvent[] = [];
        const encounter = encounterList.find(x => x.id === id);
        if (!encounter) {
            events.push({type:"encounter",id:id,success:false});
            return events;
        }
        for (const enemy of encounter.enemies) {
            events.push(...this.loadEnemy(enemy));
        }
        if (encounter.setup) {
            encounter.setup(this.state);
        }
        updateIntentions(this.state);
        events.push({type:"encounter",id:id,success:true});
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

    executeAction(action: GameAction): ActionResult {
        const events: GameEvent[] = [];
        switch (action.type) {
            case "attack": {
                const actor = findEntity(this.state, action.actor);
                if (!actor) {
                    return {
                        success: false,
                        reason: "invalidActor"
                    };
                }
                const side = getIEntitySide(actor)
                if (side !== this.state.turn.phase) {
                    return {
                        success: false,
                        reason: "wrongPhase"
                    };
                }

                if (isCharacter(actor) && actor.acted) {
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

                if (isCharacter(actor) && !canAttack(actor)) {
                    return {
                        success: false,
                        reason: "statusRestriction"
                    };
                }

                if (isCharacter(actor) && !canUseMove(actor, move.type)) {
                    return {
                        success: false,
                        reason: "bindingRestriction"
                    };
                }

                let targetIds : EntityId[] = [...action.targets];
                if (move.targets === "all") {
                    if (move.target === "enemy") {
                        targetIds = this.state.enemies.map(x => x.id);
                    } else {
                        targetIds = this.state.characters.map(x => x.id);
                    }
                    move.targets = targetIds.length
                }

                const targetStates: iEntity[] = [];
                for (const target of targetIds) {
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

                if (!isValidMove(this.state, actor, targetStates, move)) {
                    return {
                        success: false,
                        reason: "moveUnavailable"
                    };
                }

                const targets: TargetInfo[] = [];
                if (move.targets > 0) {
                    const roll: number = this.rng.accuracy();
                    for (const target of targetStates) {
                        const accuracy: AccuracyProfile = calculateAccuracy(actor, target, move);
                        const targetInfo: TargetInfo = evaluateResult(target, accuracy, roll);
                        targets.push(targetInfo);
                    }
                }

                //Now we have a valid actor, targets and move -- execute the move
                events.push({ type: "moveUsed", actor: action.actor, move: action.move, targets: targetIds })
                for (const target of targets) {
                    events.push({
                        type: "accuracyResult",
                        actor: actor.id,
                        target: target.target.id,
                        move: move.id,
                        result: target.result,
                        effectiveness: target.effectiveness
                    })
                }
                const successfulTargets = targets.filter(
                    target => target.result !== "miss"
                );
                if (move.targets === 0 || successfulTargets.length > 0) {
                    events.push(...move.activate(this.state, actor, successfulTargets));
                }
                if (isCharacter(actor)) {
                    actor.acted = true;
                }
                this.state.turn.step++;
                return {
                    success: true,
                    events: events,
                    state: this.getGameState(),
                };
            }
            case "escape": {
                if (this.state.turn.phase !== "player") {
                    return {
                        success: false,
                        reason: "wrongPhase"
                    };
                }

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
                if (this.state.turn.phase !== "player") {
                    return {
                        success: false,
                        reason: "wrongPhase"
                    };
                }
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
                if (this.state.turn.phase !== "player") {
                    return {
                        success: false,
                        reason: "wrongPhase"
                    };
                }
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

    executeEnemyPhase(): GameEvent[] {
        const events: GameEvent[] = [];
        for (const enemy of this.state.enemies) {
            let result: ActionResult | null = null;
            if (enemy.intention) {
                result = this.executeAction(enemy.intention);
            }
            if (result?.success === true) {
                events.push(...result.events);
            }
        }
        return events;
    }

    advancePhase(): GameEvent[] {
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
            tickBuffs(this.state);
            updateIntentions(this.state);
        }
        events.push({ type: "phaseChanged", phase: this.state.turn.phase });

        return events;
    }

}