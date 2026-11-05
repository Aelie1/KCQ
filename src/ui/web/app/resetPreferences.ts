import { batch } from "solid-js";
import { DEFAULT_COMPACT_LOG_STYLE, DEFAULT_FULL_LOG_STYLE, type LogStylePreferences } from "./gameLogMode";
import { DEFAULT_LANGUAGE_ID, type LanguageSelection } from "./language";
import { DEFAULT_OVERVIEW_GAME_LOG_LINES, type OverviewGameLogPreference } from "./overviewGameLogLines";
import { DEFAULT_PLAYBACK_SPEED, type PlaybackSpeedPreference } from "./playbackSpeed";
import { DEFAULT_SHORTCUT_HINT_MODE, type ShortcutHintPreference } from "./shortcutHints";
import { DEFAULT_THEME, type ThemePreference } from "./theme";
import type { ViewPreferences } from "./viewPreferences";

/** Reset only the preferences exposed in Settings, preserving saves and progress. */
export function resetPreferences(preferences: {
    viewPreferences?: ViewPreferences;
    theme?: ThemePreference;
    language?: LanguageSelection;
    overviewGameLog?: OverviewGameLogPreference;
    logStyles?: LogStylePreferences;
    playbackSpeed?: PlaybackSpeedPreference;
    shortcutHints?: ShortcutHintPreference;
}): void {
    batch(() => {
        preferences.viewPreferences?.reset();
        preferences.theme?.onChange(DEFAULT_THEME);
        preferences.overviewGameLog?.onChange(DEFAULT_OVERVIEW_GAME_LOG_LINES);
        preferences.logStyles?.setFull(DEFAULT_FULL_LOG_STYLE);
        preferences.logStyles?.setCompact(DEFAULT_COMPACT_LOG_STYLE);
        preferences.playbackSpeed?.onChange(DEFAULT_PLAYBACK_SPEED);
        preferences.shortcutHints?.onChange(DEFAULT_SHORTCUT_HINT_MODE);
        if (preferences.language?.options.some(option => option.id === DEFAULT_LANGUAGE_ID)) {
            preferences.language.onChange(DEFAULT_LANGUAGE_ID);
        }
    });
}
