import type { CampaignId, EncounterId } from "../../../engine/public/types";

export type CampaignUnlocks = Readonly<Partial<Record<CampaignId, readonly EncounterId[]>>>;

const STORAGE_KEY = "kcq.unlocks";

export function loadCampaignUnlocks(storage?: Pick<Storage, "getItem">): CampaignUnlocks {
    try {
        const saved: unknown = JSON.parse((storage ?? window.localStorage).getItem(STORAGE_KEY) ?? "{}");
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
        return Object.fromEntries(Object.entries(saved)
            .filter(([, ids]) => Array.isArray(ids))
            .map(([campaign, ids]) => [campaign, [...new Set((ids as unknown[])
                .filter((id): id is EncounterId => typeof id === "string" && id.length > 0))]]));
    } catch {
        return {};
    }
}

export function saveCampaignUnlocks(unlocks: CampaignUnlocks, storage?: Pick<Storage, "setItem">): void {
    try {
        (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(unlocks, null, 2));
    } catch { /* Keep in-session progress when storage is unavailable. */ }
}
