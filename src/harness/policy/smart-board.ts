import type {
    ActionView,
    BindingLevel,
    Character,
    Effect,
    Enemy,
    EntityId,
    GameState,
    ModifierSet,
    MoveType,
} from "../../engine/public/types";
import type { PolicyContext } from "../harness";

export type SmartCapabilityState =
    | "available"
    | "spent"
    | "skipped"
    | "incapacitated"
    | "unavailable";

export type SmartBindingLevelCounts = Readonly<Record<BindingLevel, number>>;

export interface SmartTrapAssessment {
    readonly id: string;
    readonly amount: number;
}

export interface SmartIncomingBindingAssessment {
    readonly known: number;
    readonly unknownEffects: number;
}

export interface SmartCharacterAssessment {
    readonly id: EntityId;
    readonly totalBinding: number;
    readonly peakBinding: number;
    readonly peakBindingLevel: BindingLevel;
    readonly bindingLevels: SmartBindingLevelCounts;
    readonly hardOrWorseBindings: number;
    readonly extremeOrWorseBindings: number;
    readonly impossibleOrMaxBindings: number;
    readonly blockedMoveTypes: readonly MoveType[];
    readonly modifiers: Readonly<ModifierSet>;
    readonly standing: boolean;
    readonly acted: boolean;
    readonly bonusEscapes: number;
    readonly capability: SmartCapabilityState;
    readonly capabilityReason?: ActionView["reason"];
    readonly availableMoves: number;
    readonly availableEscapes: number;
    readonly availableAssists: number;
    readonly availableEscapesAndAssists: number;
    readonly incomingBinding: SmartIncomingBindingAssessment;
    readonly threateningEnemyIds: readonly EntityId[];
}

export interface SmartEnemyTargetAssessment extends SmartIncomingBindingAssessment {
    readonly characterId: EntityId;
}

export interface SmartEnemyAssessment {
    readonly id: EntityId;
    readonly rank: Enemy["rank"];
    readonly totalKnownIncomingBinding: number;
    readonly unknownIncomingBindingEffects: number;
    readonly targetedCharacterIds: readonly EntityId[];
    readonly bindingTargets: readonly SmartEnemyTargetAssessment[];
    readonly incomingTraps: readonly SmartTrapAssessment[];
    readonly totalIncomingTrapAmount: number;
}

export interface SmartPartyAssessment {
    readonly totalCharacters: number;
    readonly availableActors: number;
    readonly spentActors: number;
    readonly skippedActors: number;
    readonly incapacitatedActors: number;
    readonly unavailableActors: number;
    readonly totalAvailableMoves: number;
    readonly totalAvailableEscapes: number;
    readonly totalAvailableAssists: number;
    readonly totalAvailableEscapesAndAssists: number;
    readonly totalBlockedMoveTypes: number;
    readonly charactersWithBonusEscapes: number;
    readonly standingCharacters: number;
    readonly totalBinding: number;
    readonly peakBinding: number;
    readonly peakBindingLevel: BindingLevel;
    readonly hardOrWorseBindings: number;
    readonly extremeOrWorseBindings: number;
    readonly impossibleOrMaxBindings: number;
    readonly totalKnownIncomingBinding: number;
    readonly unknownIncomingBindingEffects: number;
    readonly currentTraps: readonly SmartTrapAssessment[];
    readonly totalCurrentTrapAmount: number;
    readonly incomingTraps: readonly SmartTrapAssessment[];
    readonly totalIncomingTrapAmount: number;
}

export interface SmartBoardAssessment {
    readonly party: SmartPartyAssessment;
    readonly characters: readonly SmartCharacterAssessment[];
    readonly enemies: readonly SmartEnemyAssessment[];
}

const BINDING_LEVELS: readonly BindingLevel[] = [
    "none",
    "easy",
    "medium",
    "hard",
    "extreme",
    "impossible",
    "max",
];

const BINDING_LEVEL_ORDINAL = new Map(
    BINDING_LEVELS.map((level, ordinal) => [level, ordinal] as const),
);

/** Pure assessment of public state, action capability, and committed enemy intentions. */
export function assessSmartBoard(context: Pick<PolicyContext, "state" | "actions">): SmartBoardAssessment {
    const actionByCharacter = new Map(context.actions.map((action) => [action.id, action]));
    const enemies = context.state.enemies.map((enemy) => assessEnemy(enemy, context.state));
    const incomingByCharacter = aggregateIncomingByCharacter(
        context.state.characters,
        enemies,
    );
    const characters = context.state.characters.map((character) => assessCharacter(
        character,
        actionByCharacter.get(character.id),
        incomingByCharacter.get(character.id) ?? emptyIncomingCharacter(),
    ));
    const currentTraps = aggregateTraps(context.state.traps);
    const incomingTraps = aggregateTraps(enemies.flatMap((enemy) => enemy.incomingTraps));

    return {
        party: assessParty(characters, currentTraps, incomingTraps),
        characters,
        enemies,
    };
}

function assessCharacter(
    character: Character,
    action: ActionView | undefined,
    incoming: IncomingCharacter,
): SmartCharacterAssessment {
    const bindingLevels = emptyBindingLevels();
    let totalBinding = 0;
    let peakBinding = 0;
    let peakBindingLevel: BindingLevel = "none";
    for (const binding of character.bindings) {
        totalBinding += binding.value;
        peakBinding = Math.max(peakBinding, binding.value);
        bindingLevels[binding.level] += 1;
        if (bindingOrdinal(binding.level) > bindingOrdinal(peakBindingLevel)) {
            peakBindingLevel = binding.level;
        }
    }

    const availableEscapes = action?.escapes.filter((escape) =>
        escape.available && escape.target === character.id
    ).length ?? 0;
    const availableAssists = action?.escapes.filter((escape) =>
        escape.available && escape.target !== character.id
    ).length ?? 0;

    return {
        id: character.id,
        totalBinding,
        peakBinding,
        peakBindingLevel,
        bindingLevels,
        hardOrWorseBindings: countAtOrAbove(bindingLevels, "hard"),
        extremeOrWorseBindings: countAtOrAbove(bindingLevels, "extreme"),
        impossibleOrMaxBindings: countAtOrAbove(bindingLevels, "impossible"),
        blockedMoveTypes: [...character.blockedMoveTypes],
        modifiers: { ...character.modifiers },
        standing: character.standing,
        acted: character.acted,
        bonusEscapes: character.bonusEscapes,
        capability: capabilityState(action),
        ...(action?.reason ? { capabilityReason: action.reason } : {}),
        availableMoves: action?.moves.filter(({ available }) => available).length ?? 0,
        availableEscapes,
        availableAssists,
        availableEscapesAndAssists: availableEscapes + availableAssists,
        incomingBinding: {
            known: incoming.known,
            unknownEffects: incoming.unknownEffects,
        },
        threateningEnemyIds: [...incoming.enemyIds],
    };
}

function assessEnemy(enemy: Enemy, state: GameState): SmartEnemyAssessment {
    const characterIds = new Set(state.characters.map(({ id }) => id));
    const targetedIds = new Set<EntityId>();
    const bindingByTarget = new Map<EntityId, MutableIncoming>();
    const traps: SmartTrapAssessment[] = [];

    for (const intention of enemy.intentions) {
        for (const target of intention.targets) {
            if (characterIds.has(target.target)) targetedIds.add(target.target);
            collectThreatEffects(target.effects, characterIds, bindingByTarget, traps);
        }
        collectThreatEffects(intention.effects, characterIds, bindingByTarget, traps);
    }

    const bindingTargets = state.characters.flatMap(({ id }) => {
        const incoming = bindingByTarget.get(id);
        return incoming
            ? [{ characterId: id, known: incoming.known, unknownEffects: incoming.unknownEffects }]
            : [];
    });
    const incomingTraps = aggregateTraps(traps);

    return {
        id: enemy.id,
        rank: enemy.rank,
        totalKnownIncomingBinding: sum(bindingTargets, ({ known }) => known),
        unknownIncomingBindingEffects: sum(bindingTargets, ({ unknownEffects }) => unknownEffects),
        targetedCharacterIds: state.characters.flatMap(({ id }) =>
            targetedIds.has(id) || bindingByTarget.has(id) ? [id] : []
        ),
        bindingTargets,
        incomingTraps,
        totalIncomingTrapAmount: sum(incomingTraps, ({ amount }) => amount),
    };
}

function collectThreatEffects(
    effects: readonly Effect[],
    characterIds: ReadonlySet<EntityId>,
    bindingByTarget: Map<EntityId, MutableIncoming>,
    traps: SmartTrapAssessment[],
): void {
    for (const effect of effects) {
        if (effect.type === "binding" && characterIds.has(effect.target)) {
            if (effect.amount === undefined) {
                incomingFor(bindingByTarget, effect.target).unknownEffects += 1;
            } else if (effect.amount > 0) {
                incomingFor(bindingByTarget, effect.target).known += effect.amount;
            }
        } else if (effect.type === "trap" && effect.amount > 0) {
            traps.push({ id: effect.trap, amount: effect.amount });
        }
    }
}

function assessParty(
    characters: readonly SmartCharacterAssessment[],
    currentTraps: readonly SmartTrapAssessment[],
    incomingTraps: readonly SmartTrapAssessment[],
): SmartPartyAssessment {
    const bindingLevels = emptyBindingLevels();
    for (const character of characters) {
        for (const level of BINDING_LEVELS) {
            bindingLevels[level] += character.bindingLevels[level];
        }
    }

    return {
        totalCharacters: characters.length,
        availableActors: count(characters, ({ capability }) => capability === "available"),
        spentActors: count(characters, ({ capability }) => capability === "spent"),
        skippedActors: count(characters, ({ capability }) => capability === "skipped"),
        incapacitatedActors: count(characters, ({ capability }) => capability === "incapacitated"),
        unavailableActors: count(characters, ({ capability }) => capability === "unavailable"),
        totalAvailableMoves: sum(characters, ({ availableMoves }) => availableMoves),
        totalAvailableEscapes: sum(characters, ({ availableEscapes }) => availableEscapes),
        totalAvailableAssists: sum(characters, ({ availableAssists }) => availableAssists),
        totalAvailableEscapesAndAssists: sum(
            characters,
            ({ availableEscapesAndAssists }) => availableEscapesAndAssists,
        ),
        totalBlockedMoveTypes: sum(characters, ({ blockedMoveTypes }) => blockedMoveTypes.length),
        charactersWithBonusEscapes: count(characters, ({ bonusEscapes }) => bonusEscapes > 0),
        standingCharacters: count(characters, ({ standing }) => standing),
        totalBinding: sum(characters, ({ totalBinding }) => totalBinding),
        peakBinding: Math.max(0, ...characters.map(({ peakBinding }) => peakBinding)),
        peakBindingLevel: highestBindingLevel(characters.map(({ peakBindingLevel }) => peakBindingLevel)),
        hardOrWorseBindings: countAtOrAbove(bindingLevels, "hard"),
        extremeOrWorseBindings: countAtOrAbove(bindingLevels, "extreme"),
        impossibleOrMaxBindings: countAtOrAbove(bindingLevels, "impossible"),
        totalKnownIncomingBinding: sum(characters, ({ incomingBinding }) => incomingBinding.known),
        unknownIncomingBindingEffects: sum(
            characters,
            ({ incomingBinding }) => incomingBinding.unknownEffects,
        ),
        currentTraps,
        totalCurrentTrapAmount: sum(currentTraps, ({ amount }) => amount),
        incomingTraps,
        totalIncomingTrapAmount: sum(incomingTraps, ({ amount }) => amount),
    };
}

interface MutableIncoming {
    known: number;
    unknownEffects: number;
}

interface IncomingCharacter extends MutableIncoming {
    enemyIds: EntityId[];
}

function aggregateIncomingByCharacter(
    characters: readonly Character[],
    enemies: readonly SmartEnemyAssessment[],
): Map<EntityId, IncomingCharacter> {
    const result = new Map(characters.map(({ id }) => [id, emptyIncomingCharacter()]));
    for (const enemy of enemies) {
        for (const target of enemy.bindingTargets) {
            const incoming = result.get(target.characterId);
            if (!incoming) continue;
            incoming.known += target.known;
            incoming.unknownEffects += target.unknownEffects;
            incoming.enemyIds.push(enemy.id);
        }
    }
    return result;
}

function aggregateTraps(traps: readonly SmartTrapAssessment[]): SmartTrapAssessment[] {
    const amounts = new Map<string, number>();
    for (const trap of traps) {
        amounts.set(trap.id, (amounts.get(trap.id) ?? 0) + trap.amount);
    }
    return [...amounts].map(([id, amount]) => ({ id, amount }));
}

function capabilityState(action: ActionView | undefined): SmartCapabilityState {
    if (action?.available) return "available";
    switch (action?.reason) {
        case "actorAlreadyActed": return "spent";
        case "actorSkipped": return "skipped";
        case "actorIncapacitated": return "incapacitated";
        default: return "unavailable";
    }
}

function emptyBindingLevels(): Record<BindingLevel, number> {
    return {
        none: 0,
        easy: 0,
        medium: 0,
        hard: 0,
        extreme: 0,
        impossible: 0,
        max: 0,
    };
}

function bindingOrdinal(level: BindingLevel): number {
    return BINDING_LEVEL_ORDINAL.get(level) ?? 0;
}

function highestBindingLevel(levels: readonly BindingLevel[]): BindingLevel {
    return levels.reduce<BindingLevel>(
        (highest, level) => bindingOrdinal(level) > bindingOrdinal(highest) ? level : highest,
        "none",
    );
}

function countAtOrAbove(
    levels: Readonly<Record<BindingLevel, number>>,
    threshold: BindingLevel,
): number {
    const thresholdOrdinal = bindingOrdinal(threshold);
    return BINDING_LEVELS.reduce(
        (total, level) => total + (bindingOrdinal(level) >= thresholdOrdinal ? levels[level] : 0),
        0,
    );
}

function incomingFor(
    byTarget: Map<EntityId, MutableIncoming>,
    target: EntityId,
): MutableIncoming {
    let incoming = byTarget.get(target);
    if (!incoming) {
        incoming = { known: 0, unknownEffects: 0 };
        byTarget.set(target, incoming);
    }
    return incoming;
}

function emptyIncomingCharacter(): IncomingCharacter {
    return { known: 0, unknownEffects: 0, enemyIds: [] };
}

function sum<T>(values: readonly T[], select: (value: T) => number): number {
    return values.reduce((total, value) => total + select(value), 0);
}

function count<T>(values: readonly T[], predicate: (value: T) => boolean): number {
    return values.reduce((total, value) => total + (predicate(value) ? 1 : 0), 0);
}
