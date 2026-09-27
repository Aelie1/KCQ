interface SemanticVersion {
    major: string;
    minor: string;
    patch: string;
    prerelease: string[];
}

const SEMANTIC_VERSION = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/u;

export function compareSemanticVersions(left: string, right: string): number {
    const leftVersion = parseSemanticVersion(left);
    const rightVersion = parseSemanticVersion(right);
    for (const key of ["major", "minor", "patch"] as const) {
        const comparison = compareNumericIdentifier(leftVersion[key], rightVersion[key]);
        if (comparison !== 0) return comparison;
    }
    if (leftVersion.prerelease.length === 0 || rightVersion.prerelease.length === 0) {
        return leftVersion.prerelease.length === rightVersion.prerelease.length
            ? 0
            : leftVersion.prerelease.length === 0 ? 1 : -1;
    }
    const identifiers = Math.max(
        leftVersion.prerelease.length,
        rightVersion.prerelease.length,
    );
    for (let index = 0; index < identifiers; index++) {
        const leftIdentifier = leftVersion.prerelease[index];
        const rightIdentifier = rightVersion.prerelease[index];
        if (leftIdentifier === undefined || rightIdentifier === undefined) {
            return leftIdentifier === rightIdentifier ? 0 : leftIdentifier === undefined ? -1 : 1;
        }
        if (leftIdentifier === rightIdentifier) continue;
        const leftNumeric = /^\d+$/u.test(leftIdentifier);
        const rightNumeric = /^\d+$/u.test(rightIdentifier);
        if (leftNumeric && rightNumeric) {
            return compareNumericIdentifier(leftIdentifier, rightIdentifier);
        }
        if (leftNumeric) return -1;
        if (rightNumeric) return 1;
        return leftIdentifier < rightIdentifier ? -1 : 1;
    }
    return 0;
}

export function assertSemanticVersion(value: string, label = "version"): void {
    try {
        parseSemanticVersion(value);
    } catch {
        throw new Error(`${label} must be a valid semantic version; received ${JSON.stringify(value)}.`);
    }
}

function parseSemanticVersion(value: string): SemanticVersion {
    const match = SEMANTIC_VERSION.exec(value.trim());
    if (!match) throw new Error(`Invalid semantic version ${JSON.stringify(value)}.`);
    return {
        major: match[1],
        minor: match[2],
        patch: match[3],
        prerelease: match[4]?.split(".") ?? [],
    };
}

function compareNumericIdentifier(left: string, right: string): number {
    if (left.length !== right.length) return left.length < right.length ? -1 : 1;
    return left === right ? 0 : left < right ? -1 : 1;
}
