import { readFileSync } from "node:fs";
import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import type { ActionInfo, MoveTrait } from "../../src/engine/public/types";
import { Presentation } from "../../src/ui/presentation/presentation";
import { CommandTag } from "../../src/ui/web/app/components/CommandTag";
import { characterDetailsFixture } from "../../src/ui/web/app/fixtures/characterDetails";
import { createMoveTags, type CommandTagTone } from "../../src/ui/web/app/viewModels/characterDetails";
import { libraryMoveTags, libraryTags } from "../../src/ui/web/app/viewModels/library";
import { stockStrings } from "../helpers/stockStrings";

// The Record makes new supported traits require an explicit expected combat tone.
const tones: Record<MoveTrait, CommandTagTone> = {
    damage: "danger", buff: "success", debuff: "special", escape: "success", onetime: "warning",
    refresh: "success", heal: "success", defeat: "danger", spawn: "primary", trap: "warning",
    retarget: "primary", binding: "primary", cancel: "special", weaken: "special", bonus: "warning",
};
const css = readFileSync("src/ui/web/app/app.css", "utf8");

describe("shared semantic move tags", () => {
    it.each(Object.keys(tones) as MoveTrait[])("uses the combat tone for %s in both Library and battle rendering", trait => {
        const { state, presentation } = characterDetailsFixture;
        const action: ActionInfo = {
            move: { id: "test", type: "none", targetSide: "enemy", targets: 1, traits: [trait] },
            available: false, targets: [], effects: [],
        };
        const combat = createMoveTags(action, state, state.characters[0]!, presentation).find(tag => tag.id === trait);
        const tags = libraryTags([trait], presentation);
        expect(tags).toEqual([combat]);
        expect(combat?.tone).toBe(tones[trait]);
        expect(combat?.label).not.toMatch(/\[.*\]/);
        expect(libraryMoveTags({ ...action.move, bindings: [] }, presentation)).toContainEqual(combat);
        const html = renderToString(() => createComponent(CommandTag, { tag: tags[0]! }));
        expect(html).toContain(`kcq-command-tag--${tones[trait]}`);
        expect(html).toContain(tags[0]!.label);
        expect(css).toContain(`.kcq-command-tag--${tones[trait]}`);
    });

    it("shares localized labels and allows moves without semantic traits", () => {
        const presentation = new Presentation({ ...stockStrings, "ui.characterDetails.tagBuff": "Localized buff" });
        expect(libraryTags(["buff"], presentation)).toEqual([{ id: "buff", label: "Localized buff", tone: "success" }]);
        expect(libraryTags(undefined, presentation)).toEqual([]);
    });
});
