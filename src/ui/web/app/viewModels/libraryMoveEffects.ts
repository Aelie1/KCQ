import type { ContentLibrary, MoveReference, MoveBuffReference } from "../../../../engine/public/library";
import type { ModifierId, ModifierSet } from "../../../../engine/public/types";
import type { Presentation, UiLabel } from "../../../presentation/presentation";
import type { EffectPreviewViewModel, EffectTone } from "./effectPreviews";
import { libraryOwners } from "./library";
import { libraryDamageProfile } from "./libraryMechanics";
import { formatSignedNumber, isHarmfulModifierChange } from "./presentationHelpers";

/** Reference presentation only. Callback mechanics are authored descriptions, never executable effects.
 * Public static effects and intrinsic modifiers take precedence over these stock reference annotations. */
export interface LibraryMoveEffectRow {
    recipient: string;
    preview?: EffectPreviewViewModel;
    bindingProfile?: ReturnType<typeof libraryDamageProfile>;
    label?: string;
    name?: string;
    tone?: EffectTone;
    modifiers?: ModifierSet;
    note?: string;
    referenceDescription?: string;
    duration?: number;
    statusReferences?: MoveBuffReference["statuses"];
}
export function libraryMoveEffectRows(move: MoveReference, library: ContentLibrary, p: Presentation): LibraryMoveEffectRow[] {
    const rows: LibraryMoveEffectRow[] = [];
    const owner = libraryOwners(library, "moves", move.id)[0];
    const actor = owner?.id ?? "self";
    const selected = move.targets === 0 ? actor : move.targetSide === "player" ? "allies" : "enemies";
    const text = (key: string) => p.referenceText("move", move.id, key);
    const row = (type: UiLabel, key: string, recipient = selected, tone: EffectTone = "primary", modifiers?: ModifierSet): void => {
        rows.push({ recipient, label: p.ui(type), name: text("effect." + key), tone, modifiers, note: text("effect." + key + ".note") });
    };
    const buff = (effect: MoveBuffReference, operation: "add" | "remove" = "add", debuff?: boolean, note?: string, durationLabel?: string): void => {
        const harmful = debuff ?? Object.entries(effect.modifiers ?? {}).some(([id, value]) => isHarmfulModifierChange(id as ModifierId, value));
        rows.push({ recipient: effect.recipient === "self" ? actor : effect.recipient === "allies" ? "allies" : selected,
            duration: operation === "add" ? effect.duration : undefined,
            statusReferences: operation === "add" ? effect.statuses : undefined,
            preview: { kind: "buff", type: "buff", id: "library-" + effect.id, operation,
                label: p.ui(operation === "remove" ? harmful ? "targeting.effectRemoveDebuff" : "targeting.effectRemoveBuff" : harmful ? "targeting.effectAddDebuff" : "targeting.effectAddBuff"),
                name: p.buff(effect.id, undefined), tone: operation === "remove" || harmful ? "special" : "success",
                durationLabel: durationLabel ?? (effect.duration === undefined ? undefined : p.ui("characterDetails.rounds", { count: effect.duration })),
                modifiers: operation === "remove" ? [] : Object.entries(effect.modifiers ?? {}).map(([id, value]) => ({
                    label: p.modifier(id as ModifierId, "compact"), value: Math.abs(value), signedValue: formatSignedNumber(value),
                    harmful: isHarmfulModifierChange(id as ModifierId, value) === true, direction: value >= 0 ? "left" : "right",
                })), moveList: [], details: [],
            }, note });
    };
    const empowerment = (recipient: "self" | "allies", operation: "add" | "remove") => buff({ id: "empowerment", recipient }, operation, false,
        operation === "add" ? p.referenceText("buff", "empowerment", "library") : undefined,
        operation === "add" ? p.ui("library.untilConsumed") : undefined);
    const damage = move.traits?.includes("damage") ? libraryDamageProfile(move, p, owner?.category === "characters") : undefined;
    if (damage) rows.push({ recipient: selected, preview: damage });
    if (["latexSpray", "latexShower", "bindingMagic", "skunkGun", "skunkCollar"].includes(move.id)) {
        rows.push({ recipient: selected, bindingProfile: libraryDamageProfile(move, p, false), note: p.ui("library.selectedBinding") });
    }
    for (const effect of move.effects ?? []) buff(effect);
    if (move.baseDamage !== undefined && !damage && !rows.some(row => row.bindingProfile)) rows.push({ recipient: "", label: p.ui("library.baseAmount"), name: String(move.baseDamage), tone: "warning" });
    switch (move.id) {
        case "reflect": case "fairyReflect":
            buff({ id: move.id, recipient: "self" }, "add", false, text("effect.reflect.note"), p.ui("library.oneChargeThisRound")); break;
        case "fairyTransformation": empowerment("self", "add"); break;
        case "fairyEmpowerment":
            empowerment("self", "remove");
            empowerment("allies", "add"); break;
        case "powerOfDenial":
            row("targeting.operationDefeat", "defeat", "enemies", "danger");
            row("targeting.effectBinding", "binding", "allies", "success");
            buff({ id: "exhausted", recipient: "self" }, "add", false, text("effect.exhausted.note"), p.ui("library.encounterDuration")); break;
        case "immolation":
            row("targeting.effectBinding", "binding", actor, "success");
            buff({ id: "burnout", recipient: "self" }, "add", false, undefined, p.ui("library.encounterDuration"));
            rows[rows.length - 1]!.referenceDescription = p.referenceText("buff", "burnout", "desc"); break;
        case "obey":
            row("targeting.effectRefresh", "refresh", "allies");
            buff({ id: "servitude", recipient: "selected", duration: 2 }, "add", true, text("effect.servitude.note")); break;
        case "stop":
            row("targeting.effectWeaken", "weaken", "boss"); row("targeting.effectCancel", "cancel", "enemy"); break;
        case "attackMe":
            row("targeting.effectRetarget", "retarget", "enemies");
            buff({ id: "defenseBarrier", recipient: "self", duration: 1, modifiers: { defense: 3 } }); break;
        case "store":
            row("targeting.effectBinding", "binding", "allies", "success");
            row("targeting.effectResource", "resource", actor);
            row("targeting.effectBinding", "overflow", actor, "warning"); break;
        case "brace":
            buff({ id: "brace", recipient: "self" }, "add", false, text("effect.brace.note"), p.ui("library.oneChargeThisRound")); break;
        case "release":
            buff({ id: "subspaceClutter", recipient: "selected", duration: 2, modifiers: { defense: -2, hit: -2 } }, "add", true);
            rows[rows.length - 1]!.recipient = "enemies";
            row("targeting.effectBinding", "binding", "allies", "warning");
            row("targeting.effectResource", "resource", actor); break;
        case "throwOff":
            buff({ id: "pounce", recipient: "self" }, "remove", true, text("effect.remove.note"));
            row("library.cooldownHeading", "cooldown", "enemy", "warning"); break;
        case "pounce":
            for (let severity = 1; severity <= 4; severity++) {
                buff({ id: "pounce", recipient: "selected", modifiers: severity === 2 ? { hit: -1 } : severity === 3 ? { hit: -2 } : {},
                    statuses: [{ id: "immobilized", level: 1 }, ...(severity === 3 ? [{ id: "stunned" as const, level: 1 }] : severity === 4 ? [{ id: "helpless" as const, level: 1 }] : [])] }, "add", true, text("effect.victim.note"));
                const victim = rows[rows.length - 1]!;
                victim.recipient = "players";
                if (victim.preview?.kind === "buff") victim.preview.name = p.buff("pounce", severity);
                buff({ id: "pounce", recipient: "self", modifiers: { defense: -2, hit: severity * 2 } }, "add", false);
                const attacker = rows[rows.length - 1]!;
                if (attacker.preview?.kind === "buff") attacker.preview.name = p.buff("pounce", severity);
            }
            row("targeting.effectMove", "spray", "players", "warning"); break;
        case "latexMist":
            row("targeting.effectAddDebuff", "spread", "players", "special");
            row("targeting.effectBinding", "binding", "players", "warning"); break;
        case "latexPuddle": row("targeting.effectTrap", "trap", "field", "warning"); break;
        case "latexRegeneration": row("targeting.effectBinding", "restore", "players", "warning"); break;
        case "latexExplosion":
            row("targeting.effectBinding", "binding", "players", "warning");
            row("targeting.effectTrap", "trap", "field", "warning");
            row("targeting.operationDefeat", "defeat", actor, "danger");
            row("library.heal", "heal", actor, "success"); break;
        case "healingMagic":
            row("library.heal", "target", "selectedEnemy", "success");
            row("library.heal", "others", "enemyAllies", "success"); break;
        case "empoweringMagic":
            buff({ id: "empoweringMagic", recipient: "selected", duration: 1, modifiers: { potency: 5 } }, "add", false, text("effect.target.note"));
            rows[rows.length - 1]!.recipient = "selectedEnemy";
            buff({ id: "empoweringMagic", recipient: "selected", duration: 1, modifiers: { potency: 5 } }, "add", false, text("effect.others.note"));
            rows[rows.length - 1]!.recipient = "enemyAllies"; break;
        case "barrierMagic":
            buff({ id: "barrierMagic", recipient: "selected" }, "add", false, text("effect.barrier.note")); break;
        case "latexRain": row("targeting.effectBinding", "binding", "players", "warning"); break;
        case "callReinforcements": case "latexRainmaker": row("targeting.operationSpawn", "spawn", "field"); break;
        case "skunkPerfume":
            buff({ id: "defensePerfume", recipient: "selected", duration: 4, modifiers: { defense: -2 } }, "add", true, text("effect.defense.note"));
            buff({ id: "escapePerfume", recipient: "selected", duration: 4, modifiers: { escape: -2 } }, "add", true, text("effect.escape.note"));
            rows[rows.length - 1]!.recipient = rows[rows.length - 2]!.recipient = "players";
            row("library.heal", "heal", "enemyAllies", "success"); break;
    }
    if (move.id !== "fairyEmpowerment" && Object.values(library.characters).some(character => character.empoweredMoves.includes(move.id))) empowerment("self", "remove");
    if (Object.keys(move.modifiers ?? {}).length) rows.push({ recipient: "", label: p.ui("library.modifiersHeading"), tone: "primary", modifiers: move.modifiers });
    return rows;
}

export function libraryMoveRecipient(id: string, library: ContentLibrary, p: Presentation): string {
    return Object.hasOwn(library.characters, id) || Object.hasOwn(library.enemies, id) ? p.entity(id) : p.ui(("library.recipient." + id) as UiLabel);
}

export function libraryCompulsionCooldown(move: MoveReference): number | undefined {
    if (!["obey", "stop", "attackMe"].includes(move.id)) return undefined;
    const shared = Object.entries(move.cooldown ?? {}).filter(([id]) => id !== move.id);
    return shared.length && shared.every(([, count]) => count === shared[0]![1]) ? shared[0]![1] : undefined;
}
