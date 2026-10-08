import { createComponent } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { getStringTable } from "../../localization";
import { Presentation } from "../../src/ui/presentation/presentation";
import { GraphicalApp } from "../../src/ui/web/app/GraphicalApp";
import { TitleScreen } from "../../src/ui/web/app/components/TitleScreen";
import { createTitleViewModel } from "../../src/ui/web/app/viewModels/title";

const presentation = new Presentation(getStringTable("en"));

describe("title and campaign presentation", () => {
    it("resolves campaign name and description independently from base localization", () => {
        const strings = getStringTable("en");
        expect(presentation.campaign("skunk")).toBe(strings["campaign.skunk.name"]);
        expect(presentation.campaign("skunk", "name")).toBe(strings["campaign.skunk.name"]);
        expect(presentation.campaign("skunk", "desc")).toBe(strings["campaign.skunk.desc"]);
        expect(presentation.campaign("skunk", "desc")).not.toBe(presentation.campaign("skunk"));
        expect(presentation.ui("title.campaigns")).toBe("Campaigns");
    });

    it("initially presents all title strings and the supplied release without composing a campaign", () => {
        const composeCampaign = vi.fn(() => { throw new Error("Premature campaign composition"); });
        const prepareBattle = vi.fn(() => { throw new Error("Premature battle preparation"); });
        const html = renderToString(() => createComponent(GraphicalApp, {
            campaigns: ["skunk"], release: "v0.8-test", presentation, composeCampaign, prepareBattle,
        }));
        for (const text of [presentation.ui("title.name"), presentation.ui("title.campaigns"),
            presentation.campaign("skunk"), presentation.campaign("skunk", "desc"),
            presentation.ui("version.name", { version: "v0.8-test" }),
            presentation.ui("title.credit"), presentation.ui("title.copyright")]) {
            expect(html).toContain(text);
        }
        expect(html).toContain("kcq-title-screen");
        expect(html).not.toContain("kcq-encounter-picker");
        expect(composeCampaign).not.toHaveBeenCalled();
        expect(prepareBattle).not.toHaveBeenCalled();
    });

    it("renders every supplied campaign entry with presented strings, including an empty menu", () => {
        const model = createTitleViewModel(["skunk", "skunk"], new Presentation({
            ...getStringTable("en"), "campaign.skunk.name": "Test campaign", "campaign.skunk.desc": "Test description",
        }), "release");
        const html = renderToString(() => createComponent(TitleScreen, { model, onSelect: vi.fn(), onSettings: vi.fn() }));
        expect(html.match(/Test campaign/g)).toHaveLength(2);
        expect(html.match(/Test description/g)).toHaveLength(2);
        expect(createTitleViewModel([], presentation, "release").campaigns).toEqual([]);
    });
});
