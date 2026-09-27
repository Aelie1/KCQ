import { blinded, bound, breathless, gagged, helpless, hobbled, immobilized, incapacitated, servitude, stunned, submissive, vibrating } from "../engine/protected/statuses";
import { ContentCatalog } from "../engine/protected/types";
import { brace, fairyRockfall, hinari, release, rockfall, store, subspaceMovement } from "./characters/hinari";
import { fairyEmpowerment, fairyReflect, fairyStarlightBindings, fairyTelekinesis, fairyTransformation, ko, powerOfDenial, reflect, starlightBindings, telekinesis, thousandRestraintsBody } from "./characters/ko";
import { attackMe, fairyPhoenixKick, fairyWhiteFlame, immolation, kick, matsuko, obey, phoenixKick, punch, stop, whiteFlame } from "./characters/matsuko";
import { forest_1, forest_2, forest_3, plains_1, plains_2, plains_3 } from "./skunk/encounters";
import { barrierMagic, bindingMagic, empoweringMagic, fairy, healingMagic } from "./skunk/fairy";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./skunk/latex";
import { trapPuddle } from "./skunk/puddles";
import { callReinforcements, latexRainmaker, queen, skunkCollar, skunkGun, skunkPerfume } from "./skunk/queen";
import { latexRain, rainmaker } from "./skunk/rainmaker";
import { latexExplosion, latexPuddle, latexRegeneration, latexShower, skunk } from "./skunk/skunk";
import { latexMist, latexSpray, pounce, skunkette, throwOff } from "./skunk/skunkette";

export const contentCatalog: ContentCatalog = {
    characters: [
        ko,
        matsuko,
        hinari,
    ],

    enemies: [
        skunkette,
        skunk,
        queen,
        fairy,
        rainmaker,
    ],

    moves: [
        //ko
        telekinesis, starlightBindings, reflect, fairyTransformation, powerOfDenial,
        fairyTelekinesis, fairyStarlightBindings, fairyReflect, fairyEmpowerment,
        //matsuko
        whiteFlame, phoenixKick, immolation, obey, stop, attackMe,
        fairyWhiteFlame, fairyPhoenixKick, punch, kick,
        //hinari
        rockfall, store, brace, release,
        fairyRockfall,
        //skunkette
        latexSpray, latexMist, pounce, throwOff,
        //skunk
        latexShower, latexPuddle, latexRegeneration, latexExplosion,
        //fairy
        healingMagic, empoweringMagic, barrierMagic, bindingMagic,
        //rainmaker
        latexRain,
        //queen
        skunkGun, skunkPerfume, callReinforcements, latexRainmaker, skunkCollar,
    ],

    passives: [
        thousandRestraintsBody,
        subspaceMovement
    ],

    bindings: [
        latexHead,
        latexArms,
        latexTorso,
        latexLegs,
        latexCollar,
    ],

    traps: [
        trapPuddle,
    ],

    statuses: [
        bound,
        gagged,
        hobbled,
        vibrating,
        submissive,
        breathless,
        blinded,
        immobilized,
        helpless,
        stunned,
        incapacitated,
        servitude,
    ],

    encounters: [
        plains_1,
        plains_2,
        plains_3,
        forest_1,
        forest_2,
        forest_3,
    ],
};