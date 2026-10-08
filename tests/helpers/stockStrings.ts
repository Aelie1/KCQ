import { getStringTable } from "../../localization";
import { stockCampaign, stockCharacters } from "../../src/stock";

export const stockStrings = getStringTable("en", stockCharacters, stockCampaign);
