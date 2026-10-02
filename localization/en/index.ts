import { StringTable } from "../../src/ui/presentation/presentation";
import { characterStrings } from "./characters";
import { eventStrings } from "./events";
import { skunkStrings } from "./skunk";
import { systemStrings } from "./system";

export const englishStrings: StringTable = {
    ...characterStrings,
    ...skunkStrings,
    ...systemStrings,
    ...eventStrings,
};