import type { ContentLibrary, MoveBuffReference, MoveReference } from "../../../../engine/public/library";
import { getThresholds } from "../../../../engine/public/mechanics";
import type { ModifierId, ModifierSet, MoveListModifier } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import { projectBuffMoveList } from "./buffMoveList";
import type { EffectPreviewViewModel, EffectTone } from "./effectPreviews";
import { libraryName, libraryOwners } from "./library";
import { libraryDamageProfile } from "./libraryMechanics";
import { bindingLevelAtValue, formatSignedNumber, isDebuff, isHarmfulModifierChange } from "./presentationHelpers";

/** Reference presentation only. Callback mechanics are authored descriptions, never executable effects.
 * Public static effects and intrinsic modifiers take precedence over these stock reference annotations. */
export interface LibraryMoveEffectRow {
    recipient: string;
    preview?: EffectPreviewViewModel;
    label?: string;
    name?: string;
    tone?: EffectTone;
    modifiers?: ModifierSet;
    note?: string;
    duration?: number;
}
export function libraryMoveEffectRows(move: MoveReference, library: ContentLibrary, p: Presentation): LibraryMoveEffectRow[] {
    const rows: LibraryMoveEffectRow[] = [];
    const owner = libraryOwners(library, "moves", move.id)[0];
    const actor = owner?.id ?? "self";
    const selected = move.targets === 0 ? actor : move.targetSide === "player" ? "target" : "enemies";
    const text = (key: string) => p.referenceText("move", move.id, key);
    const thresholds = getThresholds();
    const row = (type: string, key: string, recipient = selected, tone: EffectTone = "primary", modifiers?: ModifierSet): void => {
        if (type === "targeting.effectBinding") {
            bindingRow(recipient, text("effect." + key) ?? p.ui(type), p.ui("library.variableAmount"), text("effect." + key + ".note"));
        } else {
            rows.push({ recipient, label: p.ui(type), name: text("effect." + key), tone, modifiers, note: text("effect." + key + ".note") });
        }
    };
    const buff = (effect: MoveBuffReference & { moveList?: MoveListModifier }, operation: "add" | "remove" = "add", debuff?: boolean, note?: string, durationLabel?: string): void => {
        const harmful = debuff ?? isDebuff({ ...effect, statuses: effect.statuses?.map(status => ({ id: status.id, value: status.level })) });
        rows.push({
            recipient: effect.recipient === "self" ? actor : effect.recipient === "allies" ? "allies" : effect.recipient === "selected" ? selected : effect.recipient,
            duration: operation === "add" ? effect.duration : undefined,
            preview: {
                kind: "buff", type: "buff", id: "library-" + effect.id, operation,
                statuses: operation === "add" ? libraryBuffStatuses(effect, library, p) : [],
                label: p.ui(operation === "remove" ? harmful ? "targeting.effectRemoveDebuff" : "targeting.effectRemoveBuff" : harmful ? "targeting.effectAddDebuff" : "targeting.effectAddBuff"),
                name: p.buff(effect.id, undefined), tone: operation === "remove" || harmful ? "special" : "success",
                durationLabel: durationLabel ?? (effect.duration === undefined ? undefined : p.ui("characterDetails.rounds", { count: effect.duration })),
                modifiers: operation === "remove" ? [] : Object.entries(effect.modifiers ?? {}).map(([id, value]) => ({
                    label: p.modifier(id as ModifierId, "compact"), value, signedValue: formatSignedNumber(value),
                    harmful: isHarmfulModifierChange(id as ModifierId, value) === true, direction: value >= 0 ? "left" : "right",
                })), moveList: operation === "add" ? projectBuffMoveList(effect, p, undefined, true) : [], details: [],
            }, note
        });
    };
    const heal = (recipient: string, currentValue: number, change: number, note?: string,): void => {
        rows.push({
            recipient,
            preview: {
                kind: "heal",
                id: `library-${move.id}-heal-${rows.length}`,
                type: "heal",
                tone: "success",
                label: p.ui("targeting.effectHealing"),
                currentValue,
                change,
                projectedValue: Math.min(100, currentValue + change),
                max: 100,
            },
            note,
        });
    };
    const empowerment = (recipient: "self" | "allies", operation: "add" | "remove") => buff({
        id: "empowerment", recipient, moveList: {
            addedMoves: [...new Set(Object.values(library.characters)
                .filter(character => recipient === "self" ? character.id === actor : character.id !== actor)
                .flatMap(character => character.empoweredMoves))]
        }
    }, operation, false, operation === "add" ? text("effect.empowerment.note") : undefined,
        operation === "add" ? p.ui("library.untilConsumed") : undefined);
    const damage = (move.baseDamage ?? 0) > 0 ? libraryDamageProfile(move, p, owner?.category === "characters") : undefined;

    const bindingRow = (
        recipient: string, name: string, change: string, note?: string,
        meter?: { value: number; change?: number; max?: number, peak?: number },
    ): void => {
        const id = `library-${move.id}-binding-${rows.length}`;
        const label = p.ui("targeting.effectBinding");
        const max = meter?.max ?? thresholds.max;
        const projected = Math.max(0, Math.min(max, (meter?.value ?? 0) + (meter?.change ?? 0)));
        const currentLevel = bindingLevelAtValue(meter?.value ?? 0, thresholds);
        const projectedLevel = bindingLevelAtValue(projected, thresholds);
        rows.push({
            recipient,
            preview: meter?.change === undefined ? {
                kind: "binding", mode: "amount", id, type: "binding", tone: "binding", label,
                bindingName: name, amountLabel: change, magnitude: meter?.value, max,
                level: bindingLevelAtValue(meter?.value ?? 0, thresholds),
            } : {
                kind: "binding", id, type: "binding", tone: "binding", label,
                bindingName: name, currentValue: meter.value, change: meter.change,
                projectedValue: projected, max, peak: meter.peak,
                currentLevel,
                currentLevelLabel: p.bindingLevel(currentLevel),
                projectedLevel,
                projectedLevelLabel: p.bindingLevel(projectedLevel),
            },
            note,
        });
    };
    if (damage && move.id !== "latexMist" && move.id !== "latexRegeneration") {
        if (move.traits?.includes("binding")) {
            rows.push({ recipient: selected, preview: { ...damage, tone: "special", label: p.ui("targeting.effectBinding") }, note: text("effect.binding.note"), });
        }
        else if (move.traits?.includes("trap")) {
            rows.push({ recipient: "field", preview: { ...damage, tone: "warning", label: p.ui("targeting.effectTrap") }, note: text("effect.trap.note"), });
        }
        else {
            rows.push({ recipient: selected, preview: damage });
        }
    }
    for (const effect of move.effects ?? []) buff(effect);
    if (move.baseDamage !== undefined && !damage) rows.push({ recipient: "", label: p.ui("library.baseAmount"), name: String(move.baseDamage), tone: "warning" });
    switch (move.id) {
        case "fairyTransformation":
            bindingRow("ko", p.ui("library.strongestBinding"), p.ui("library.bindingReduction", { value: 1 }), text("effect.binding.note"));
            empowerment("self", "add");
            break;
        case "fairyEmpowerment":
            bindingRow("ko", p.ui("library.strongestBinding"), p.ui("library.bindingReduction", { value: 1 }), text("effect.binding.note"));
            empowerment("self", "remove");
            bindingRow("allies", p.ui("library.strongestBinding"), p.ui("library.bindingReduction", { value: 1 }), text("effect.binding.note"));
            empowerment("allies", "add");
            break;
        case "powerOfDenial":
            row("targeting.operationDefeat", "defeat", "enemies", "danger");

            bindingRow("allies", p.ui("library.strongestBinding"), "−100", text("effect.binding.note"), { value: 100, change: -100 });
            buff({ id: "exhausted", recipient: "self", moveList: { blockedMoves: [move.id] } }, "add", false);
            break;
        case "immolation":
            bindingRow(actor, `${p.ui("library.allBindings")} −50%`, "−50", text("effect.binding.note"), { value: 100, change: -50 });
            buff({ id: "burnout", recipient: "self", moveList: { addedMoves: ["punch", "kick"], blockedMoves: ["whiteFlame", "fairyWhiteFlame", "phoenixKick", "fairyPhoenixKick", "immolation"] } }, "add", false);
            break;
        case "obey":
            row("targeting.effectRefresh", "refresh", "allies");
            buff({
                id: "servitude", recipient: "selected", duration: 2,
                statuses: [{ id: "servitude", level: 1 }]
            }, "add", true);
            break;
        case "stop":
            row("targeting.effectWeaken", "weaken", "boss");
            row("targeting.effectCancel", "cancel", "enemy");
            break;
        case "attackMe":
            row("targeting.effectRetarget", "retarget", "enemies");
            buff({ id: "defenseBarrier", recipient: "self", duration: 1, modifiers: { defense: 3 } });
            break;
        case "store":
            bindingRow("allies", p.ui("library.strongestBinding"), p.ui("library.bindingReduction", { value: 2 }), text("effect.binding.note"));
            row("targeting.effectResource", "resource", actor);
            break;
        case "release":
            buff({ id: "subspaceClutter", recipient: "enemies", duration: 2, modifiers: { defense: -2, hit: -2 } }, "add", true);
            row("targeting.effectBinding", "binding", "allies", "warning");
            row("targeting.effectResource", "resource", actor);
            break;
        case "powerOfSpace":
            buff({ id: "subspaceClutter", recipient: "enemies", modifiers: { defense: -2, hit: -2 } }, "add", true);
            buff({ id: "instability", recipient: "hinari", moveList: { blockedMoves: [move.id] } }, "add", true);
            row("targeting.effectResource", "resource", actor);
            break;
        case "discordSeal":
            row("targeting.effectDiscord", "discord", "enemy");
            break;
        case "powerOfChaos":
            row("targeting.effectDiscord", "discord", "enemies");
            break;
        case "timeAcceleration":
            row("targeting.effectBonus", "bonus", "allies", "warning");
            break;
        case "temporalLock":
            row("targeting.effectWeaken", "weaken", "enemy");
            break;
        case "powerOfTime":
            row("targeting.effectWeaken", "weaken", "boss");
            row("targeting.effectCancel", "cancel", "enemies");
            break;
        case "throwOff":
            buff({ id: "pounce", recipient: "self" }, "remove", true, text("effect.remove.note"));
            row("library.cooldownHeading", "cooldown", "enemy", "warning");
            break;
        case "pounce":
            for (let severity = 1; severity <= 4; severity++) {
                buff({
                    id: "player", recipient: `pounce${severity}`, modifiers: severity === 2 ? { hit: -1 } : severity === 3 ? { hit: -2 } : {},
                    moveList: { addedMoves: ["throwOff"] }, statuses: [{ id: "immobilized", level: 1 }, ...(severity === 3 ? [{ id: "stunned" as const, level: 1 }] : severity === 4 ? [{ id: "helpless" as const, level: 1 }] : [])]
                }, "add", true);
                buff({ id: "skunkette", recipient: `pounce${severity}`, modifiers: { defense: -2, hit: severity * 2 } }, "add", false);
            }
            row("targeting.effectMove", "spray", "followUp", "warning");
            break;
        case "latexMist":
            buff({ id: "latexMist", recipient: "onGrazeHitCrit", duration: 1, modifiers: { spread: 5 } }, "add", true, text("effect.spread.note"));
            bindingRow("onHit", text("effect.onHit") ?? "", "", "", { value: 50, change: 10, max: 100 });
            bindingRow("onCrit", text("effect.onCrit") ?? "", "", "", { value: 50, change: 10, max: 100 });

            break;
        case "latexRegeneration":
            bindingRow("onGraze", text("effect.onGraze") ?? "", "", "", { value: 30, change: 20, max: 100, peak: 80 });
            bindingRow("onHit", text("effect.onHit") ?? "", "", "", { value: 30, change: 50, max: 100, peak: 80 });
            bindingRow("onCrit", text("effect.onCrit") ?? "", "", "", { value: 30, change: 50, max: 100, peak: 80 });
            break;
        case "latexExplosion":
            row("targeting.operationDefeat", "defeat", "onGrazeHit", "danger");
            rows.push({
                recipient: "onMiss", preview: {
                    kind: "trap", id: "library-latexExplosion-trap", type: "trap", tone: "warning", label: p.ui("targeting.effectTrap"),
                    trapName: p.trap("trapPuddle"), currentValue: 0, change: 30, projectedValue: 30, max: 100,
                },
                note: text("effect.trap.note"),
            });
            row("targeting.operationDefeat", "defeat", "onMiss", "danger");
            heal("onCrit", 5, 20, text("effect.heal.note"));
            break;
        case "healingMagic":
            heal("enemy", 50, 25, text("effect.heal.note"));
            heal("onCrit", 50, 25, text("effect.others.note"));
            break;
        case "empoweringMagic":
            buff({ id: "empoweringMagic", recipient: "enemy", duration: 1, modifiers: { potency: 5 } }, "add", false, text("effect.target.note"));
            buff({ id: "empoweringMagic", recipient: "onCrit", duration: 1, modifiers: { potency: 5 } }, "add", false, text("effect.others.note"));
            break;
        case "barrierMagic":
            buff({ id: "barrierMagic", recipient: "onGraze", duration: 1 }, "add", false, text("effect.barrier.note"));
            buff({ id: "barrierMagic", recipient: "onHit", duration: 2 }, "add", false, text("effect.barrier.note"));
            buff({ id: "barrierMagic", recipient: "onCrit", duration: 3 }, "add", false, text("effect.barrier.note"));
            break;
        case "callReinforcements":
        case "latexRainmaker":
            row("targeting.operationSpawn", "spawn", "field");
            break;
        case "skunkPerfume":
            buff({ id: "defensePerfume", recipient: "players", duration: 4, modifiers: { defense: -2 } }, "add", true, text("effect.defense.note"));
            buff({ id: "escapePerfume", recipient: "players", duration: 4, modifiers: { escape: -2 } }, "add", true, text("effect.escape.note"));
            break;
        case "healingPerfume":
            buff({ id: "regenPerfume", recipient: "enemies", duration: 2, modifiers: { regeneration: 3 } }, "add", false, text("effect.regen.note"));
            break;
    }
    if (move.id !== "fairyEmpowerment" && Object.values(library.characters).some(character => character.empoweredMoves.includes(move.id))) empowerment("self", "remove");
    if (Object.keys(move.modifiers ?? {}).length) rows.push({ recipient: "", label: p.ui("library.modifiersHeading"), tone: "primary", modifiers: move.modifiers });
    return rows;
}

/** Buff status names follow the same level-count convention as Library status headings. */
export function libraryBuffStatuses(effect: Pick<MoveBuffReference, "statuses">, library: ContentLibrary, p: Presentation) {
    return (effect.statuses ?? []).map(status => ({
        id: status.id,
        label: library.statuses[status.id]?.modifiers.length === 2 ? libraryName({ category: "statuses", id: status.id }, p)
            : p.ui("characterDetails.statusValue", { status: libraryName({ category: "statuses", id: status.id }, p), value: status.level }),
    }));
}

export function libraryMoveRecipient(id: string, library: ContentLibrary, p: Presentation): string {
    if (Object.hasOwn(library.enemies, id))
        return p.enemyDefinition(id);

    if (Object.hasOwn(library.characters, id))
        return p.entity(id);

    return p.ui("library.recipient." + id);
}

export function libraryCompulsionCooldown(move: MoveReference): number | undefined {
    if (!["obey", "stop", "attackMe"].includes(move.id)) return undefined;
    const shared = Object.entries(move.cooldown ?? {}).filter(([id]) => id !== move.id);
    return shared.length && shared.every(([, count]) => count === shared[0]![1]) ? shared[0]![1] : undefined;
}
