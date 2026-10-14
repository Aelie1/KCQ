import { ContentCatalogFragment } from "../../engine/protected/types";
import { epilogue, forest_1, forest_2, forest_3, interlude_1, interlude_2, interlude_3, outside, plains_1, plains_2, plains_3, prologue, skunkCampaign, tower_1, tower_2, tower_3 } from "./encounters";
import { barrierCallback, barrierMagic, bindingMagic, empoweringMagic, fairy, healingMagic } from "./fairy";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./latex";
import { trapPuddle } from "./puddles";
import { callReinforcements, latexRainmaker, queen, skunkCollar, skunkGun, skunkPerfume } from "./queen";
import { latexRain, rainmaker } from "./rainmaker";
import { latexExplosion, latexPuddle, latexRegeneration, latexShower, skunk } from "./skunk";
import { latexMist, latexSpray, pounce, skunkette, throwOff } from "./skunkette";

export const skunkCatalog: ContentCatalogFragment = {
    enemies: [
        skunkette,
        skunk,
        queen,
        fairy,
        rainmaker,
    ],

    moves: [
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

    callbacks: [
        barrierCallback
    ],

    encounters: [
        prologue,
        plains_1,
        plains_2,
        plains_3,
        interlude_1,
        forest_1,
        forest_2,
        forest_3,
        interlude_2,
        tower_1,
        tower_2,
        tower_3,
        interlude_3,
        epilogue,
        outside
    ],

    campaigns: [
        skunkCampaign
    ]
};