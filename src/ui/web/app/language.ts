import type { Presentation } from "../../presentation/presentation";

export interface LanguageOption {
    id: string;
    label: string;
    presentation: Presentation;
}

export interface LanguageSelection {
    value: string;
    options: readonly LanguageOption[];
    onChange: (id: string) => void;
}
