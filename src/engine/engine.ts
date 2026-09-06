import { findCharacter, findEntity, findMove, getIEntitySide, isCharacter } from "./helpers";
import type { CharacterDef, EnemyDef, iEnemy, iEntity, iGameState } from "./itypes";
import { serializeGameState } from "./serialize";
import type { ActionInfo, ActionResult, ActionUnavailableReason, EntityId, GameAction, GameEvent, GameState } from "./types";

export class GameEngine {
    private state: iGameState;
    private nextEntityId = 1;

    constructor() {
        this.state = {
            turn: { round: 1, step: 1, phase: "player" },
            characters: [],
            enemies: []
        };
    }

    getGameState(): GameState {
        return serializeGameState(this.state);
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
        let index = this.state.enemies.push({
            definition: enemy,
            buffs: [],
            id: enemy.id + this.nextEntityId++,
            currHp: enemy.hp,
            currDef: enemy.defense,
            intention: null,
        });
        this.updateIntentions(this.state.enemies[index-1]);
    }

    getActions(name: EntityId): ActionInfo[] {
        const actions: ActionInfo[] = [];
        const character = findCharacter(this.state, name);
        if (character) {
            for (const move of character.definition.moves) {
                const { activate, isValid, ...moveInfo } = move;
                let available = true;
                let reason: ActionUnavailableReason = "moveUnavailable";
                if (this.state.turn.phase !== "player") {
                    available = false;
                    reason = "wrongPhase";
                }
                if (character.acted) {
                    available = false;
                    reason = "actorAlreadyActed";
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
            case "attack":
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

                if (!move.isValid(this.state, actor, targets)) {
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
            case "escape":
                this.state.turn.step++;
                return {
                    success: true,
                    events: events,
                    state: this.getGameState(),
                };
            case "endTurn":
                events.push(...this.advancePhase());
                return {
                    success: true,
                    events: events,
                    state: this.getGameState(),
                };
        }
    }

    executeEnemyPhase() : GameEvent[] {
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
        events.push(...this.advancePhase());
        return events;
    }

    advancePhase() : GameEvent[] {
        const events: GameEvent[] = [];

        if (this.state.turn.phase === "player") {
            this.state.turn.phase = "enemy";
        } else {
            for (const actor of this.state.characters) {
                actor.acted = false;
            }
            for (const enemy of this.state.enemies) {
                this.updateIntentions(enemy);
            }
            this.state.turn.phase = "player";
            this.state.turn.step = 1;
            this.state.turn.round++;
        }
        events.push({ type: "phaseChanged", phase: this.state.turn.phase });
        if (this.state.turn.phase === "enemy") {
            events.push(...this.executeEnemyPhase());
        }

        return events;
    }


    updateIntentions(actor: iEnemy) {
        actor.intention = actor.definition.ai(this.state,actor);
    }
}


