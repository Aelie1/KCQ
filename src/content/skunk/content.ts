import { ContentCatalogFragment } from "../../engine/protected/types";
import { dormant, eliteCallback } from "./constants";
import { epilogue, forest_1, forest_2, forest_3, interlude_1, interlude_2, interlude_3, outside, plains_1, plains_2, plains_3, prologue, skunkCampaign, tower_1, tower_2, tower_3 } from "./encounters";
import { barrierCallback, barrierMagic, bindingMagic, empoweringMagic, fairy, healingMagic } from "./fairy";
import { latexArms, latexCollar, latexHead, latexLegs, latexTorso } from "./latex";
import { trapPuddle } from "./puddles";
import { callReinforcements, healingPerfume, latexRainmaker, queen, skunkCollar, skunkGun, skunkPerfume } from "./queen";
import { latexRain, rainmaker } from "./rainmaker";
import { latexExplosion, latexPuddle, latexRegeneration, latexShower, skunk, skunkEmpress } from "./skunk";
import { latexMist, latexSpray, pounce, skunkette, skunketteQueen, throwOff } from "./skunkette";

export const skunkCatalog: ContentCatalogFragment = {
    enemies: [
        skunkette,
        skunk,
        queen,
        fairy,
        rainmaker,
        skunketteQueen,
        skunkEmpress,
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
        skunkGun, skunkPerfume, healingPerfume, callReinforcements, latexRainmaker, skunkCollar,
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
        barrierCallback,
        eliteCallback
    ],

    statuses: [
        dormant
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