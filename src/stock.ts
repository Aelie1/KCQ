import { createEngine } from "./content";

export const stockCharacters = ["ko", "matsuko", "hinari"] as const;
export const stockCampaign = "skunk" as const;

export function createStockEngine(seed?: number) {
    return createEngine(stockCharacters, stockCampaign, seed);
}
