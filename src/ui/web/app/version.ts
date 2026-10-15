declare const __KCQ_GIT_REVISION__: string;

export function gitRevision(): string {
    return typeof __KCQ_GIT_REVISION__ === "string" ? __KCQ_GIT_REVISION__ : "";
}

export function displayVersion(release: string): string {
    const revision = gitRevision();
    if (release) return revision ? `${release} · ${revision}` : release;
    return revision ? `rev. ${revision}` : "v0.0.0";
}
