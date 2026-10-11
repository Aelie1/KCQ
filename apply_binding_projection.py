#!/usr/bin/env python3
"""Show illustrative projected binding reductions using the shared EffectPreview/BindingMeter.

Run from a checkout whose four files match the pushed Oct 11 revision.
The script validates every replacement before writing any files.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent


def edit(path: str, changes: list[tuple[str, str]]) -> tuple[Path, str]:
    target = ROOT / path
    if not target.is_file():
        raise RuntimeError(f"Missing file: {path}. Extract this package into your KCQ repository root.")
    content = target.read_text(encoding="utf-8")
    for original, replacement in changes:
        count = content.count(original)
        if count != 1:
            raise RuntimeError(
                f"Expected exactly one match in {path}, found {count}. "
                "Your checkout may already be changed or differ from the pushed version. "
                f"Missing/ambiguous text: {original[:100]!r}"
            )
        content = content.replace(original, replacement, 1)
    return target, content


CHANGES = {
    "src/ui/web/app/viewModels/effectPreviews.ts": [
        (
            'export interface BindingEffectViewModel {\n',
            'export interface BindingAmountEffectViewModel {\n'
            '    bindingName: string; amountLabel: string; magnitude?: number; max: number; level: BindingLevel;\n'
            '    id: string; kind: "binding"; mode: "amount"; label: string;\n'
            '    recipient?: string; tone: "binding"; type: "binding";\n'
            '}\n'
            'export interface BindingEffectViewModel {\n'
            '    mode?: "state";\n'
        ),
        (
            '| BindingEffectViewModel | BuffEffectViewModel',
            '| BindingEffectViewModel | BindingAmountEffectViewModel | BuffEffectViewModel',
        ),
    ],
    "src/ui/web/app/components/EffectPreview.tsx": [
        (
            'const binding = effect() as Extract<EffectPreviewViewModel, { kind: "binding" }>;\n'
            '                    return (',
            'const binding = effect() as Extract<EffectPreviewViewModel, { kind: "binding" }>;\n'
            '                    const meter = binding.mode === "amount"\n'
            '                        ? { value: binding.magnitude ?? 0, max: binding.max, level: binding.level, ariaLabel: binding.bindingName + " " + binding.amountLabel }\n'
            '                        : { value: binding.currentValue, change: binding.change, max: binding.max, peak: binding.peak,\n'
            '                            level: binding.currentLevel, resultLevel: binding.projectedLevel, ariaLabel: binding.bindingName };\n'
            '                    return (',
        ),
        (
            '''                                    <span class={`kcq-binding-effect__level kcq-escape-value--${binding.currentLevel}`}>
                                        {binding.currentLevelLabel}
                                    </span>
                                    <strong class="kcq-binding-effect__transition">
                                        {binding.currentValue} → {binding.projectedLevelLabel && (
                                            <span class={`kcq-binding-effect__projected-level kcq-escape-value--${binding.projectedLevel}`}>
                                                {binding.projectedLevelLabel}{" "}
                                            </span>
                                        )}{binding.projectedValue}
                                    </strong>
                                </div>
                                <BindingMeter
                                    value={binding.currentValue}
                                    change={binding.change}
                                    max={binding.max}
                                    peak={binding.peak}
                                    level={binding.currentLevel}
                                    resultLevel={binding.projectedLevel}
                                    size="compact"
                                    ariaLabel={binding.bindingName}
                                />''',
            '''                                    {binding.mode === "amount"
                                        ? <strong class="kcq-binding-effect__transition">{binding.amountLabel}</strong>
                                        : <>
                                            <span class={`kcq-binding-effect__level kcq-escape-value--${binding.currentLevel}`}>
                                                {binding.currentLevelLabel}
                                            </span>
                                            <strong class="kcq-binding-effect__transition">
                                                {binding.currentValue} → {binding.projectedLevelLabel && (
                                                    <span class={`kcq-binding-effect__projected-level kcq-escape-value--${binding.projectedLevel}`}>
                                                        {binding.projectedLevelLabel}{" "}
                                                    </span>
                                                )}{binding.projectedValue}
                                            </strong>
                                        </>}
                                </div>
                                <BindingMeter {...meter} size="compact" />''',
        ),
    ],
    "src/ui/web/app/viewModels/libraryMoveEffects.ts": [
        (
            'import type { ContentLibrary, MoveBuffReference, MoveReference } from "../../../../engine/public/library";',
            'import type { ContentLibrary, MoveBuffReference, MoveReference } from "../../../../engine/public/library";\n'
            'import { getThresholds } from "../../../../engine/public/mechanics";',
        ),
        (
            'import { formatSignedNumber, isDebuff, isHarmfulModifierChange } from "./presentationHelpers";',
            'import { bindingLevelAtValue, formatSignedNumber, isDebuff, isHarmfulModifierChange } from "./presentationHelpers";',
        ),
        (
            'const text = (key: string) => p.referenceText("move", move.id, key);',
            'const text = (key: string) => p.referenceText("move", move.id, key);\n'
            '    const thresholds = getThresholds();',
        ),
        (
            '''const bindingRow = (recipient: string, name: string, change: string, note?: string): void => {
        rows.push({
            recipient,
            preview: {
                kind: "compact",
                id: `library-${move.id}-binding-${rows.length}`,
                type: "binding",
                tone: "special",
                label: p.ui("targeting.effectBinding"),
                payload: `${name} ${change}`,
                details: [],
            },
            note,
        });
    };''',
            '''const bindingRow = (recipient: string, name: string, change: string, note?: string, magnitude?: number, max = thresholds.max): void => {
        rows.push({
            recipient,
            preview: {
                kind: "binding", mode: "amount",
                id: `library-${move.id}-binding-${rows.length}`,
                type: "binding",
                tone: "binding",
                label: p.ui("targeting.effectBinding"),
                bindingName: name, amountLabel: change, magnitude, max,
                level: bindingLevelAtValue(magnitude ?? 0, thresholds),
            },
            note,
        });
    };''',
        ),
        (
            'bindingRow("allies", p.ui("library.strongestBinding"), "−100", text("effect.binding.note"));',
            'bindingRow("allies", p.ui("library.strongestBinding"), "−100", text("effect.binding.note"), 100);',
        ),
        (
            'bindingRow(actor, p.ui("library.allBindings"), "−50%", text("effect.binding.note"));',
            'bindingRow(actor, p.ui("library.allBindings"), "−50%", text("effect.binding.note"), 50, 100);',
        ),
        (
            'bindingRow("players", p.ui("library.bodyZones"), move.baseDamage?.toString() ?? "", text("effect.binding.note"));',
            'bindingRow("players", p.ui("library.bodyZones"), move.baseDamage?.toString() ?? "", text("effect.binding.note"), move.baseDamage);',
        ),
    ],
    "tests/ui/library.dom.test.ts": [
        (
            'Strongest Binding−100',
            'Strongest Binding −100',
        ),
        (
            '''it("renders binding reductions as amount bars without invented current or resulting values", () => {
        for (const id of ["powerOfDenial", "immolation", "store"]) {
            libraryMount({ kind: "entry", category: "moves", id });
            const binding = element(".kcq-binding-effect");
            expect(binding.querySelector(".kcq-binding-meter")).not.toBeNull();
            expect(binding.querySelector(".kcq-binding-effect__transition")!.textContent).toContain("−");
            expect(binding.textContent).not.toContain("→");
            if (id === "powerOfDenial") expect(binding.querySelector(".kcq-binding-effect__transition")!.textContent).toBe("−100");
            unmount!();
        }
    });''',
            '''it("shows static binding amounts on shared meters without fabricating combat state", () => {
        for (const [id, label, width] of [
            ["powerOfDenial", "−100", "100%"],
            ["immolation", "−50%", "50%"],
            ["store", "−", "0%"],
        ] as const) {
            libraryMount({ kind: "entry", category: "moves", id });
            const binding = element(".kcq-binding-effect");
            expect(binding.classList.contains("kcq-preview-effect--special")).toBe(true);
            expect(binding.querySelector(".kcq-preview-effect__tag")!.textContent).toBe("Binding");
            expect(binding.querySelector(".kcq-binding-effect__transition")!.textContent).toContain(label);
            const meter = binding.querySelector(".kcq-binding-meter");
            expect(meter).not.toBeNull();
            expect((meter!.querySelector(".kcq-binding-meter__value") as HTMLElement).style.width).toBe(width);
            expect(binding.textContent).not.toContain("→");
            unmount!();
        }
    });''',
        ),
    ],
}


# Upgrades from the previous static-meter implementation to projected reductions.
# Applied after CHANGES when running against the freshly pushed code; applied
# directly when the first ZIP's changes are already present.
UPGRADES = {
    "src/ui/web/app/viewModels/effectPreviews.ts": [
        (
            'export interface BindingEffectViewModel {\n    mode?: "state";\n',
            'export interface BindingEffectViewModel {\n    mode?: "state";\n    changeLabel?: string;\n',
        ),
    ],
    "src/ui/web/app/components/EffectPreview.tsx": [
        (
            '''                                                )}{binding.projectedValue}
                                            </strong>''',
            '''                                                )}{binding.projectedValue}{binding.changeLabel ? ` (${binding.changeLabel})` : ""}
                                            </strong>''',
        ),
    ],
    "src/ui/web/app/viewModels/libraryMoveEffects.ts": [
        (
            '''const bindingRow = (recipient: string, name: string, change: string, note?: string, magnitude?: number, max = thresholds.max): void => {
        rows.push({
            recipient,
            preview: {
                kind: "binding", mode: "amount",
                id: `library-${move.id}-binding-${rows.length}`,
                type: "binding",
                tone: "binding",
                label: p.ui("targeting.effectBinding"),
                bindingName: name, amountLabel: change, magnitude, max,
                level: bindingLevelAtValue(magnitude ?? 0, thresholds),
            },
            note,
        });
    };''',
            '''const bindingRow = (
        recipient: string, name: string, change: string, note?: string,
        meter?: { value: number; change?: number; max?: number },
    ): void => {
        const id = `library-${move.id}-binding-${rows.length}`;
        const label = p.ui("targeting.effectBinding");
        const max = meter?.max ?? thresholds.max;
        const projected = Math.max(0, Math.min(max, (meter?.value ?? 0) + (meter?.change ?? 0)));
        rows.push({
            recipient,
            preview: meter?.change === undefined ? {
                kind: "binding", mode: "amount", id, type: "binding", tone: "binding", label,
                bindingName: name, amountLabel: change, magnitude: meter?.value, max,
                level: bindingLevelAtValue(meter?.value ?? 0, thresholds),
            } : {
                kind: "binding", id, type: "binding", tone: "binding", label,
                bindingName: name, currentValue: meter.value, change: meter.change,
                projectedValue: projected, max,
                currentLevel: bindingLevelAtValue(meter.value, thresholds),
                currentLevelLabel: "", // An illustration, not a live binding state.
                projectedLevel: bindingLevelAtValue(projected, thresholds),
                changeLabel: change,
            },
            note,
        });
    };''',
        ),
        (
            '''bindingRow("allies", p.ui("library.strongestBinding"), "−100", text("effect.binding.note"), 100);''',
            '''bindingRow("allies", p.ui("library.strongestBinding"), "−100", text("effect.binding.note"), { value: 100, change: -100 });''',
        ),
        (
            '''bindingRow(actor, p.ui("library.allBindings"), "−50%", text("effect.binding.note"), 50, 100);''',
            '''bindingRow(actor, `${p.ui("library.allBindings")} −50%`, "−50", text("effect.binding.note"), { value: 100, change: -50 });''',
        ),
        (
            '''bindingRow("players", p.ui("library.bodyZones"), move.baseDamage?.toString() ?? "", text("effect.binding.note"), move.baseDamage);''',
            '''bindingRow("players", p.ui("library.bodyZones"), move.baseDamage?.toString() ?? "", text("effect.binding.note"), { value: move.baseDamage ?? 0 });
            break;''',
        ),
    ],
    "tests/ui/library.dom.test.ts": [
        (
            'Strongest Binding −100',
            'Strongest Binding',
        ),
        (
            '''it("shows static binding amounts on shared meters without fabricating combat state", () => {
        for (const [id, label, width] of [
            ["powerOfDenial", "−100", "100%"],
            ["immolation", "−50%", "50%"],
            ["store", "−", "0%"],
        ] as const) {
            libraryMount({ kind: "entry", category: "moves", id });
            const binding = element(".kcq-binding-effect");
            expect(binding.classList.contains("kcq-preview-effect--special")).toBe(true);
            expect(binding.querySelector(".kcq-preview-effect__tag")!.textContent).toBe("Binding");
            expect(binding.querySelector(".kcq-binding-effect__transition")!.textContent).toContain(label);
            const meter = binding.querySelector(".kcq-binding-meter");
            expect(meter).not.toBeNull();
            expect((meter!.querySelector(".kcq-binding-meter__value") as HTMLElement).style.width).toBe(width);
            expect(binding.textContent).not.toContain("→");
            unmount!();
        }
    });''',
            '''it("shows illustrative binding decreases on the shared projected meter", () => {
        for (const [id, transition, resultingFill] of [
            ["powerOfDenial", "100 → 0 (−100)", "0%"],
            ["immolation", "100 → 50 (−50)", "50%"],
        ] as const) {
            libraryMount({ kind: "entry", category: "moves", id });
            const binding = element(".kcq-binding-effect");
            expect(binding.classList.contains("kcq-preview-effect--special")).toBe(true);
            expect(binding.querySelector(".kcq-preview-effect__tag")!.textContent).toBe("Binding");
            expect(binding.querySelector(".kcq-binding-effect__transition")!.textContent).toBe(transition);
            const meter = element<HTMLElement>(".kcq-binding-effect .kcq-binding-meter");
            expect(meter.classList.contains("kcq-binding-meter--decrease")).toBe(true);
            expect(meter.getAttribute("aria-valuenow")).toBe("100");
            expect((meter.querySelector(".kcq-binding-meter__value") as HTMLElement).style.width).toBe(resultingFill);
            expect(meter.querySelector(".kcq-binding-meter__change")).not.toBeNull();
            unmount!();
        }
    });
    it("keeps an unfilled binding meter for variable reductions", () => {
        libraryMount({ kind: "entry", category: "moves", id: "store" });
        const meter = element<HTMLElement>(".kcq-binding-effect .kcq-binding-meter");
        expect((meter.querySelector(".kcq-binding-meter__value") as HTMLElement).style.width).toBe("0%");
        expect(meter.querySelector(".kcq-binding-meter__change")).toBeNull();
        expect(element(".kcq-binding-effect__transition").textContent).toContain("−Escape potency ×2");
    });''',
        ),
    ],
}


def apply_changes(path: str, content: str, changes: list[tuple[str, str]]) -> str:
    for before, after in changes:
        occurrences = content.count(before)
        if occurrences != 1:
            raise RuntimeError(
                f"Expected exactly one match in {path}, found {occurrences}. "
                f"The checkout may have newer or conflicting edits: {before[:110]!r}"
            )
        content = content.replace(before, after, 1)
    return content


def main() -> None:
    paths = list(CHANGES)
    originals = {}
    for path in paths:
        target = ROOT / path
        if not target.is_file():
            raise RuntimeError(f"Missing file: {path}. Extract this package into the KCQ repo root.")
        originals[path] = target.read_bytes()

    modified = {path: data.decode("utf-8") for path, data in originals.items()}
    previous_version_installed = "BindingAmountEffectViewModel" in modified["src/ui/web/app/viewModels/effectPreviews.ts"]

    if not previous_version_installed:
        for path, changes in CHANGES.items():
            modified[path] = apply_changes(path, modified[path], changes)
    for path, changes in UPGRADES.items():
        modified[path] = apply_changes(path, modified[path], changes)

    # Write only after all four files have passed every validation.
    for path, body in modified.items():
        if b"\r\n" in originals[path]:
            body = body.replace("\n", "\r\n")
        (ROOT / path).write_bytes(body.encode("utf-8"))
        print("Updated", path)
    print("Finished. Review git diff and run your tests before committing.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
