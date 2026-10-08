declare const __KCQ_GIT_REVISION__: string;

export function displayVersion(release: string): string {
    const revision = typeof __KCQ_GIT_REVISION__ === "string" ? __KCQ_GIT_REVISION__ : "";
    if (release) return revision ? `${release} · ${revision}` : release;
    return revision ? `rev. ${revision}` : "v0.0.0";
}
