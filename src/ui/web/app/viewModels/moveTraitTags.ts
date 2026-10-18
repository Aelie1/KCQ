import type { MoveTrait } from "../../../../engine/public/types";
import type { Presentation } from "../../../presentation/presentation";
import type { CommandTagTone, CommandTagViewModel } from "./characterDetails";

const TRAIT_TAGS: Record<MoveTrait, { label: string; tone: CommandTagTone }> = {
    damage: { label: "characterDetails.tagDamage", tone: "danger" },
    buff: { label: "characterDetails.tagBuff", tone: "success" },
    debuff: { label: "characterDetails.tagDebuff", tone: "special" },
    escape: { label: "characterDetails.tagEscape", tone: "success" },
    onetime: { label: "characterDetails.tagOnetime", tone: "warning" },
    refresh: { label: "characterDetails.tagRefresh", tone: "success" },
    heal: { label: "characterDetails.tagHeal", tone: "success" },
    defeat: { label: "characterDetails.tagDefeat", tone: "danger" },
    spawn: { label: "characterDetails.tagSpawn", tone: "primary" },
    trap: { label: "characterDetails.tagTrap", tone: "warning" },
    retarget: { label: "characterDetails.tagRetarget", tone: "primary" },
    binding: { label: "characterDetails.tagBinding", tone: "primary" },
    cancel: { label: "characterDetails.tagCancel", tone: "special" },
    weaken: { label: "characterDetails.tagWeaken", tone: "special" },
    bonus: { label: "characterDetails.tagBonusEscape", tone: "warning" },
};

export function semanticTraitTag(trait: MoveTrait, presentation: Presentation): CommandTagViewModel {
    const { label, tone } = TRAIT_TAGS[trait];
    return { id: trait, label: presentation.ui(label), tone };
}
