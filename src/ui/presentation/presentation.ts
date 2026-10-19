import { BattleState, BindingId, BindingLevel, BuffId, CampaignId, DifficultyId, EncounterId, EnemyRank, EntityId, FailureReason, FlagId, HitBand, ModifierId, MoveId, MoveType, PassiveId, Phase, SectionId, StanceId, StatusId, TrapId } from "../../engine/public/types";

interface StringKey {
    id: string;
    args?: Record<string, StringArg>;
}

type StringArg = number | string | boolean | StringKey;

export type StringTable = Record<string, string>;

export class Presentation {
    private readonly strings: StringTable;

    constructor(strings: StringTable) {
        this.strings = strings;
    }

    entity(entity: EntityId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.entityKey(entity, variant));
    }

    characterSelection(id: EntityId, variant: "role" | "point1" | "point2" | "point3"): string {
        return this.translate(this.definitionKey("entity", id, `party.${variant}`));
    }

    campaign(campaign: CampaignId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("campaign", campaign, variant));
    }

    campaignSection(campaign: CampaignId, section: SectionId): string {
        return this.translate(this.definitionKey("campaign", `${campaign}.${section}`, "name"));
    }

    enemyDefinition(id: EntityId): string {
        const generic = this.definitionKey("entity", id, "generic");
        return this.translate(this.strings[generic.id] !== undefined
            ? generic
            : this.definitionKey("entity", id, "name"));
    }

    enemyRank(rank: EnemyRank): string {
        return this.ui(`enemyRank.${rank}`);
    }

    binding(
        binding: BindingId,
        variant: "name" | "short" | "desc" = "name",
    ): string {
        return this.translate(this.definitionKey("binding", binding, variant));
    }

    move(move: MoveId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("move", move, variant));
    }

    status(status: StatusId, variant: "name" | "short" | "desc" = "name"): string {
        return this.translate(this.definitionKey("status", status, variant));
    }

    trap(trap: TrapId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("trap", trap, variant));
    }

    passive(passive: PassiveId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("passive", passive, variant));
    }

    encounter(encounter: EncounterId, variant: "name" | "desc" = "name"): string {
        return this.translate(this.definitionKey("encounter", encounter, variant));
    }

    referenceText(namespace: "buff" | "entity" | "move" | "passive" | "binding" | "trap" | "status" | "encounter" | "difficulty" | "guide", id: string, variant: string = "desc"): string | undefined {
        const text = this.strings[this.definitionKey(namespace, id, variant).id];
        return text === undefined || text.trim() === "..." || text.trim() === "" ? undefined : text;
    }

    buff(buff: BuffId, severity: number | undefined, variant: "name" | "desc" = "name"): string {
        if (severity !== undefined) {
            return this.translate({
                id: "buff.severity.text",
                args: {
                    name: this.definitionKey("buff", buff, variant),
                    severity: this.buffSeverity(severity),
                },
            });
        } else {
            return this.translate(this.definitionKey("buff", buff, variant));
        }
    }

    buffMoveList(buff: BuffId, variant: "allow" | "block"): string | undefined {
        const key = this.definitionKey("buff", buff, variant);
        return this.strings[key.id] === undefined ? undefined : this.translate(key);
    }

    buffSeverity(severity: number): string {
        return this.translate(this.definitionKey("buff", "severity", severity.toString()));
    }

    failure(reason: FailureReason): string {
        return this.translate(this.definitionKey("failure", reason, "text"));
    }

    phase(phase: Phase): string {
        return this.translate(this.definitionKey("phase", phase, "name"));
    }

    stance(stance: StanceId): string {
        return this.translate(this.definitionKey("stance", stance, "name"));
    }

    bindingLevel(level: BindingLevel): string {
        return this.translate(this.definitionKey("bindingLevel", level, "name"));
    }

    hitBand(band: HitBand): string {
        return this.translate(this.definitionKey("hitBand", band, "name"));
    }

    moveType(type: MoveType): string {
        return this.translate(this.definitionKey("moveType", type, "compact"));
    }

    data(type: string, variant: "name" | "short" = "name"): string {
        return this.translate(this.definitionKey("data", type, variant));
    }

    ui(label: string, args?: Record<string, StringArg>): string {
        return this.translate({ id: `ui.${label}`, args });
    }

    difficulty(difficulty: DifficultyId, variant: string = "name"): string {
        return this.translate(this.definitionKey("difficulty", difficulty, variant));
    }

    battleState(state: BattleState): string {
        return this.translate(this.definitionKey("battleState", state, "name"));
    }

    modifier(modifier: ModifierId, variant: "name" | "compact" = "name"): string {
        return this.translate(this.definitionKey("modifier", modifier, variant));
    }

    load(type: "Character" | "Encounter", id: EntityId | EncounterId, success: boolean) {
        return this.ui(
            `load${type}.${success ? "success" : "failure"}`,
            { id: success ? (type === "Character" ? this.entityKey(id) : this.encounter(id)) : id }
        );
    }

    flag(flag: FlagId): string {
        return this.translate(this.definitionKey("flag", flag, "name"));
    }

    private isStringKey(value: unknown): value is StringKey {
        return typeof value === "object"
            && value !== null
            && "id" in value
            && typeof value.id === "string";
    }

    private translate(key: StringKey): string {
        const template = this.strings[key.id];

        if (template === undefined) {
            return `[${key.id}]`;
        }

        if (!key.args) {
            return template;
        }

        return template.replace(/\{([^}]+)\}/g, (match, name: string) => {
            const value = key.args?.[name];

            if (value === undefined) {
                return match;
            }

            return this.isStringKey(value)
                ? this.translate(value)
                : String(value);
        });
    }

    private definitionKey(namespace: string, id: string, variant: string): StringKey {
        return { id: `${namespace}.${id}.${variant}` };
    }

    private entityKey(entity: EntityId, variant: "name" | "desc" = "name"): StringKey {
        const match = entity.match(/^(.*?)(\d+)$/);

        if (!match) {
            return this.definitionKey("entity", entity, variant);
        }

        const key = this.definitionKey("entity", match[1], variant);
        return variant === "name"
            ? { ...key, args: { index: Number(match[2]) } }
            : key;
    }
}
