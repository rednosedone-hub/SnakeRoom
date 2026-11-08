// wake-lock.js
// Keeps the screen awake while both hands are busy: feeding day, the weight
// sheet and the scan session.
//
// A feeding session is a keeper holding a snake and a pair of tongs, not a
// person touching the screen every thirty seconds. Left alone, the phone dims
// and locks in the middle of the job. The Screen Wake Lock API stops that, so
// the control below is on by default and the choice is remembered across
// pages: turning it off once is enough.
//
// The lock is dropped by the browser whenever the tab is hidden, so it is
// retaken when the page comes back. Some browsers also refuse a request made
// before the page has been touched; the first tap retries it.

(function () {
    const PREFERENCE_KEY = "keepScreenOn";

    const buttons = [];
    let sentinel = null;
    let requesting = false;
    let lastError = "";

    function readPreference() {
        try {
            return window.localStorage.getItem(PREFERENCE_KEY) !== "0";
        } catch (error) {
            // Private mode: keep the useful default instead of failing.
            return true;
        }
    }

    function writePreference(value) {
        try {
            window.localStorage.setItem(PREFERENCE_KEY, value ? "1" : "0");
        } catch (error) {
            // Nothing to save to; the page still works for this visit.
        }
    }

    let wanted = readPreference();

    function isSupported() {
        return typeof navigator !== "undefined"
            && Boolean(navigator.wakeLock)
            && typeof navigator.wakeLock.request === "function";
    }

    function isHeld() {
        return Boolean(sentinel);
    }

    function isEnabled() {
        return wanted;
    }

    function isVisible() {
        return typeof document === "undefined" || document.visibilityState !== "hidden";
    }

    async function acquire() {
        if (!wanted || !isSupported() || sentinel || !isVisible()) {
            return isHeld();
        }

        // A tap fires pointerdown and click, and the lock request is async:
        // without this guard both would ask for a lock and one would be orphaned.
        if (requesting) {
            return false;
        }

        requesting = true;

        try {
            const lock = await navigator.wakeLock.request("screen");

            sentinel = lock;
            lastError = "";

            if (lock && typeof lock.addEventListener === "function") {
                // The browser releases the lock itself (tab hidden, battery
                // saver). Keep the control honest about that.
                lock.addEventListener("release", () => {
                    if (sentinel === lock) {
                        sentinel = null;
                    }

                    refreshControls();
                });
            }

            refreshControls();

            return true;
        } catch (error) {
            sentinel = null;
            lastError = error && error.message ? error.message : "Wake lock refused.";
            refreshControls();

            return false;
        } finally {
            requesting = false;
        }
    }

    async function release() {
        const lock = sentinel;

        sentinel = null;

        if (lock && typeof lock.release === "function") {
            try {
                await lock.release();
            } catch (error) {
                // Already gone, which is the outcome we wanted.
            }
        }

        refreshControls();
    }

    async function setEnabled(value) {
        wanted = Boolean(value);
        writePreference(wanted);

        if (wanted) {
            await acquire();
        } else {
            await release();
        }

        refreshControls();
    }

    function toggle() {
        // A request that was blocked (or dropped by the browser) is retried on
        // the next tap instead of turning the preference off.
        if (wanted && !sentinel) {
            return acquire().then(refreshControls);
        }

        return setEnabled(!wanted);
    }

    function describe() {
        return {
            supported: isSupported(),
            wanted,
            held: isHeld(),
            error: lastError
        };
    }

    function controlLabel() {
        if (!wanted) {
            return "Screen can sleep";
        }

        if (sentinel) {
            return "Screen stays on";
        }

        return lastError ? "Tap to keep screen on" : "Keeping screen on…";
    }

    function controlTitle() {
        if (!wanted) {
            return "The screen can dim while your hands are busy. Tap to keep it awake.";
        }

        if (!sentinel) {
            return lastError
                ? `The browser refused to keep the screen on (${lastError}). Tap to try again.`
                : "Tap to finish keeping the screen awake.";
        }

        return "The screen stays awake while you work. Tap to let it sleep again.";
    }

    function refreshControls() {
        const held = Boolean(wanted && sentinel);
        // A refusal is worth flagging on the control itself: the keeper needs
        // to know the screen may still dim, not a console message.
        const warning = Boolean(wanted && !sentinel && lastError);

        buttons.forEach(button => {
            button.textContent = controlLabel();
            button.setAttribute("aria-pressed", String(held));
            button.title = controlTitle();
            button.classList.toggle("is-warning", warning);
        });
    }

    function bindControl(button) {
        if (!button || buttons.indexOf(button) !== -1) {
            return;
        }

        if (!isSupported()) {
            button.hidden = true;

            return;
        }

        buttons.push(button);
        button.hidden = false;
        button.addEventListener("click", toggle);

        refreshControls();
        // Try straight away. Browsers that want a gesture will refuse and the
        // first tap retries it.
        acquire();
    }

    function bindAll() {
        if (typeof document === "undefined") {
            return;
        }

        Array.from(document.querySelectorAll("[data-keep-screen]")).forEach(bindControl);
    }

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", bindAll);
        } else {
            bindAll();
        }

        // The browser drops the lock while the tab is hidden.
        document.addEventListener("visibilitychange", () => {
            if (wanted && isVisible()) {
                acquire();
            }
        });

        // One tap anywhere is enough to retry a lock the browser would not give
        // before the page had been touched.
        document.addEventListener("pointerdown", () => {
            if (wanted && !sentinel) {
                acquire();
            }
        }, { passive: true });
    }

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("pageshow", () => {
            if (wanted) {
                acquire();
            }
        });
    }

    window.SnakeWakeLock = {
        PREFERENCE_KEY,
        isSupported,
        isHeld,
        isEnabled,
        describe,
        acquire,
        release,
        setEnabled,
        toggle,
        bindControl
    };
})();
