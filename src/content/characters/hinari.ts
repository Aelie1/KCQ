import { CharacterDef, MoveDef } from "../../engine/protected/definitions";
import { iCharacter } from "../../engine/protected/types";

export const hinari: CharacterDef = {
    id: "hinari",
    getMoves: function (actor: iCharacter): MoveDef[] {
        return [];
    },
    passives: [],
    data: { "subspace": 0 }
};

