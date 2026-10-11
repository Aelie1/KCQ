#!/usr/bin/env python3
"""Restore KCQ Library binding amount bars through the shared EffectPreview/BindingMeter.

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


def main() -> None:
    # Validate all files and replacements before writing any file.
    edits = [edit(path, changes) for path, changes in CHANGES.items()]
    for target, content in edits:
        # Preserve working-copy newline style when practical.
        original = target.read_bytes()
        if b"\r\n" in original:
            content = content.replace("\n", "\r\n")
        target.write_bytes(content.encode("utf-8"))
        print("Updated", target.relative_to(ROOT))
    print("Finished. Run your project tests before committing.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
