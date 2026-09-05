import type { CharacterDef, EnemyDef, iCharacter, iEnemy, iEntity, iGameState, MoveDef } from "./itypes";
import { serializeGameState } from "./serialize";
import type { ActionInfo, ActionResult, ActionUnavailableReason, EntityId, EntitySide, GameAction, GameEvent, GameState, MoveId } from "./types";

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
    this.state.enemies.push({
      definition: enemy,
      buffs: [],
      id: enemy.id + this.nextEntityId++,
      currHp: enemy.hp,
      currDef: enemy.defense
    });
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

        if (!move.isValid(this.state,actor,targets)) {
          return {
            success: false,
            reason: "moveUnavailable"
          };
        }

        //Now we have a valid actor, targets and move -- execute the move
        events.push({type:"moveUsed",actor:action.actor,move:action.move,targets:action.targets})
        events.push(...move.activate(this.state,actor,targets));
        if (isCharacter(actor)) {
          actor.acted=true;
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
        if (this.state.turn.phase === "player") {
          this.state.turn.phase = "enemy";
        } else {
          for (const actor of this.state.characters) {
            actor.acted = false;
          }
          this.state.turn.phase = "player";
          this.state.turn.step=1;
          this.state.turn.round++;
          }
        events.push({type:"phaseChanged",phase:this.state.turn.phase})
        return {
          success: true,
          events: events,
          state: this.getGameState(),
        };
    }
  }
}

export function findCharacter(state: iGameState, id: EntityId): iCharacter | undefined {
  return state.characters.find(character => character.definition.id === id);
}

export function findEnemy(state: iGameState, id: EntityId): iEnemy | undefined {
  return state.enemies.find(enemy => enemy.id === id);
}

export function findMove(entity: iEntity, id: MoveId): MoveDef | undefined {
  return entity.definition.moves.find(move => move.id === id);
}

export function findEntity(state: iGameState, id: EntityId): iCharacter | iEnemy | undefined {
  return findCharacter(state, id) ?? findEnemy(state, id);
}

export function getEntitySide(state: iGameState, id: EntityId): EntitySide | undefined {
  if (findCharacter(state, id)) {
    return "player";
  }

  if (findEnemy(state, id)) {
    return "enemy";
  }

  return undefined;
}

export function getIEntitySide(entity: iEntity): EntitySide {
  return (isCharacter(entity)) ? "player" : "enemy";
}


export function isCharacter(entity: iCharacter | iEnemy): entity is iCharacter {
  return "bindings" in entity;
}

export function isEnemy(entity: iCharacter | iEnemy): entity is iEnemy {
  return "currHp" in entity;
}


