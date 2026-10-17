import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";

vi.mock("solid-js/web", async (importOriginal) => ({
    ...await importOriginal<typeof import("solid-js/web")>(),
    render: vi.fn(),
}));
vi.mock("../../src/ui/web/app/GraphicalApp", () => ({ GraphicalApp: vi.fn(() => "title") }));
vi.mock("../../src/ui/web/posthog", () => ({ gameplayTelemetry: {} }));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.resetModules();
});

describe("graphical browser startup", () => {
    it("prepares fresh engines, party state and lifecycle listeners for each run", async () => {
        const addEventListener = vi.fn();
        const removeEventListener = vi.fn();
        vi.stubGlobal("document", { getElementById: () => ({}) });
        vi.stubGlobal("window", { addEventListener, removeEventListener });
        vi.stubGlobal("__KCQ_RELEASE_TAG__", "test");
        const content = await import("../../src/content");
        const localization = await import("../../localization");
        const create = vi.spyOn(content, "createEngine");
        const strings = vi.spyOn(localization, "getStringTable");
        await import("../../src/ui/web/app/main");
        expect(create).not.toHaveBeenCalled();
        expect(strings).toHaveBeenCalledTimes(1 + Object.keys(content.campaignCatalogs).length);
        expect(strings).toHaveBeenNthCalledWith(1, "en", ["ko", "matsuko", "hinari", "naruyo"]);

        Object.keys(content.campaignCatalogs).forEach((campaign, index) => {
            expect(strings).toHaveBeenNthCalledWith(index + 2, "en", undefined, campaign);
        });
        vi.mocked(render).mock.calls[0][0]();
        const props = vi.mocked(GraphicalApp).mock.calls[0][0];
        expect(props.release).toBe("test");
        expect(props.campaigns).toEqual(Object.keys(content.campaignCatalogs));
        const selection = props.composeCampaign("skunk", ["ko", "matsuko", "hinari"]);
        expect(create).toHaveBeenCalledExactlyOnceWith(["ko", "matsuko", "hinari"], "skunk");
        expect(strings).toHaveBeenLastCalledWith("en", ["ko", "matsuko", "hinari", "naruyo"], "skunk");
        expect(selection.engine.getGameState().characters).toEqual([]);
        expect(selection.engine.getLibrary().encounters).toHaveProperty("forest_3");
        expect(selection.presentation.encounter("forest_3")).not.toContain("[encounter.");
        const party = ["hinari", "ko", "matsuko"] as const;
        const first = props.prepareBattle("skunk", "forest_3", "mythic", party);
        first.engine.executeAction({ type: "endTurn" });
        const retry = props.prepareBattle("skunk", "forest_3", "mythic", party);
        expect(retry.engine).not.toBe(first.engine);
        expect(create).toHaveBeenNthCalledWith(2, party, "skunk");
        expect(create).toHaveBeenNthCalledWith(3, party, "skunk");
        expect(retry.engine.getGameState().turn).toMatchObject({ round: 1, outcome: "ongoing" });
        expect(retry.engine.getGameState().difficulty.id).toBe("mythic");
        expect(retry.engine.getGameState().characters.map((character: { id: string }) => character.id)).toEqual(party);
        expect(props).not.toHaveProperty("engine");
        expect(props.composeCampaign("skunk", ["ko", "matsuko", "hinari"]).engine.getGameState().characters).toEqual([]);
        expect(props.composeCampaign("skunk", ["hinari"]).engine.listCharacters()).toEqual(["hinari"]);
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
        expect(props).not.toHaveProperty("engine");
        expect(props.composeCampaign("skunk", ["ko", "matsuko", "hinari"]).engine.getGameState().characters).toEqual([]);
        expect(getSearch).not.toHaveBeenCalled();
    });
});
