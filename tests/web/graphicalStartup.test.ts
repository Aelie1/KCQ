import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";

vi.mock("solid-js/web", async (importOriginal) => ({
    ...await importOriginal<typeof import("solid-js/web")>(),
    render: vi.fn(),
}));
vi.mock("../../src/ui/web/app/GraphicalApp", () => ({ GraphicalApp: vi.fn(() => "picker") }));
vi.mock("../../src/ui/web/posthog", () => ({ gameplayTelemetry: {} }));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
});

describe("graphical browser startup", () => {
    it.each(["", "?encounter=plains_3&difficulty=mythic", "?encounter=missing&difficulty=invalid"])("mounts the same unprepared app without reading search: %s", async (search) => {
        const root = {};
        const getSearch = vi.fn(() => search);
        vi.stubGlobal("document", { getElementById: vi.fn(() => root) });
        vi.stubGlobal("window", { location: { get search() { return getSearch(); } } });
        vi.stubGlobal("__KCQ_RELEASE_TAG__", "test");
        await import("../../src/ui/web/app/main");

        expect(render).toHaveBeenCalledOnce();
        const [mount, target] = vi.mocked(render).mock.calls[0];
        expect(target).toBe(root);
        mount();
        const props = vi.mocked(GraphicalApp).mock.calls[0][0];
        expect(props).not.toHaveProperty("initialRoute");
        expect(props.prepareBattle).toBeTypeOf("function");
        expect(props.engine.getGameState().characters).toEqual([]);
        expect(getSearch).not.toHaveBeenCalled();
    });
});
