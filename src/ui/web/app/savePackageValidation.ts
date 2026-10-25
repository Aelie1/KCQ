import type { SavePackage } from "./savePackage";

// Validate the JSON boundary without resolving content definitions or loading an engine.
// Exact object shapes also prevent accidentally persisting frame snapshots or display text.
type Check = (value: unknown) => boolean;
const text: Check = value => typeof value === "string";
const number: Check = value => typeof value === "number" && Number.isFinite(value);
const integer: Check = value => number(value) && Number.isInteger(value) && (value as number) >= 0;
const boolean: Check = value => typeof value === "boolean";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const optional = (check: Check): Check => value => value === undefined || check(value);
const list = (check: Check): Check => value => Array.isArray(value) && value.every(check);
const record = (check: Check): Check => value => object(value) && Object.values(value).every(check);
const oneOf = (...values: unknown[]): Check => value => values.includes(value);
const shape = (fields: Record<string, Check>): Check => value => object(value)
    && Object.keys(value).every(key => Object.hasOwn(fields, key))
    && Object.entries(fields).every(([key, check]) => check(value[key]));
const variant = (key: string, variants: Record<string, Record<string, Check>>): Check => value => object(value)
    && typeof value[key] === "string" && Object.hasOwn(variants, value[key])
    && shape({ [key]: oneOf(value[key]), ...variants[value[key]] })(value);
const phase = oneOf("player", "enemy");
const stance = oneOf("moving", "standing");
const band = oneOf("none", "miss", "graze", "hit", "crit");
const level = oneOf("none", "light", "moderate", "heavy", "severe", "overwhelming", "max");
const trap = shape({ id: text, amount: number });
const buffFields = {
    id: text, icon: optional(oneOf("shield", "sword", "shield-off", "sword-off", "crown", "sun", "ambush", "sprayer")),
    severity: optional(number), duration: optional(number), linkedEntity: optional(text),
    statuses: optional(list(shape({ id: text, value: number }))), modifiers: optional(record(number)),
    moveList: optional(shape({ addedMoves: optional(list(text)), blockedMoves: optional(list(text)) })),
};
const buff = shape(buffFields);
const saveBuff = shape({ ...buffFields, active: boolean, callback: optional(text) });
const saveState = shape({
    campaign: text, seed: number, aiRng: number, accRng: number,
    turn: shape({ round: integer, step: integer, phase }), nextId: record(integer),
    encounter: value => value === null || text(value), difficulty: oneOf("casual", "standard", "veteran", "extreme", "mythic"),
    characters: list(shape({
        id: text, acted: boolean, standing: boolean, bonusEscapes: number,
        bindings: list(shape({ id: text, value: number, data: record(number) })), buffs: list(saveBuff),
        cooldowns: record(number), data: record(number),
    })),
    enemies: list(shape({
        id: text, defId: text, currHp: number, buffs: list(saveBuff), cooldowns: record(number), data: record(number),
        intentions: list(shape({
            actor: text, resolved: boolean,
            move: shape({ definition: text, binding: optional(text), band: optional(band), effectiveness: optional(number), roll: optional(number), data: optional(record(number)) }),
            rolls: list(shape({ target: value => value === null || text(value), roll: number })),
        })),
    })),
    traps: list(trap),
});

const endpoint = shape({ value: number, level: optional(level) });
const buffEndpoint = shape({ present: boolean, details: optional(buff) });
const stanceFields = { actor: text, initial: optional(stance), final: stance, summarized: optional(oneOf(true)) };
const stanceOutcome = shape({ kind: oneOf("stance"), ...stanceFields });
const outcome: Check = variant("kind", {
    bindingTick: { target: text, binding: text, level: optional(level), outcomes: list(value => outcome(value)) },
    resource: { target: text, resource: text, change: number, initial: optional(number), final: optional(number), max: optional(number) },
    damage: {
        target: text, damage: number, healing: number, blocked: number,
        hits: list(shape({ result: band, damage: number, healing: number, blocked: number, recordedZeroEffect: optional(oneOf(true)) }))
    },
    binding: { target: text, binding: text, change: number, blocked: number, initial: optional(endpoint), final: optional(endpoint) },
    buff: { buff: text, participants: list(shape({ target: text, initial: buffEndpoint, final: buffEndpoint })), summarized: optional(oneOf(true)) },
    stance: stanceFields,
    trap: { trap: text, change: optional(number), initial: optional(number), final: optional(number), triggers: list(shape({ actor: text, amount: number, severity: optional(number) })) },
    character: { target: text, operation: oneOf("incapacitated", "rescued") },
    enemy: { target: text, operation: oneOf("spawned", "defeated") },
    interrupt: { actor: text, reason: text }, refresh: { target: text }, retarget: { target: text, destination: text },
    intention: { target: text, move: text, operation: oneOf("cancelled", "weakened", "discorded") },
    bonus: { target: text, amount: number },
});
const outcomes = list(outcome);
const roster = { livingEnemies: optional(list(text)) };
const loadEntry = { id: text, success: boolean, outcomes, ...roster };
const entry = variant("kind", {
    move: { actor: text, move: text, result: optional(band), outcomes, ...roster }, escape: { actor: text, target: text, outcomes, ...roster },
    phase: { phase, round: optional(integer), outcomes, ...roster }, stance: { changes: list(stanceOutcome), outcomes, ...roster },
    encounter: loadEntry, character: loadEntry,
});
const context = shape({
    characters: list(shape({
        id: text, standing: boolean, data: record(number), buffs: list(buff),
        bindings: list(shape({ id: text, value: number, level: optional(level) }))
    })),
    enemies: list(shape({ id: text, buffs: list(buff) })), livingEnemies: optional(list(text)),
    traps: list(trap), turn: shape({ round: integer }),
});

const targetAmount = { target: text, amount: number };
const bindingAmount = { ...targetAmount, binding: text };
const buffMutation = { target: text, buff: text };
const leaf = variant("type", {
    enemyDamaged: targetAmount, enemyHealed: targetAmount, damageBlocked: targetAmount,
    bondageChanged: bindingAmount, bondageAdded: bindingAmount, bondageRemoved: bindingAmount, bondageBlocked: bindingAmount,
    buffAdded: buffMutation, buffUpdated: buffMutation, buffRemoved: buffMutation,
    enemySpawned: { target: text }, enemyDefeated: { target: text },
    stanceSet: { actor: text, stance }, cooldownChanged: { target: text, move: text, value: number },
    trapAdded: { actor: text, trap: text, amount: number }, trapRemoved: { actor: text, trap: text, amount: number }, trapTriggered: { actor: text, trap: text, amount: number, severity: optional(number) },
    actionInterrupted: { actor: text, reason: text }, actionRefreshed: { target: text }, targetChanged: { target: text, destination: text },
    intentionCancelled: { target: text, move: text }, intentionWeakened: { target: text, move: text }, intentionDiscorded: { target: text, move: text },
    dataChanged: { ...targetAmount, name: text }, characterIncapacitated: { target: text }, characterRescued: { target: text },
    bindingTickStart: { target: text, binding: text }, bindingTickEnd: { target: text, binding: text },
    bonusChanged: { target: text, amount: number },
});
const effects = list(leaf);
const event = variant("type", {
    useMove: { actor: text, move: text, result: optional(band), targets: list(shape({ target: text, result: band, effects })), effects },
    useEscape: { actor: text, target: text, effects }, changePhase: { phase, effects }, changeStance: { actor: text, effects },
    loadEncounter: { id: text, success: boolean, bindings: list(text), effects }, loadCharacter: { id: text, success: boolean, effects },
});
const gameLog = shape({
    entries: list(entry), previous: context, mergingStance: boolean,
    pendingBuffs: list(shape({
        index: integer, event, before: context, after: context,
        waiting: list(shape(buffMutation)), recorded: list(shape({ target: text, buff }))
    })),
});
const summary = shape({ count: integer, total: number, max: number, maxMove: optional(text) });
const stats = shape({
    stats: shape({
        rounds: integer, actions: integer, escapes: summary, hits: summary, bindings: summary,
        peakBinding: number, incapacitations: integer, rescues: integer, progress: shape({ boss: optional(number), enemies: optional(number) })
    }),
    playerIds: list(text), tracks: list(shape({ id: text, bindings: list(shape({ id: text, value: number })) })),
    enemyHp: list(shape({ id: text, rank: oneOf("minion", "enemy", "boss"), maxHp: number, currHp: number })),
    previous: list(shape({ id: text, incapacitated: boolean, skunkLink: optional(text) })), terminal: boolean,
});
const savePackage = shape({ version: value => text(value) && value !== "", saveState, gameLog, stats });

export function isSavePackage(value: unknown): value is SavePackage {
    if (!savePackage(value)) return false;
    const { gameLog } = value as SavePackage;
    const last = gameLog.entries.at(-1);
    return (!gameLog.mergingStance || last?.kind === "stance" && last.outcomes.length === 0)
        && gameLog.pendingBuffs.every(pending => {
            const entry = gameLog.entries[pending.index];
            const expectedKind = {
                useMove: "move", useEscape: "escape", changePhase: "phase", changeStance: "stance",
                loadEncounter: "encounter", loadCharacter: "character"
            }[pending.event.type];
            const effects = [...(pending.event.type === "useMove" ? pending.event.targets.flatMap(target => target.effects) : []), ...pending.event.effects];
            return entry?.kind === expectedKind && pending.waiting.length > 0
                && !(gameLog.mergingStance && pending.index === gameLog.entries.length - 1)
                && pending.waiting.every(ref => effects.some(effect => (effect.type === "buffAdded" || effect.type === "buffUpdated")
                    && effect.target === ref.target && effect.buff === ref.buff));
        });
}
