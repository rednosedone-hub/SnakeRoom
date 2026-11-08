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

    // A feeder order is not a same-day errand: the keeper has to agree a
    // collection time with the supplier, so three days is the floor even if a
    // shorter number was saved before this rule existed.
    const MIN_LEAD_DAYS = 3;

    const INACTIVE_STATUSES = ["Sold", "Archived", "Deceased"];

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    // ---- Feeder kind -------------------------------------------------------
    //
    // A feeder size can carry a marker so one collection can feed both ways:
    //   "Small Rat F/T"      — out of the freezer, even when live is the default
    //   "Small Rat (live)"   — bought fresh, even when frozen is the default
    // The marker is not part of the item's name. Stock and the forecast key off
    // the base size, so "Small Rat F/T" draws down the "Small Rat" freezer
    // count and a live "Small Rat" meal never does.
    const FROZEN_MARKER = /(?:\(|\[)?\s*\b(f\s*\/\s*t|ft|fzn|frozen(?:\s*\/\s*thawed)?|thawed|defrosted)\b\s*(?:\)|\])?/gi;
    const LIVE_MARKER = /(?:\(|\[)?\s*\blive\b\s*(?:\)|\])?/gi;

    function parseFeederSize(value) {
        const raw = text(value);

        if (!raw) {
            return { raw: "", base: "", kind: "", frozen: false };
        }

        const withoutFrozen = raw.replace(FROZEN_MARKER, " ");
        const withoutLive = withoutFrozen.replace(LIVE_MARKER, " ");
        const hasFrozen = withoutFrozen !== raw;
        const hasLive = withoutLive !== withoutFrozen;
        const base = withoutLive.replace(/\s+/g, " ").trim();

        return {
            raw,
            base: base || raw,
            kind: hasFrozen ? "frozen" : (hasLive ? "live" : ""),
            frozen: hasFrozen
        };
    }

    // Replace a snake's feeder size while keeping the way it is fed. "Use
    // Suggested" should not quietly turn a freezer-fed snake into a live one.
    function withFeederMarker(reference, size) {
        const next = text(size);
        const current = parseFeederSize(reference);

        if (!next || !current.kind || parseFeederSize(next).kind) {
            return next;
        }

        return current.kind === "frozen" ? `${next} (F/T)` : `${next} (live)`;
    }

    // How one meal is fed: the marker on the size wins, otherwise the
    // collection's default mode decides.
    function getFeederKind(value) {
        return parseFeederSize(value).kind || getMode();
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
            leadDays: lead >= 0 && lead <= 90
                ? Math.max(MIN_LEAD_DAYS, lead)
                : DEFAULT_SETTINGS.leadDays
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
            // "Small Rat F/T" and "Small Rat" are the same thing in the freezer,
            // so one stock row is kept for both.
            const size = parseFeederSize(row.size).base;

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
        const clean = parseFeederSize(size).base.toLowerCase();

        if (!clean) {
            return null;
        }

        return (inventory || []).find(row =>
            parseFeederSize(row.size).base.toLowerCase() === clean
        ) || null;
    }

    function setStock(size, onHand, reorderAt) {
        const clean = parseFeederSize(size).base;

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
        const clean = parseFeederSize(size).base;
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

    // Whether one meal should come out of the freezer. An explicit flag on the
    // item wins, then the feeder marker, then the collection's default mode.
    function usesFreezerStock(source) {
        if (source && typeof source === "object" && typeof source.frozen === "boolean") {
            return source.frozen;
        }

        const size = source && typeof source === "object" ? source.size : source;
        const kind = parseFeederSize(size).kind;

        if (kind === "frozen") {
            return true;
        }

        if (kind === "live") {
            return false;
        }

        return isFrozen();
    }

    // A meal came out of the freezer. Returns one boolean per item so callers
    // can remember which feeding records actually changed stock.
    function consumeFeeders(items) {
        const list = Array.isArray(items) ? items : [items];
        const inventory = getInventory();
        const results = list.map(item => {
            const source = item && typeof item === "object" ? item : { size: item };
            const size = text(source.size);
            const quantity = Math.max(1, Math.round(toNumber(source.quantity) || 1));

            if (!size || !usesFreezerStock(source)) {
                return false;
            }

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
        if (!usesFreezerStock({ size })) {
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
        // The marker is how the snake is fed, not a separate size to order.
        (Array.isArray(snakes) ? snakes : []).forEach(snake =>
            add(parseFeederSize(snake && snake.feederSize).base)
        );

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
        // "Next 14 days" means today plus the following 13 days, not 15
        // calendar dates. Counting the final day twice is what made a
        // two-week schedule look like more meals than snakes.
        const endDate = addDays(todayDate, Math.max(0, horizonDays - 1));
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

            const feeder = parseFeederSize(snake.feederSize);

            if (!feeder.base) {
                skipped.noFeederSize.push(label);
                return;
            }

            const lastFed = parseDate(snake.lastFed);

            if (!lastFed) {
                skipped.noFeedingDate.push(label);
                return;
            }

            // A snoozed feeding starts the schedule from the day it was
            // skipped, so the plan buys for the next slot instead of a meal the
            // keeper has already decided not to offer.
            const snoozedOn = parseDate(text(snake.feedingSnoozedOn).slice(0, 10));
            const anchor = snoozedOn && snoozedOn > lastFed ? snoozedOn : lastFed;
            const interval = getFeedingInterval(snake);
            let due = addDays(anchor, interval);

            // An overdue snake is counted from today: that is the next meal it
            // could actually eat, not a stack of meals in the past.
            if (due < todayDate) {
                due = todayDate;
            }

            while (due <= endDate) {
                events.push({
                    date: dateText(due),
                    size: feeder.base,
                    kind: feeder.kind || settings.mode,
                    feederSize: feeder.raw,
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
            || a.kind.localeCompare(b.kind)
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
            kind: entry.kind || mode,
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

        // Live and frozen meals of the same size are two different jobs: one is
        // bought for a feeding day, the other counts down the freezer. They get
        // their own forecast line so neither hides behind the other.
        function lineKey(size, kind) {
            return `${kind}|${text(size).toLowerCase()}`;
        }

        function createLine(size, kind, onHand, reorderAt) {
            const line = { size, kind, onHand, reorderAt, events: [] };

            sizeIndex.set(lineKey(size, kind), line);

            return line;
        }

        plan.events.forEach(event => {
            const kind = event.kind === "live" ? "live" : "frozen";
            let entry = sizeIndex.get(lineKey(event.size, kind));

            if (!entry) {
                const stockRow = findInventoryRow(inventory, event.size);

                // An unstocked freezer-fed size is a size to order, not a size
                // with an unknown count.
                entry = kind === "frozen"
                    ? createLine(event.size, kind, 0, 0)
                    : createLine(event.size, kind, stockRow ? stockRow.onHand : null, 0);
            }

            entry.events.push(event);
        });

        // Stock belongs to the frozen line for that size. A row nothing eats in
        // this window only gets a line of its own in frozen mode, where the
        // freezer count is the whole point of the forecast.
        inventory.forEach(row => {
            const entry = sizeIndex.get(lineKey(row.size, "frozen"));

            if (entry) {
                entry.onHand = row.onHand;
                entry.reorderAt = row.reorderAt;
            } else if (mode === "frozen") {
                createLine(row.size, "frozen", row.onHand, row.reorderAt);
            }
        });

        const sizes = [...sizeIndex.values()]
            .map(entry => summarizeSize(entry, entry.kind, plan.today, settings.horizonDays, settings.leadDays))
            .sort((a, b) => a.size.localeCompare(b.size)
                || (a.kind === b.kind ? 0 : a.kind === "live" ? -1 : 1));

        const orderSizes = sizes.filter(size => size.status === "order");
        const watchSizes = sizes.filter(size => size.status === "watch");
        const scheduledSnakes = new Set(plan.events.map(event => event.snakeId || event.snakeName));

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
                snakes: scheduledSnakes.size,
                sizes: sizes.length,
                toOrder: orderSizes.length,
                watch: watchSizes.length,
                onHand: getTotalOnHand(inventory),
                frozenFeedings: plan.events.filter(event => event.kind !== "live").length,
                liveFeedings: plan.events.filter(event => event.kind === "live").length
            }
        };
    }

    // One supplier run instead of several. Anything whose re-order window falls
    // inside the next week is gathered into a single order, because ordering
    // twice in seven days only makes sense if you breed your own feeders.
    function buildWeeklyOrder(options) {
        const opts = options || {};
        const forecast = opts.forecast;
        const days = Math.max(1, Math.min(31, parseInt(opts.days, 10) || 7));
        const empty = { days, endDate: "", today: "", mode: "", lines: [], sizes: 0, totalQuantity: 0, overdue: 0 };

        if (!forecast || !Array.isArray(forecast.sizes)) {
            return empty;
        }

        const today = forecast.today || todayText();
        const endDate = dateText(addDays(parseDate(today), days - 1));

        // Live feeders are bought per feeding day, so the quantity is every
        // meal inside the week, not just the next day's suggested number.
        const liveQuantities = new Map();

        (forecast.events || []).forEach(event => {
            if (event.kind === "live" && event.date <= endDate) {
                const key = text(event.size).toLowerCase();

                liveQuantities.set(key, (liveQuantities.get(key) || 0) + 1);
            }
        });

        const quantityFor = size => (size.kind === "live"
            ? liveQuantities.get(text(size.size).toLowerCase()) || 0
            : size.suggestedOrder);

        const lines = forecast.sizes
            .filter(size => quantityFor(size) > 0)
            .filter(size => {
                if (size.status === "order") {
                    return true;
                }

                // Live feeders are bought for a feeding day, not stocked, so
                // the feeding date is the only deadline that matters.
                if (size.kind === "live") {
                    return Boolean(size.nextDate && size.nextDate <= endDate);
                }

                if (size.orderByDate) {
                    return size.orderByDate <= endDate;
                }

                // Nothing is scheduled, but the freezer is below its buffer.
                return size.suggestedOrder > 0;
            })
            .map(size => {
                // When stock runs out is the only hard date: a pickup can happen
                // on any day before it, which is what two busy schedules need.
                const collectBy = size.kind === "live"
                    ? (size.nextDate || "")
                    : (size.runsOutDate || "");

                return {
                    size: size.size,
                    kind: size.kind,
                    quantity: quantityFor(size),
                    status: size.status,
                    nextDate: size.nextDate,
                    collectBy,
                    collectSlackDays: collectBy ? daysBetween(today, collectBy) : null,
                    neededBy: size.kind === "live"
                        ? (size.nextDate || today)
                        : (size.orderByDate || size.nextDate || today)
                };
            })
            .sort((left, right) =>
                String(left.neededBy).localeCompare(String(right.neededBy))
                || left.size.localeCompare(right.size)
            );

        return {
            days,
            today,
            endDate,
            mode: forecast.mode,
            lines,
            sizes: lines.length,
            totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
            overdue: lines.filter(line => line.status === "order").length
        };
    }

    // A plain-text version of the weekly order, for keepers who order by text
    // message rather than through a website. It is the whole week in one short
    // message: what to send, how many, and nothing that needs explaining.
    function formatWeeklyOrderText(order, options) {
        if (!order || !Array.isArray(order.lines) || order.lines.length === 0) {
            return "";
        }

        const opts = options || {};
        const supplier = String(opts.supplier || "").trim();
        // Formatted by the caller so the message uses the app's currency.
        const costText = String(opts.costText || "").trim();
        // The last day the feeders are still useful, if the caller can format
        // it: a pickup can slide up to this date without a schedule change.
        // Once stock is already gone there is no window to offer, only urgency.
        const collectByText = String(opts.collectByText || "").trim();
        const lines = order.lines.map(line =>
            `${line.quantity} x ${line.kind === "live" ? `${line.size} (live)` : line.size}`
        );
        const total = `Total: ${order.totalQuantity} feeder${order.totalQuantity === 1 ? "" : "s"}`
            + (costText ? ` (about ${costText})` : "");
        const pickup = collectByText
            ? `Can collect any day up to ${collectByText}.`
            : opts.urgentPickup ? "Need these as soon as possible." : "";

        return [
            supplier ? `Feeder order for ${supplier}` : "Feeder order",
            ...lines,
            total,
            ...(pickup ? [pickup] : [])
        ].join("\n");
    }

    window.SnakeFeeders = {
        SETTINGS_KEY,
        INVENTORY_KEY,
        DEFAULT_SETTINGS,
        MIN_LEAD_DAYS,
        DEFAULT_FEEDER_SIZES,
        MODES,
        parseFeederSize,
        withFeederMarker,
        getFeederKind,
        usesFreezerStock,
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
        buildWeeklyOrder,
        formatWeeklyOrderText,
        parseDate,
        dateText,
        addDays,
        daysBetween,
        todayText
    };
})();
