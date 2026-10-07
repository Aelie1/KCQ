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
    it("prepares fresh engines, party state and lifecycle listeners for each run", async () => {
        const addEventListener = vi.fn();
        const removeEventListener = vi.fn();
        vi.stubGlobal("document", { getElementById: () => ({}) });
        vi.stubGlobal("window", { addEventListener, removeEventListener });
        vi.stubGlobal("__KCQ_RELEASE_TAG__", "test");
        await import("../../src/ui/web/app/main");
        vi.mocked(render).mock.calls[0][0]();
        const props = vi.mocked(GraphicalApp).mock.calls[0][0];
        const first = props.prepareBattle("forest_3", "mythic");
        first.engine.executeAction({ type: "endTurn" });
        const retry = props.prepareBattle("forest_3", "mythic");
        expect(retry.engine).not.toBe(first.engine);
        expect(retry.engine.getGameState().turn).toMatchObject({ round: 1, outcome: "ongoing" });
        expect(retry.engine.getGameState().difficulty.id).toBe("mythic");
        expect(retry.engine.getGameState().characters).toHaveLength(3);
        expect(props.engine.getGameState().characters).toEqual([]);
        expect(addEventListener).toHaveBeenCalledTimes(2);
        first.dispose();
        retry.dispose();
        expect(removeEventListener).toHaveBeenCalledTimes(2);
    });

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
