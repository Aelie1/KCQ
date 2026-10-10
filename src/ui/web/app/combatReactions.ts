import { createContext, createEffect, createSignal, onCleanup, useContext } from "solid-js";
import type { EventFrame, GameState, HitBand, LeafEvent } from "../../../engine/public/types";

export type ReactionKind = "actor" | "hp" | "binding" | "buff";
export type ReactionStrength = "graze" | "hit" | "crit";
export interface CombatReaction {
    kind: ReactionKind;
    entity: string;
    detail?: string;
    treatment: string;
    strength?: ReactionStrength;
    from?: number;
    to?: number;
}
export interface ActiveReaction extends CombatReaction {
    serial: number;
    started: number;
    duration: number;
}
const strength = (band: HitBand): ReactionStrength | undefined =>
    band === "graze" || band === "hit" || band === "crit" ? band : undefined;
const entities = (state: GameState) => [...state.characters, ...state.enemies];

/** Events identify actions and resolved deltas. Snapshots supply binding endpoints
 * and silent duration ticks only; they never infer attacks or incoming damage. */
export function collectCombatReactions(frames: readonly EventFrame[], initial: GameState): CombatReaction[] {
    const cues: CombatReaction[] = [];
    let before = initial;
    for (const { event, state } of frames) {
        if ((event.type === "useMove" || event.type === "useEscape" || event.type === "changeStance")
            && !event.effects.some(effect => effect.type === "actionInterrupted" && effect.actor === event.actor)) {
            cues.push({ kind: "actor", entity: event.actor, treatment: "actor" });
        }
        const leaves: { effect: LeafEvent; band: HitBand }[] = [];
        if (event.type === "useMove") {
            for (const target of event.targets) {
                for (const effect of target.effects) leaves.push({
                    effect,
                    band: "target" in effect && effect.target === target.target ? target.result : "none"
                });
            }
        }
        for (const effect of event.effects) {
            leaves.push({ effect, band: "none" });
        }
        const bindingTotals = new Map<string, number>();
        for (const { effect } of leaves) {
            if (effect.type === "bondageAdded" || effect.type === "bondageChanged" || effect.type === "bondageRemoved") {
                const key = JSON.stringify([effect.target, effect.binding]);
                bindingTotals.set(key, (bindingTotals.get(key) ?? 0) + effect.amount);
            }
        }
        const endpoints = new Map<string, number>();
        const explicitBuffs = new Set<string>();
        for (const { effect, band } of leaves) {
            switch (effect.type) {
                case "enemyDamaged": case "enemyHealed":
                    if (effect.amount > 0) cues.push({
                        kind: "hp", entity: effect.target,
                        treatment: effect.type === "enemyHealed" ? "healing" : "damage",
                        strength: strength(band) ?? "hit"
                    });
                    break;
                case "bondageAdded": case "bondageChanged": case "bondageRemoved": {
                    if (!effect.amount) break;
                    const key = JSON.stringify([effect.target, effect.binding]);
                    const final = state.characters.find(character => character.id === effect.target)
                        ?.bindings.find(binding => binding.id === effect.binding)?.value ?? 0;
                    const from = endpoints.get(key) ?? final - bindingTotals.get(key)!;
                    const to = from + effect.amount;
                    endpoints.set(key, to);
                    cues.push({
                        kind: "binding", entity: effect.target, detail: effect.binding,
                        treatment: effect.amount > 0 ? "increase" : "recovery", from, to
                    });
                    break;
                }
                case "buffAdded": case "buffUpdated": case "buffRemoved": {
                    explicitBuffs.add(JSON.stringify([effect.target, effect.buff]));
                    cues.push({
                        kind: "buff", entity: effect.target, detail: effect.buff,
                        treatment: effect.type === "buffAdded" ? "added" : effect.type === "buffRemoved" ? "removed" : "updated"
                    });
                    break;
                }
            }
        }
    }
    return cues;
}

const durations: Record<ReactionKind, number> = { actor: 500, hp: 4000, binding: 2500, buff: 2500 };
export function createCombatReactions() {
    const [cues, setCues] = createSignal<readonly ActiveReaction[]>([]);
    let serial = 0;
    let disposed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const exits = new Set<HTMLElement>();
    const clear = () => {
        for (const exit of exits) exit.remove();
        exits.clear();
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        setCues([]);
    };
    onCleanup(() => { disposed = true; clear(); });
    return {
        cues,
        clear,
        exit(element: HTMLElement, entity: string | null | undefined, detail?: string) {
            if (disposed || cues().filter(cue => cue.kind === "buff" && cue.entity === entity
                && cue.detail === detail).at(-1)?.treatment !== "removed") return;
            const host = element.closest<HTMLElement>(".kcq-enemy-card, .kcq-party-card, .kcq-character-effects__list");
            if (!host) return;
            const bounds = element.getBoundingClientRect();
            const parent = host.getBoundingClientRect();
            const scaleX = parent.width && host.offsetWidth ? parent.width / host.offsetWidth : 1;
            const scaleY = parent.height && host.offsetHeight ? parent.height / host.offsetHeight : 1;
            const ghost = element.cloneNode(true) as HTMLElement;
            ghost.removeAttribute("id");
            ghost.setAttribute("aria-hidden", "true");
            ghost.setAttribute("inert", "");
            ghost.dataset.combatReaction = "removed";
            ghost.classList.add("kcq-buff-exit");
            ghost.style.cssText = `left: ${(bounds.left - parent.left) / scaleX - host.clientLeft}px; top: ${(bounds.top - parent.top) / scaleY - host.clientTop}px; width: ${bounds.width / scaleX}px; height: ${bounds.height / scaleY}px; animation: kcq-react-removed 350ms ease-out forwards;`;
            host.append(ghost);
            exits.add(ghost);
            const timer = setTimeout(() => { ghost.remove(); exits.delete(ghost); timers.delete(timer); }, 350);
            timers.add(timer);
        },
        present(frames: readonly EventFrame[], before: GameState, instant = false) {
            if (disposed) return;
            if (instant) { clear(); return; }
            const added = collectCombatReactions(frames, before).map(cue => ({
                ...cue,
                serial: ++serial, started: Date.now(), duration: durations[cue.kind]
            }));
            setCues(current => [...current, ...added]);
            for (const cue of added) {
                const timer = setTimeout(() => {
                    timers.delete(timer);
                    setCues(current => current.filter(currentCue => currentCue.serial !== cue.serial));
                }, cue.duration);
                timers.add(timer);
            }
        },
        matching(kind: ReactionKind, entity: string | null | undefined, detail?: string) {
            return cues().filter(cue => cue.kind === kind && cue.entity === entity && cue.detail === detail);
        },
    };
}
export const CombatReactionsContext = createContext<ReturnType<typeof createCombatReactions>>();

/** Restart the CSS animation on the same DOM node. No card/meter remount, delay,
 * or animation queue; a newly mounted view can show only the remaining lifetime. */
export function reactionRef(kind: ReactionKind, entity: () => string | null | undefined, detail?: () => string | undefined) {
    const reactions = useContext(CombatReactionsContext);
    return (element: HTMLElement) => {
        let lastSerial: number | undefined;
        let lastEntity: string | null | undefined;
        let lastDetail: string | undefined;
        createEffect(() => {
            lastEntity = entity();
            lastDetail = detail?.();
            const cue = reactions?.matching(kind, lastEntity, lastDetail).at(-1);
            if (cue?.serial === lastSerial) return;
            lastSerial = cue?.serial;
            element.style.setProperty(`--kcq-react-${kind}`, "none");
            element.style.animation = ["actor", "target", "hp", "buff"].map(channel => `var(--kcq-react-${channel}, none)`).join(", ");
            if (cue) element.setAttribute(`data-combat-${kind}`, cue.treatment);
            else element.removeAttribute(`data-combat-${kind}`);
            const treatment = ["target", "hp", "buff", "actor"].map(channel => element.getAttribute(`data-combat-${channel}`)).find(Boolean);
            if (treatment) element.dataset.combatReaction = treatment;
            else delete element.dataset.combatReaction;
            if (!cue) return;
            element.style.setProperty("--kcq-reaction-strength", cue.strength === "crit" ? "1" : cue.strength === "graze" ? ".25" : ".6");
            element.style.setProperty("--kcq-reaction-scale", cue.strength === "crit" ? "1.05" : cue.strength === "graze" ? "1.01" : "1.025");
            void element.offsetWidth;
            const animation = kind === "hp" ? cue.treatment : kind === "buff" ? "buff" : "actor";
            element.style.setProperty(`--kcq-react-${kind}`, `kcq-react-${animation} ${cue.duration}ms ease-out ${-Math.max(0, Date.now() - cue.started)}ms`);
        });
        onCleanup(() => {
            if (kind === "buff") reactions?.exit(element, lastEntity, lastDetail);
            element.removeAttribute(`data-combat-${kind}`);
            element.style.removeProperty(`--kcq-react-${kind}`);
            delete element.dataset.combatReaction;
        });
    };
}
