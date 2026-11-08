const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");

function flush() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function fakeButton() {
    const classes = new Set();

    return {
        hidden: false,
        textContent: "",
        title: "",
        dataset: {},
        attrs: {},
        listeners: {},
        classList: {
            contains: name => classes.has(name),
            toggle(name, force) {
                const next = force === undefined ? !classes.has(name) : Boolean(force);

                if (next) {
                    classes.add(name);
                } else {
                    classes.delete(name);
                }

                return next;
            }
        },
        setAttribute(name, value) {
            this.attrs[name] = String(value);
        },
        addEventListener(type, handler) {
            (this.listeners[type] = this.listeners[type] || []).push(handler);
        },
        click() {
            (this.listeners.click || []).forEach(handler => handler());
            return flush();
        }
    };
}

function createEnv({ supported = true, visible = true, preference = null, refuse = false } = {}) {
    const store = new Map();
    const documentHandlers = {};
    const windowHandlers = {};
    const requests = [];
    const sentinels = [];
    const document = {
        readyState: "complete",
        visibilityState: visible ? "visible" : "hidden",
        querySelectorAll: () => [],
        addEventListener: (type, handler) => {
            (documentHandlers[type] = documentHandlers[type] || []).push(handler);
        }
    };
    const context = {
        console,
        document,
        setTimeout,
        localStorage: {
            getItem: key => (store.has(key) ? store.get(key) : null),
            setItem: (key, value) => store.set(key, String(value)),
            removeItem: key => store.delete(key)
        },
        navigator: {}
    };

    if (preference !== null) {
        store.set("keepScreenOn", preference);
    }

    context.window = context;
    context.addEventListener = (type, handler) => {
        (windowHandlers[type] = windowHandlers[type] || []).push(handler);
    };

    function makeSentinel(type) {
        return {
            type,
            released: false,
            listeners: [],
            addEventListener(event, handler) {
                if (event === "release") {
                    this.listeners.push(handler);
                }
            },
            async release() {
                this.released = true;
                this.listeners.forEach(handler => handler());
            }
        };
    }

    if (supported) {
        context.navigator.wakeLock = {
            request: async type => {
                requests.push(type);

                if (refuse) {
                    throw new Error("NotAllowedError");
                }

                const sentinel = makeSentinel(type);

                sentinels.push(sentinel);

                return sentinel;
            }
        };
    }

    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(projectRoot, "wake-lock.js"), "utf8"),
        context,
        { filename: "wake-lock.js" }
    );

    return {
        api: context.SnakeWakeLock,
        context,
        document,
        documentHandlers,
        windowHandlers,
        requests,
        sentinels,
        store,
        allow() {
            context.navigator.wakeLock.request = async type => {
                requests.push(type);

                const sentinel = makeSentinel(type);

                sentinels.push(sentinel);

                return sentinel;
            };
        }
    };
}

test("the lock is taken as soon as the control is bound, and switches off and on", async () => {
    const env = createEnv();
    const button = fakeButton();

    assert.equal(env.api.isSupported(), true);
    env.api.bindControl(button);
    await flush();

    assert.deepEqual(env.requests, ["screen"]);
    assert.equal(env.api.isHeld(), true);
    assert.equal(button.hidden, false);
    assert.equal(button.textContent, "Screen stays on");
    assert.equal(button.attrs["aria-pressed"], "true");
    assert.match(button.title, /stays awake/);

    await button.click();

    assert.equal(env.sentinels[0].released, true);
    assert.equal(env.api.isHeld(), false);
    assert.equal(env.store.get("keepScreenOn"), "0");
    assert.equal(button.textContent, "Screen can sleep");
    assert.equal(button.attrs["aria-pressed"], "false");

    await button.click();

    assert.equal(env.requests.length, 2);
    assert.equal(env.api.isHeld(), true);
    assert.equal(env.store.get("keepScreenOn"), "1");
    assert.equal(button.textContent, "Screen stays on");
});

test("a remembered preference of off keeps the screen free until it is turned on", async () => {
    const env = createEnv({ preference: "0" });
    const button = fakeButton();

    env.api.bindControl(button);
    await flush();

    assert.equal(env.requests.length, 0);
    assert.equal(button.textContent, "Screen can sleep");
    assert.equal(button.attrs["aria-pressed"], "false");

    await button.click();

    assert.deepEqual(env.requests, ["screen"]);
    assert.equal(env.store.get("keepScreenOn"), "1");
    assert.equal(button.textContent, "Screen stays on");
});

test("a hidden tab holds no lock and takes it back when it is shown again", async () => {
    const env = createEnv({ visible: false });
    const button = fakeButton();

    env.api.bindControl(button);
    await flush();

    assert.equal(env.requests.length, 0);
    assert.equal(env.api.isHeld(), false);

    env.document.visibilityState = "visible";
    env.documentHandlers.visibilitychange.forEach(handler => handler());
    await flush();

    assert.deepEqual(env.requests, ["screen"]);
    assert.equal(env.api.isHeld(), true);
});

test("a refused lock leaves the page usable and the next tap retries it", async () => {
    const env = createEnv({ refuse: true });
    const button = fakeButton();

    env.api.bindControl(button);
    await flush();

    assert.equal(env.api.isHeld(), false);
    assert.equal(env.api.isEnabled(), true);
    assert.equal(button.textContent, "Tap to keep screen on");
    assert.match(button.title, /refused/i);
    assert.equal(button.classList.contains("is-warning"), true);

    env.allow();
    await button.click();

    assert.equal(env.api.isHeld(), true);
    assert.equal(button.textContent, "Screen stays on");
    assert.equal(button.attrs["aria-pressed"], "true");
    assert.equal(button.classList.contains("is-warning"), false);
});

test("a browser without the wake lock API hides the control instead of breaking", async () => {
    const env = createEnv({ supported: false });
    const button = fakeButton();

    assert.equal(env.api.isSupported(), false);
    env.api.bindControl(button);
    await flush();

    assert.equal(button.hidden, true);
    assert.equal(env.api.isHeld(), false);
    assert.equal(env.requests.length, 0);
    assert.equal(env.store.has("keepScreenOn"), false);
});

test("a lock released by the browser clears the held state", async () => {
    const env = createEnv();
    const button = fakeButton();

    env.api.bindControl(button);
    await flush();

    // The tab was hidden, battery saver kicked in: the browser lets go.
    await env.sentinels[0].release();

    assert.equal(env.api.isHeld(), false);
    assert.equal(button.textContent, "Keeping screen on…");
    // The keeper's choice is remembered, so the page tries again later.
    assert.equal(env.store.get("keepScreenOn"), undefined);
    assert.equal(env.api.isEnabled(), true);
});

test("two requests at once still take only one lock", async () => {
    const env = createEnv();
    const both = await Promise.all([env.api.acquire(), env.api.acquire()]);

    assert.deepEqual(env.requests, ["screen"]);
    assert.equal(env.api.isHeld(), true);
    assert.deepEqual(Array.from(both, value => typeof value), ["boolean", "boolean"]);
});
