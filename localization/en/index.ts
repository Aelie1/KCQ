import { characterStrings } from "./characters";
import { eventStrings } from "./events";
import { skunkStrings } from "./skunk";
import { systemStrings } from "./system";

export const englishStrings = {
    ...characterStrings,
    ...skunkStrings,
    ...systemStrings,
    ...eventStrings,
};