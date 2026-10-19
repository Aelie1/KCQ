// Run against Vite and a test Chrome instance with remote debugging enabled:
// node tests/ui/titleResize.browser.mjs http://127.0.0.1:5176 9334
// Creates and closes its own tab; does not change saves or preferences.
import assert from "node:assert/strict";

const appUrl = process.argv[2] ?? "http://127.0.0.1:5173";
const debugUrl = `http://127.0.0.1:${process.argv[3] ?? "9334"}`;

async function connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
    });
    return {
        send(method, params = {}) {
            return new Promise((resolve, reject) => {
                const id = ++sequence;
                pending.set(id, { resolve, reject });
                socket.send(JSON.stringify({ id, method, params }));
            });
        },
        close() { socket.close(); },
    };
}

const version = await (await fetch(`${debugUrl}/json/version`)).json();
const browser = await connect(version.webSocketDebuggerUrl);
const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
let page;
try {
    const targets = await (await fetch(`${debugUrl}/json/list`)).json();
    page = await connect(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
    const evaluate = async expression => {
        const result = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    };
    await page.send("Emulation.setDeviceMetricsOverride", {
        width: 2200, height: 900, deviceScaleFactor: 1.25, mobile: false,
    });
    await page.send("Page.navigate", { url: appUrl });
    const deadline = Date.now() + 15000;
    while (!await evaluate('!!document.querySelector(".kcq-title-screen__party")')) {
        assert.ok(Date.now() < deadline, "Title screen did not load");
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    await evaluate(`document.fonts.ready`);
    await evaluate(`(() => {
        const upper = document.querySelector(".kcq-title-screen__upper");
        // The bug concerns sizing the two existing section wrappers. Provide
        // a second wrapper even when the test browser has no saved battle.
        if (upper.children.length === 1) upper.prepend(upper.firstElementChild.cloneNode(true));
    })()`);
    const measure = () => evaluate(`(async () => {
        const { calculateResponsiveLayout, LAYOUT_WIDTHS } = await import("/src/ui/web/app/responsiveScale.ts");
        const shell = document.querySelector(".kcq-app");
        const upper = document.querySelector(".kcq-title-screen__upper");
        const parts = [...upper.children].map(element => element.getBoundingClientRect());
        const footer = document.querySelector(".kcq-screen-layout__footer").getBoundingClientRect();
        const body = document.querySelector(".kcq-screen-layout__body");
        const zoom = Number(shell.style.getPropertyValue("--kcq-ui-zoom"));
        const padding = getComputedStyle(shell);
        const horizontalPadding = parseFloat(padding.paddingLeft) + parseFloat(padding.paddingRight);
        const expected = calculateResponsiveLayout(shell.clientWidth - horizontalPadding);
        return {
            expectedLayout: expected.size, expectedZoom: expected.zoom,
            layout: shell.dataset.kcqLayout, zoom,
            appliedZoom: Number(getComputedStyle(document.querySelector(".kcq-graphical-app__background")).zoom),
            columns: Math.abs(parts[0].y - parts[1].y) < 1 ? 2 : 1,
            widths: parts.map(part => part.width / zoom),
            footerFits: footer.bottom <= innerHeight && body.clientHeight > 0,
            // Below the canonical canvas width, the shell intentionally scrolls.
            overflow: shell.scrollWidth > Math.max(shell.clientWidth, LAYOUT_WIDTHS[expected.columns] * zoom + horizontalPadding) + 1
                || body.scrollWidth > body.clientWidth,
        };
    })()`);
    const breakpoints = await evaluate(`(async () => {
        const { AUTO_MEDIUM_BREAKPOINT, AUTO_WIDE_BREAKPOINT } = await import("/src/ui/web/app/responsiveScale.ts");
        return [AUTO_MEDIUM_BREAKPOINT, AUTO_WIDE_BREAKPOINT];
    })()`);
    const widths = [375, 600, ...breakpoints.flatMap(width => [width - 1, width, width + 1]), 950, 1024, 1280, 1600, 1920]
        .flatMap(width => [0, .2, .4, .6, .8].map(fraction => width + fraction));
    for (const width of [...widths, ...widths.toReversed()]) {
        await evaluate(`document.getElementById("root").style.width = ${JSON.stringify(`${width}px`)}`);
        // Let native ResizeObserver/resize delivery run; manually dispatching
        // resize would hide timing and fractional-width failures.
        await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        const result = await measure();
        assert.equal(result.layout, result.expectedLayout, "Layout differs from the scaler");
        assert.equal(result.zoom, result.expectedZoom, "Zoom differs from the scaler");
        assert.equal(result.columns, result.layout === "narrow" ? 1 : 2,
            `Unexpected row wrapping at ${width}px: ${JSON.stringify(result)}`);
        assert.ok(result.widths.every(value => value <= 366.1), "A panel stretched");
        assert.ok(Math.abs(result.appliedZoom - result.zoom) < .00001, "Title enlargement differs from the scaler");
        assert.ok(result.footerFits && !result.overflow, `Overflow beyond the canonical canvas at ${width}px: ${JSON.stringify(result)}`);
    }
    const heldWidths = [...breakpoints.flatMap(width => [width - .4, width + .6]), 950.6, 1280.6];
    for (const width of heldWidths) {
        await evaluate(`document.getElementById("root").style.width = "${width}px"`);
        await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        const settled = await measure();
        for (let frame = 0; frame < 40; frame++) {
            await evaluate("new Promise(requestAnimationFrame)");
            assert.deepEqual(await measure(), settled, `Layout oscillated while held at ${width}px`);
        }
    }
    await evaluate(`document.querySelector(".kcq-title-screen__upper").firstElementChild.remove()`);
    assert.ok(await evaluate(`(() => {
        const upper = document.querySelector(".kcq-title-screen__upper").getBoundingClientRect();
        const party = document.querySelector(".kcq-title-screen__upper").firstElementChild.getBoundingClientRect();
        return Math.abs((upper.left + upper.right) / 2 - (party.left + party.right) / 2) < 1;
    })()`), "Party did not center without a resume section");
    // A controls wrapper can be narrower than its buttons without clipping them.
    // Protect the usable button bounds and hit targets in the rendered header.
    await evaluate('document.getElementById("root").style.width = ""');
    await evaluate('document.querySelector(".kcq-title-screen__campaign").click()');
    for (const width of [390, 1024, 1920]) {
        await page.send("Emulation.setDeviceMetricsOverride", {
            width, height: 900, deviceScaleFactor: 1.25, mobile: false,
        });
        await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
        const actions = await evaluate(`(() => {
            const header = document.querySelector(".kcq-encounter-header");
            const bounds = header.getBoundingClientRect();
            return [...header.querySelectorAll(".kcq-header-controls > button")].map(button => {
                const rect = button.getBoundingClientRect();
                button.focus();
                return {
                    label: button.getAttribute("aria-label"),
                    focusable: !button.disabled && document.activeElement === button,
                    contained: rect.width > 0 && rect.height > 0
                        && rect.left >= bounds.left && rect.right <= bounds.right
                        && rect.top >= bounds.top && rect.bottom <= bounds.bottom,
                    hittable: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
                };
            });
        })()`);
        assert.equal(actions.length, 2, "Missing header actions");
        assert.ok(actions.every(action => action.label && action.focusable && action.contained && action.hittable),
            `Inaccessible header action at ${width}px: ${JSON.stringify(actions)}`);
    }
    console.log(`Title resize browser regression passed: ${widths.length * 2} resize steps, ${heldWidths.length * 40} held frames, and header actions at three viewport sizes.`);
} finally {
    page?.close();
    await browser.send("Target.closeTarget", { targetId });
    browser.close();
}
