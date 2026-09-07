import { encounterList } from "../content/content";
import { calculateProgress, removeBinding } from "./bindings";
import { isValidMove } from "./combat";
import { findBinding, findCharacter, findEntity, findMove, getIEntitySide, isCharacter } from "./helpers";
import type { CharacterDef, EncounterDef, EnemyDef, iEnemy, iEntity, iGameState } from "./itypes";
import { XorShift32 } from "./random";
import { serializeGameState } from "./serialize";
import { canAttack, canUseEscape, canUseMove } from "./status";
import type { ActionFailureReason, ActionInfo, ActionResult, EncounterId, EntityId, GameAction, GameEvent, GameState } from "./types";

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
        for (const encounter of encounterList){
            encounters.push(encounter.id);
        }
        return encounters;
    }

    loadCharacter(character: CharacterDef) {
        this.state.characters.push({
            id: character.id,
            definition: character,
            acted: false,
            bindings: [],
            buffs: []
        });
    }

    loadEnemy(enemy: EnemyDef) {
        this.state.enemies.push({
            definition: enemy,
            buffs: [],
            id: enemy.id + this.nextEntityId++,
            currHp: enemy.hp,
            currDef: enemy.defense,
            intention: null,
        });
    }

    loadEncounter(id: EncounterId): boolean {
        const encounter = encounterList.find(x => x.id === id);
        if (encounter) {
            for (const enemy of encounter.enemies) {
                this.loadEnemy(enemy);
            }
            if (encounter.setup) {
                encounter.setup(this.state);
            }
            this.updateIntentions();
            return true;
        }
        return false;
    }

    getActions(name: EntityId): ActionInfo[] {
        const actions: ActionInfo[] = [];
        const character = findCharacter(this.state, name);
        if (character) {
            for (const move of character.definition.moves) {
                const { activate, isValid, ...moveInfo } = move;
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
                        move: moveInfo,
                        available: true
                    });
                } else {
                    actions.push({
                        move: moveInfo,
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

                const targets: iEntity[] = [];
                for (const target of action.targets) {
                    const targetstate = findEntity(this.state, target);
                    if (targetstate) {
                        targets.push(targetstate);
                    } else {
                        return {
                            success: false,
                            reason: "invalidTarget"
                        };
                    }
                }

                const move = findMove(actor, action.move);
                if (!move) {
                    return {
                        success: false,
                        reason: "invalidMove"
                    };
                }

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

                if (!isValidMove(this.state, actor, targets, move)) {
                    return {
                        success: false,
                        reason: "moveUnavailable"
                    };
                }

                //Now we have a valid actor, targets and move -- execute the move
                events.push({ type: "moveUsed", actor: action.actor, move: action.move, targets: action.targets })
                events.push(...move.activate(this.state, actor, targets));
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

                if (actor.acted) {
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
                actor.acted = true;
                this.state.turn.step++;
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
            }
            this.state.turn.phase = "player";
            this.state.turn.step = 1;
            this.state.turn.round++;
            this.updateIntentions();
        }
        events.push({ type: "phaseChanged", phase: this.state.turn.phase });

        return events;
    }


    updateIntentions() {
        for (const enemy of this.state.enemies) {
            enemy.intention = null;
        }
        for (const enemy of this.state.enemies) {
            this.updateIntention(enemy);
        }
    }

    updateIntention(actor: iEnemy) {
        actor.intention = actor.definition.ai(this.state, actor);
    }
}


