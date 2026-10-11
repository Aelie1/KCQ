import { createSignal } from "solid-js";
import type { ContentLibrary, ModifierReference, MoveReference } from "../../../../engine/public/library";
import type { BindingId, Effect, ModifierId, ModifierSet, MoveTrait } from "../../../../engine/public/types";
import type { Presentation, UiLabel } from "../../../presentation/presentation";
import type { CommandTagViewModel } from "./characterDetails";
import { formatSignedNumber, isHarmfulModifierChange } from "./presentationHelpers";

export const LIBRARY_CATEGORIES = ["difficulties", "characters", "enemies", "moves", "passives", "bindings", "traps", "statuses", "encounters"] as const;
export type LibraryCategory = typeof LIBRARY_CATEGORIES[number];
export interface LibraryEntry { category: LibraryCategory; id: string }
export type LibraryPage = { kind: "home" } | { kind: "category"; category: LibraryCategory } | ({ kind: "entry" } & LibraryEntry);
export interface LibraryVisit { page: LibraryPage; search: string; scroll: number; focus?: string }

/** History belongs to the reference browser and never calls the game engine. */
export function createLibraryNavigation(initial: LibraryPage = { kind: "home" }) {
    const [visits, setVisits] = createSignal<LibraryVisit[]>([{ page: initial, search: "", scroll: 0 }]);
    return {
        current: () => visits()[visits().length - 1]!,
        canBack: () => visits().length > 1,
        remember(search: string, scroll: number, focus?: string): void {
            setVisits(list => [...list.slice(0, -1), { ...list[list.length - 1]!, search, scroll, focus }]);
        },
        open(page: LibraryPage): void {
            const current = visits()[visits().length - 1]!.page;
            if (current.kind === page.kind && (current.kind === "home"
                || (page.kind !== "home" && current.category === page.category
                    && (current.kind === "category" || (page.kind === "entry" && current.id === page.id))))) return;
            setVisits(list => [...list, { page, search: "", scroll: 0 }]);
        },
        back(): void { setVisits(list => list.length > 1 ? list.slice(0, -1) : list); },
    };
}

const NAMESPACES = { difficulties: "difficulty", characters: "entity", enemies: "entity", moves: "move", passives: "passive", bindings: "binding", traps: "trap", statuses: "status", encounters: "encounter" } as const;
export function libraryName(entry: LibraryEntry, p: Presentation): string {
    switch (entry.category) {
        case "difficulties": return p.difficulty(entry.id as keyof ContentLibrary["difficulties"]);
        case "characters": return p.entity(entry.id);
        case "enemies": return p.enemyDefinition(entry.id);
        case "moves": return p.move(entry.id);
        case "passives": return p.passive(entry.id);
        case "bindings": return p.binding(entry.id);
        case "traps": return p.trap(entry.id);
        case "statuses": return p.status(entry.id as keyof ContentLibrary["statuses"]);
        case "encounters": return p.encounter(entry.id);
    }
}
export function libraryText(entry: LibraryEntry, p: Presentation, variant = "desc"): string | undefined {
    return p.referenceText(NAMESPACES[entry.category], entry.id, variant);
}
export function libraryHas(library: ContentLibrary, entry: LibraryEntry): boolean {
    if (entry.category === "bindings" && entry.id === SKUNK_BINDINGS_ID) return SKUNK_BINDING_IDS.some(id => Object.hasOwn(library.bindings, id));
    return Object.hasOwn(library[entry.category], entry.id);
}
export function libraryEntries(library: ContentLibrary, category: LibraryCategory, p: Presentation, search = ""): LibraryEntry[] {
    const query = search.trim().toLocaleLowerCase();
    const ids = Object.keys(library[category]);
    if (category === "bindings" && libraryHas(library, { category, id: SKUNK_BINDINGS_ID })) ids.unshift(SKUNK_BINDINGS_ID);
    return ids.map(id => ({ category, id }))
        .filter(entry => libraryName(entry, p).toLocaleLowerCase().includes(query));
}

export type ReferencePart = string | LibraryEntry;
/** Small, explicit reference tokens in localized notes; no HTML or executable markup. */
export function referenceParts(text: string): ReferencePart[] {
    const parts: ReferencePart[] = [];
    let end = 0;
    for (const match of text.matchAll(/\[([a-z]+):([a-zA-Z0-9_-]+)\]/g)) {
        if (!LIBRARY_CATEGORIES.includes(match[1] as LibraryCategory)) continue;
        parts.push(text.slice(end, match.index), { category: match[1] as LibraryCategory, id: match[2]! });
        end = match.index + match[0].length;
    }
    parts.push(text.slice(end));
    return parts;
}

export function libraryModifiers(modifiers: ModifierSet | undefined, p: Presentation) {
    return (Object.entries(modifiers ?? {}) as [ModifierId, number][]).map(([id, value]) => ({
        id, label: libraryModifierLabel(id, p), value: Math.abs(value), valueLabel: formatSignedNumber(value),
        tone: value === 0 ? "neutral" as const : isHarmfulModifierChange(id, value) ? "danger" as const : "success" as const,
        blocked: false,
    }));
}
export function libraryRestrictions(reference: ModifierReference, p: Presentation) {
    return [
        ...(reference.flags ?? []).map(flag => ({ label: flag === "blocksEscape" ? p.ui("library.blocksEscape") : p.flag(flag), tone: flag === "skipsTraps" ? "success" as const : "danger" as const })),
        ...(reference.blockedMoveTypes ?? []).map(type => ({ label: p.ui("library.blocked", { type: p.moveType(type) }), tone: "danger" as const })),
        ...(reference.allowedMoveTypes ?? []).map(type => ({ label: p.ui("library.allowed", { type: p.moveType(type) }), tone: "success" as const })),
    ];
}
const TRAIT_LABELS: Record<MoveTrait, UiLabel> = {
    damage: "characterDetails.tagDamage", buff: "characterDetails.tagBuff", debuff: "characterDetails.tagDebuff", escape: "characterDetails.tagEscape",
    onetime: "characterDetails.tagOnetime", refresh: "characterDetails.tagRefresh", heal: "characterDetails.tagHeal", defeat: "characterDetails.tagDefeat",
    spawn: "characterDetails.tagSpawn", trap: "characterDetails.tagTrap", retarget: "characterDetails.tagRetarget",
};
export function libraryTags(traits: readonly MoveTrait[] | undefined, p: Presentation) {
    return (traits ?? []).map(trait => ({ id: trait, label: p.ui(TRAIT_LABELS[trait]), tone: trait === "damage" ? "danger" as const : trait === "debuff" ? "special" as const : "neutral" as const }));
}

function effectReferences(effects: readonly Effect[], library: ContentLibrary): LibraryEntry[] {
    return effects.flatMap((effect): LibraryEntry[] => {
        switch (effect.type) {
            case "binding": return [{ category: "bindings", id: effect.binding }];
            case "trap": return [{ category: "traps", id: effect.trap }];
            case "move": return [{ category: "moves", id: effect.move }];
            case "buff": return [
                ...(effect.buff.statuses ?? []).map(status => ({ category: "statuses" as const, id: status.id })),
                ...[...(effect.buff.moveList?.addedMoves ?? []), ...(effect.buff.moveList?.blockedMoves ?? [])].map(id => ({ category: "moves" as const, id })),
            ];
            case "enemy": return Object.hasOwn(library.enemies, effect.target) ? [{ category: "enemies", id: effect.target }] : [];
            default: return [];
        }
    });
}
export function libraryReferences(entry: LibraryEntry, library: ContentLibrary, p: Presentation): LibraryEntry[] {
    const refs: LibraryEntry[] = [];
    const add = (category: LibraryCategory, ids: readonly string[]) => refs.push(...ids.map(id => ({ category, id })));
    switch (entry.category) {
        case "characters": {
            const ref = library.characters[entry.id];
            if (ref) { add("moves", [...ref.moves, ...ref.empoweredMoves]); add("passives", ref.passives); }
            break;
        }
        case "enemies": {
            const ref = library.enemies[entry.id];
            if (ref) { add("moves", ref.moves); add("passives", ref.passives); }
            break;
        }
        case "moves": {
            const ref = library.moves[entry.id];
            if (ref) { add("bindings", ref.bindings); add("moves", Object.keys(ref.cooldown ?? {})); }
            break;
        }
        case "passives": add("statuses", library.passives[entry.id]?.immunities ?? []); break;
        case "bindings": {
            add("statuses", Object.values(library.bindings[entry.id]?.status ?? {}).flatMap(list => list.map(status => status.id)));
            if (entry.id === SKUNK_BINDINGS_ID) add("bindings", SKUNK_BINDING_IDS);
            else if (SKUNK_BINDING_IDS.includes(entry.id)) add("bindings", [SKUNK_BINDINGS_ID]);
            break;
        }
        case "encounters": {
            const ref = library.encounters[entry.id];
            if (ref) { add("enemies", ref.enemies.map(enemy => enemy.defId)); add("bindings", ref.bindings); add("traps", ref.traps); refs.push(...effectReferences(ref.setup, library)); }
            break;
        }
    }
    refs.push(...referenceParts(libraryText(entry, p, "library") ?? "").filter((part): part is LibraryEntry => typeof part !== "string"));
    return refs;
}
export function libraryRelated(entry: LibraryEntry, library: ContentLibrary, p: Presentation): LibraryEntry[] {
    const refs = libraryReferences(entry, library, p);
    for (const category of LIBRARY_CATEGORIES) {
        for (const id of Object.keys(library[category])) {
            const candidate = { category, id };
            if (libraryReferences(candidate, library, p).some(ref => ref.category === entry.category && ref.id === entry.id)) refs.push(candidate);
        }
    }
    const seen = new Set<string>([entry.category + ":" + entry.id]);
    return refs.filter(ref => {
        const key = ref.category + ":" + ref.id;
        if (seen.has(key) || !libraryHas(library, ref)) return false;
        seen.add(key);
        return true;
    });
}

/** Contextual ownership uses only the campaign's sanitized roster. */
export function libraryOwners(library: ContentLibrary, category: "moves" | "passives", id: string): LibraryEntry[] {
    const explicitOwner = category === "moves" ? library.moves[id]?.owner : undefined;
    if (explicitOwner) return [{ ...explicitOwner }];
    return (["characters", "enemies"] as const).flatMap(ownerCategory => Object.values(library[ownerCategory])
        .filter(owner => category === "passives" ? owner.passives.includes(id)
            : owner.moves.includes(id) || ("empoweredMoves" in owner && owner.empoweredMoves.includes(id)))
        .map(owner => ({ category: ownerCategory, id: owner.id })));
}

export function libraryMoveTags(move: MoveReference, p: Presentation): CommandTagViewModel[] {
    const tags: CommandTagViewModel[] = [];
    if (move.type !== "none") tags.push({ id: "type", label: p.moveType(move.type), tone: "warning" });
    if (move.targets === 0) tags.push({ id: "self", label: p.ui("characterDetails.tagSelf"), tone: "success" });
    else {
        if (move.targetSide === "player" || move.targetSide === "either") tags.push({ id: "ally", label: p.ui("characterDetails.tagAlly"), tone: "ally" });
        if (move.targetSide === "enemy" || move.targetSide === "either") tags.push({ id: "enemy", label: p.ui("characterDetails.tagEnemy"), tone: "primary" });
    }
    tags.push(...libraryTags(move.traits, p));
    if (move.targets === "all") tags.push({ id: "aoe", label: p.ui("characterDetails.tagAoe"), tone: "neutral" });
    if ((move.hits ?? move.baseHits ?? 1) > 1) tags.push({ id: "hits", label: p.ui("characterDetails.tagHits", { count: move.hits ?? move.baseHits ?? 1 }), tone: "special" });
    return tags;
}

/** Cumulative roll-ratio boundaries become conditional outcome bands. */
export function libraryTrapOutcomes(chances: Record<number, Record<BindingId, number>>) {
    const boundaries = Object.entries(chances).sort(([left], [right]) => Number(left) - Number(right));
    return boundaries.map(([boundary, bindings], index) => ({
        boundary: Number(boundary),
        chance: Math.round((Number(boundary) - (index === 0 ? 0 : Number(boundaries[index - 1]![0]))) * 100),
        bindings: Object.entries(bindings),
    })).reverse();
}

/** Authored content reference, deliberately separate from engine BindingReference. */
export const SKUNK_BINDINGS_ID = "skunkBindings";
export const SKUNK_BINDING_IDS: readonly string[] = ["latexHead", "latexArms", "latexTorso", "latexLegs", "latexCollar"];

export function libraryModifierLabel(id: ModifierId, p: Presentation): string {
    const types = { hitarms: "arms", hitmouth: "mouth", hitlegs: "legs" } as const;
    return id in types ? p.moveType(types[id as keyof typeof types]) : p.modifier(id);
}

export function libraryMoveGroups(library: ContentLibrary, p: Presentation) {
    const groups = new Map<string, { owner?: LibraryEntry; entries: LibraryEntry[] }>();
    for (const entry of libraryEntries(library, "moves", p)) {
        const source = referenceParts(p.referenceText("move", entry.id, "source") ?? "")
            .find((part): part is LibraryEntry => typeof part !== "string" && (part.category === "characters" || part.category === "enemies"));
        const owner = libraryOwners(library, "moves", entry.id)[0] ?? source;
        const key = owner ? owner.category + ":" + owner.id : "unowned";
        if (!groups.has(key)) groups.set(key, { owner, entries: [] });
        groups.get(key)!.entries.push(entry);
    }
    return [...groups.values()];
}

/** Kit summaries expose only move-type allowances relevant to that character. */
export function libraryPassiveSummary(library: ContentLibrary, characterId: string, passiveId: string): ModifierReference {
    const reference = library.passives[passiveId]?.status ?? {};
    const character = library.characters[characterId];
    const types = new Set([...(character?.moves ?? []), ...(character?.empoweredMoves ?? [])].map(id => library.moves[id]?.type));
    return { ...reference, allowedMoveTypes: reference.allowedMoveTypes?.filter(type => types.has(type)) };
}

export function libraryPassiveRows(reference: ContentLibrary["passives"][string], p: Presentation) {
    return [
        ...libraryModifiers(reference.status?.modifiers, p).map(metric => ({ label: metric.label + " " + metric.valueLabel, tone: metric.tone,
            explanation: p.ui("library.modifierExplanation", { modifier: metric.label, value: metric.valueLabel }) })),
        ...(reference.status?.flags ?? []).map(flag => ({ label: flag === "blocksEscape" ? p.ui("library.blocksEscape") : p.flag(flag), tone: flag === "skipsTraps" ? "success" as const : "danger" as const,
            explanation: p.referenceText("passive", reference.id, "effect." + flag) ?? p.flag(flag) })),
        ...(reference.status?.blockedMoveTypes ?? []).map(type => ({ label: p.ui("library.blocked", { type: p.moveType(type) }), tone: "danger" as const,
            explanation: p.ui("library.blockedExplanation", { type: p.moveType(type) }) })),
        ...(reference.status?.allowedMoveTypes ?? []).map(type => ({ label: p.ui("library.allowed", { type: p.moveType(type) }), tone: "success" as const,
            explanation: p.ui("library.allowedExplanation", { type: p.moveType(type) }) })),
    ];
}
