// feeder-inventory.js
// Feeder stock and the re-order forecast, shared by the Feeders page and the
// feeding session.
//
// Two ways to feed, and they are not the same job:
//   live   — bought for the feeding, so there is nothing to keep in stock.
//            The useful forecast is what to buy for each feeding day.
//   frozen — bought in bulk and kept in the freezer. Stock counts down as the
//            snakes eat and the forecast says when to re-order.
//
// The feeding schedule is the source of truth: every active snake with a
// last-fed date and a feeder size gets one meal per feeding interval. A snake
// that is overdue is counted as needing food today, because that is the next
// possible meal.
//
// Storage:
//   feederSettings  — { mode, horizonDays, leadDays }
//   feederInventory — { "Small Rat": { onHand: 12, reorderAt: 4 }, ... }
//
// Feeder orders themselves are financeExpenses with category "Feeders"; the
// snapshot already carries that key, so money and stock do not need two logs.

(function () {
    const SETTINGS_KEY = "feederSettings";
    const INVENTORY_KEY = "feederInventory";
    const DAY_MS = 24 * 60 * 60 * 1000;

    const DEFAULT_FEEDER_SIZES = [
        "Rat Fuzzy",
        "Rat Pup",
        "Weaned Rat",
        "Small Rat",
        "Medium Rat",
        "Large Rat",
        "Mouse Fuzzy",
        "Mouse Hopper",
        "Adult Mouse"
    ];

    const MODES = {
        frozen: {
            id: "frozen",
            label: "Frozen",
            description: "Buy in bulk and keep a freezer count. The forecast counts down stock as snakes eat and tells you when to re-order."
        },
        live: {
            id: "live",
            label: "Live",
            description: "Live feeders do not keep, so there is no stock to count. The forecast lists how many to buy for each feeding day."
        }
    };

    const DEFAULT_SETTINGS = {
        mode: "frozen",
        horizonDays: 30,
        leadDays: 7
    };

    const INACTIVE_STATUSES = ["Sold", "Archived", "Deceased"];

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function parseDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));

        if (!match) {
            return null;
        }

        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function dateText(date) {
        if (!date) {
            return "";
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function addDays(date, days) {
        const next = new Date(date.getTime());

        next.setDate(next.getDate() + days);

        return next;
    }

    function todayText() {
        return dateText(new Date());
    }

    function daysBetween(fromValue, toValue) {
        const from = parseDate(fromValue);
        const to = parseDate(toValue);

        if (!from || !to) {
            return null;
        }

        return Math.round((to.getTime() - from.getTime()) / DAY_MS);
    }

    function readJson(key, fallback) {
        try {
            const raw = window.localStorage.getItem(key);

            if (raw === null) {
                return fallback;
            }

            const parsed = JSON.parse(raw);
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (error) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error(`Could not save ${key}.`, error);
        }
    }

    // ---- Settings ----------------------------------------------------------

    function normalizeSettings(value) {
        const stored = value && typeof value === "object" ? value : {};
        const horizon = Math.round(toNumber(stored.horizonDays));
        const lead = Math.round(toNumber(stored.leadDays));

        return {
            mode: stored.mode === "live" ? "live" : "frozen",
            horizonDays: horizon >= 1 && horizon <= 365 ? horizon : DEFAULT_SETTINGS.horizonDays,
            leadDays: lead >= 0 && lead <= 90 ? lead : DEFAULT_SETTINGS.leadDays
        };
    }

    function getSettings() {
        return normalizeSettings(readJson(SETTINGS_KEY, DEFAULT_SETTINGS));
    }

    function saveSettings(patch) {
        const next = normalizeSettings({
            ...getSettings(),
            ...(patch || {})
        });

        writeJson(SETTINGS_KEY, next);

        return next;
    }

    function getMode() {
        return getSettings().mode;
    }

    function isFrozen() {
        return getMode() === "frozen";
    }

    // ---- Frozen stock ------------------------------------------------------

    // Accepts either the stored object (keyed by size) or an array of rows so
    // the page and tests can hand in a plain list.
    function normalizeInventory(value) {
        const rows = [];

        if (Array.isArray(value)) {
            value.forEach(item => {
                if (typeof item === "string") {
                    rows.push({ size: item, onHand: 0, reorderAt: 0 });
                    return;
                }

                if (item && typeof item === "object") {
                    rows.push({
                        size: item.size,
                        onHand: item.onHand,
                        reorderAt: item.reorderAt
                    });
                }
            });
        } else if (value && typeof value === "object") {
            Object.keys(value).forEach(size => {
                const stored = value[size];
                const item = stored && typeof stored === "object" ? stored : { onHand: stored };

                rows.push({
                    size,
                    onHand: item.onHand,
                    reorderAt: item.reorderAt
                });
            });
        }

        const bySize = new Map();

        rows.forEach(row => {
            const size = text(row.size);

            if (!size) {
                return;
            }

            const key = size.toLowerCase();

            bySize.set(key, {
                size,
                onHand: Math.max(0, Math.round(toNumber(row.onHand))),
                reorderAt: Math.max(0, Math.round(toNumber(row.reorderAt)))
            });
        });

        return [...bySize.values()].sort((a, b) => a.size.localeCompare(b.size));
    }

    function getInventory() {
        return normalizeInventory(readJson(INVENTORY_KEY, {}));
    }

    function saveInventory(rows) {
        const payload = {};

        normalizeInventory(rows).forEach(row => {
            payload[row.size] = {
                onHand: row.onHand,
                reorderAt: row.reorderAt
            };
        });

        writeJson(INVENTORY_KEY, payload);

        return normalizeInventory(payload);
    }

    function findInventoryRow(inventory, size) {
        const clean = text(size).toLowerCase();

        if (!clean) {
            return null;
        }

        return (inventory || []).find(row => row.size.toLowerCase() === clean) || null;
    }

    function setStock(size, onHand, reorderAt) {
        const clean = text(size);

        if (!clean) {
            return getInventory();
        }

        const inventory = getInventory();
        const existing = findInventoryRow(inventory, clean);
        const nextRow = {
            size: existing ? existing.size : clean,
            onHand: Math.max(0, Math.round(toNumber(onHand))),
            reorderAt: Math.max(0, Math.round(toNumber(reorderAt)))
        };

        if (existing) {
            Object.assign(existing, nextRow);
        } else {
            inventory.push(nextRow);
        }

        return saveInventory(inventory);
    }

    // Adds (or removes, with a negative quantity) stock without touching the
    // keep-at-least line. Used by the order form and by feeding records.
    function addStock(size, quantity) {
        const clean = text(size);
        const amount = Math.round(toNumber(quantity));

        if (!clean || amount === 0) {
            return getInventory();
        }

        const inventory = getInventory();
        const existing = findInventoryRow(inventory, clean);

        if (existing) {
            existing.onHand = Math.max(0, existing.onHand + amount);
        } else {
            inventory.push({
                size: clean,
                onHand: Math.max(0, amount),
                reorderAt: 0
            });
        }

        return saveInventory(inventory);
    }

    // A meal came out of the freezer. Returns one boolean per item so callers
    // can remember which feeding records actually changed stock.
    function consumeFeeders(items) {
        const list = Array.isArray(items) ? items : [items];

        if (!isFrozen()) {
            return list.map(() => false);
        }

        const inventory = getInventory();
        const results = list.map(item => {
            const source = item && typeof item === "object" ? item : { size: item };
            const size = text(source.size);
            const quantity = Math.max(1, Math.round(toNumber(source.quantity) || 1));
            const row = findInventoryRow(inventory, size);

            if (!row) {
                return false;
            }

            row.onHand = Math.max(0, row.onHand - quantity);

            return true;
        });

        if (results.some(Boolean)) {
            saveInventory(inventory);
        }

        return results;
    }

    function consumeFeeder(size, quantity = 1) {
        return consumeFeeders([{ size, quantity }])[0];
    }

    // Undo a consumption (deleting a feeding record that had taken stock).
    function restoreFeeder(size, quantity = 1) {
        if (!isFrozen()) {
            return false;
        }

        const inventory = getInventory();
        const row = findInventoryRow(inventory, size);

        if (!row) {
            return false;
        }

        row.onHand = Math.max(0, row.onHand + Math.max(1, Math.round(toNumber(quantity) || 1)));
        saveInventory(inventory);

        return true;
    }

    function getTotalOnHand(inventory) {
        return normalizeInventory(inventory).reduce((sum, row) => sum + row.onHand, 0);
    }

    function collectSizes(snakes, inventory, includeDefaults = false) {
        const sizes = new Map();

        function add(size) {
            const clean = text(size);

            if (clean && !sizes.has(clean.toLowerCase())) {
                sizes.set(clean.toLowerCase(), clean);
            }
        }

        (includeDefaults ? DEFAULT_FEEDER_SIZES : []).forEach(add);
        normalizeInventory(inventory).forEach(row => add(row.size));
        (Array.isArray(snakes) ? snakes : []).forEach(snake => add(snake && snake.feederSize));

        return [...sizes.values()].sort((a, b) => a.localeCompare(b));
    }

    // ---- Schedule ----------------------------------------------------------

    function isInactiveSnake(snake) {
        if (!snake) {
            return false;
        }

        if (window.SnakeData && typeof window.SnakeData.isInactiveSnake === "function") {
            return window.SnakeData.isInactiveSnake(snake);
        }

        return INACTIVE_STATUSES.includes(text(snake.status));
    }

    function isOnFeedingHold(snake) {
        return Boolean(snake && snake.feedingHold && snake.feedingHold.reason);
    }

    function getFeedingInterval(snake) {
        if (typeof window.getFeedingInterval === "function") {
            return window.getFeedingInterval(snake);
        }

        const interval = parseInt(snake && snake.feedingIntervalDays, 10);

        return Number.isNaN(interval) || interval <= 0 ? 7 : interval;
    }

    function getSnakeLabel(snake) {
        return text(snake && snake.name)
            || text(snake && snake.ID)
            || text(snake && snake.morph)
            || "Unnamed snake";
    }

    function getSnakeIdentity(snake) {
        return text(snake && snake.ID) || text(snake && snake.morph) || "";
    }

    // Every meal that falls inside the window, one per snake per feeding
    // interval. The forecast is deliberately built from the schedule rather
    // than from past feeding history: what matters is who will need food.
    function buildFeedPlan(snakes, options) {
        const opts = options || {};
        const settings = normalizeSettings(opts.settings || getSettings());
        const today = parseDate(opts.today) ? dateText(parseDate(opts.today)) : todayText();
        const todayDate = parseDate(today);
        const horizonDays = settings.horizonDays;
        const endDate = addDays(todayDate, horizonDays);
        const events = [];
        const skipped = {
            inactive: 0,
            onHold: [],
            noFeederSize: [],
            noFeedingDate: []
        };

        (Array.isArray(snakes) ? snakes : []).forEach(snake => {
            if (!snake) {
                return;
            }

            const label = getSnakeLabel(snake);

            if (isInactiveSnake(snake)) {
                skipped.inactive += 1;
                return;
            }

            if (isOnFeedingHold(snake)) {
                skipped.onHold.push(label);
                return;
            }

            const size = text(snake.feederSize);

            if (!size) {
                skipped.noFeederSize.push(label);
                return;
            }

            const lastFed = parseDate(snake.lastFed);

            if (!lastFed) {
                skipped.noFeedingDate.push(label);
                return;
            }

            const interval = getFeedingInterval(snake);
            let due = addDays(lastFed, interval);

            // An overdue snake is counted from today: that is the next meal it
            // could actually eat, not a stack of meals in the past.
            if (due < todayDate) {
                due = todayDate;
            }

            while (due <= endDate) {
                events.push({
                    date: dateText(due),
                    size,
                    snakeId: text(snake.id),
                    snakeName: label,
                    snakeIdentity: getSnakeIdentity(snake)
                });
                due = addDays(due, interval);
            }
        });

        events.sort((a, b) =>
            a.date.localeCompare(b.date)
            || a.size.localeCompare(b.size)
            || a.snakeName.localeCompare(b.snakeName)
        );

        return {
            today,
            endDate: dateText(endDate),
            horizonDays,
            events,
            skipped
        };
    }

    // ---- Forecast ----------------------------------------------------------

    function summarizeSize(entry, mode, today, horizonDays, leadDays) {
        const byDateMap = new Map();

        entry.events.forEach(event => {
            if (!byDateMap.has(event.date)) {
                byDateMap.set(event.date, {
                    date: event.date,
                    count: 0,
                    snakes: []
                });
            }

            const day = byDateMap.get(event.date);

            day.count += 1;
            day.snakes.push(event.snakeName);
        });

        const byDate = [...byDateMap.values()].sort((a, b) => a.date.localeCompare(b.date));
        const next = byDate[0] || null;
        const need = entry.events.length;
        const onHand = entry.onHand;
        const keepAtLeast = entry.reorderAt;
        let status = "ok";
        let suggestedOrder = 0;
        let runsOutDate = "";
        let orderByDate = "";
        let orderNow = false;
        let daysUntilRunOut = null;
        let daysOfCover = null;

        if (mode === "live") {
            if (next) {
                // Live feeders are bought for a feeding, not stocked. The
                // useful number is the next day's order.
                suggestedOrder = next.count;
                orderByDate = next.date;
                orderNow = daysBetween(today, next.date) <= leadDays;
                status = orderNow ? "order" : "ok";
            }
        } else if (onHand !== null) {
            let remaining = onHand;

            if (remaining <= 0 && entry.events.length > 0) {
                runsOutDate = today;
            }

            entry.events.forEach(event => {
                if (runsOutDate) {
                    return;
                }

                remaining -= 1;

                if (remaining <= 0) {
                    runsOutDate = event.date;
                }
            });

            if (runsOutDate) {
                orderByDate = dateText(addDays(parseDate(runsOutDate), -leadDays));
                orderNow = orderByDate <= today;
                daysUntilRunOut = daysBetween(today, runsOutDate);
            }

            if (need > 0) {
                daysOfCover = Math.round((onHand / (need / horizonDays)) * 10) / 10;
            }

            const belowKeepAtLeast = onHand < keepAtLeast;

            if (need > 0 && (runsOutDate || belowKeepAtLeast)) {
                suggestedOrder = Math.max(0, need + keepAtLeast - onHand);
            }

            if (need === 0 && !belowKeepAtLeast) {
                status = "ok";
            } else if (onHand <= 0 && need > 0) {
                status = "order";
            } else if (runsOutDate && orderNow) {
                status = "order";
            } else if (runsOutDate || belowKeepAtLeast) {
                status = "watch";
            }
        }

        return {
            size: entry.size,
            onHand,
            keepAtLeast,
            events: entry.events,
            byDate,
            nextDate: next ? next.date : "",
            nextCount: next ? next.count : 0,
            need,
            daysOfCover,
            runsOutDate,
            daysUntilRunOut,
            orderByDate,
            orderNow,
            suggestedOrder,
            status
        };
    }

    function buildForecast(options) {
        const opts = options || {};
        const settings = normalizeSettings(opts.settings !== undefined ? opts.settings : getSettings());
        const inventory = normalizeInventory(opts.inventory !== undefined ? opts.inventory : getInventory());
        const plan = buildFeedPlan(opts.snakes || [], {
            settings,
            today: opts.today
        });
        const mode = settings.mode;
        const sizeIndex = new Map();

        inventory.forEach(row => {
            sizeIndex.set(row.size.toLowerCase(), {
                size: row.size,
                onHand: row.onHand,
                reorderAt: row.reorderAt,
                events: []
            });
        });

        plan.events.forEach(event => {
            const key = event.size.toLowerCase();
            let entry = sizeIndex.get(key);

            if (!entry) {
                entry = {
                    size: event.size,
                    onHand: mode === "frozen" ? 0 : null,
                    reorderAt: 0,
                    events: []
                };
                sizeIndex.set(key, entry);
            }

            entry.events.push(event);
        });

        const sizes = [...sizeIndex.values()]
            .map(entry => summarizeSize(entry, mode, plan.today, settings.horizonDays, settings.leadDays))
            .sort((a, b) => a.size.localeCompare(b.size));

        const orderSizes = sizes.filter(size => size.status === "order");
        const watchSizes = sizes.filter(size => size.status === "watch");

        return {
            mode,
            settings,
            today: plan.today,
            endDate: plan.endDate,
            horizonDays: settings.horizonDays,
            leadDays: settings.leadDays,
            sizes,
            events: plan.events,
            skipped: plan.skipped,
            totals: {
                feedings: plan.events.length,
                sizes: sizes.length,
                toOrder: orderSizes.length,
                watch: watchSizes.length,
                onHand: mode === "frozen" ? getTotalOnHand(inventory) : null
            }
        };
    }

    window.SnakeFeeders = {
        SETTINGS_KEY,
        INVENTORY_KEY,
        DEFAULT_SETTINGS,
        DEFAULT_FEEDER_SIZES,
        MODES,
        getSettings,
        saveSettings,
        getMode,
        isFrozen,
        getInventory,
        saveInventory,
        setStock,
        addStock,
        consumeFeeders,
        consumeFeeder,
        restoreFeeder,
        findInventoryRow,
        getTotalOnHand,
        collectSizes,
        buildFeedPlan,
        buildForecast,
        parseDate,
        dateText,
        addDays,
        daysBetween,
        todayText
    };
})();
