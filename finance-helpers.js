// finance-helpers.js
// Money helpers shared by the Finances page and the snake record form.
//
// Three storage keys make up the money side of the app:
//   financeSettings  — currency and the price paid per feeder size
//   financeExpenses  — feeder orders, supplies, vet, shipping, other costs
//   financeExpos     — shows: booth/travel costs and any extra revenue
//
// Snake purchases and sales are not duplicated here. They live on the snake
// record itself (purchasePrice, purchasedFrom, salePrice, soldTo, saleExpoId),
// so a sale recorded while marking a snake Sold is the same sale the Finances
// page reports. This file only reads those fields and totals them.

(function () {
    const KEYS = {
        settings: "financeSettings",
        expenses: "financeExpenses",
        expos: "financeExpos"
    };

    const DEFAULT_CURRENCY = "CAD";
    const CURRENCIES = ["CAD", "USD", "GBP", "EUR", "AUD", "NZD"];
    // How late a pickup can be before the hold is flagged expired. This is a
    // policy setting, not a fact about the sale, so the keeper can change it.
    const DEFAULT_HOLD_GRACE_DAYS = 30;
    const MIN_HOLD_GRACE_DAYS = 1;
    const MAX_HOLD_GRACE_DAYS = 365;

    const EXPENSE_CATEGORIES = [
        { id: "Feeders", label: "Feeders" },
        { id: "Supplies", label: "Supplies" },
        { id: "Vet", label: "Vet" },
        { id: "Shipping", label: "Shipping" },
        { id: "Other", label: "Other" }
    ];

    // Sizes the app already suggests, plus common mouse sizes. Any other size
    // found in a feeding record is added to the list by the page.
    const FEEDER_SIZES = [
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

    const EVENT_LABELS = {
        "snake-purchase": "Snake purchases",
        "snake-sale": "Snake sales",
        "hold-deposit": "Hold deposits",
        "hold-refund": "Deposit refunds",
        feeders: "Feeder orders",
        supplies: "Supplies",
        vet: "Vet",
        shipping: "Shipping",
        other: "Other expenses",
        "show-cost": "Show costs",
        "show-revenue": "Show revenue"
    };

    function readArray(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key));
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function writeArray(key, items) {
        const payload = Array.isArray(items) ? items : [];

        if (window.SnakeData && typeof window.SnakeData.saveStorageArray === "function") {
            window.SnakeData.saveStorageArray(key, payload);
            return;
        }

        localStorage.setItem(key, JSON.stringify(payload));
    }

    function readObject(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key));
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function writeObject(key, value) {
        const payload = value && typeof value === "object" ? value : {};

        // The auto-sync hooks watch SnakeData.saveStorageArray; settings are a
        // single object, so go straight through localStorage and let the
        // patched setItem mark it dirty.
        localStorage.setItem(key, JSON.stringify(payload));
    }

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function toMoney(value) {
        // Blank means "not recorded", which must not read as a free animal.
        if (value === "" || value === null || value === undefined) {
            return 0;
        }

        return Math.round(toNumber(value) * 100) / 100;
    }

    function createId(prefix) {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function getTodayText() {
        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");

        return `${today.getFullYear()}-${month}-${day}`;
    }

    // ---- Settings ----------------------------------------------------------

    function normalizeHoldGraceDays(value) {
        const days = Math.round(toNumber(value));

        return days >= MIN_HOLD_GRACE_DAYS && days <= MAX_HOLD_GRACE_DAYS
            ? days
            : DEFAULT_HOLD_GRACE_DAYS;
    }

    function getSettings() {
        const stored = readObject(KEYS.settings);
        const currency = CURRENCIES.includes(stored.currency) ? stored.currency : DEFAULT_CURRENCY;
        const holdGraceDays = normalizeHoldGraceDays(stored.holdGraceDays);
        const prices = {};

        if (stored.feederPrices && typeof stored.feederPrices === "object") {
            Object.keys(stored.feederPrices).forEach(size => {
                const price = toNumber(stored.feederPrices[size]);

                if (price > 0) {
                    prices[size] = Math.round(price * 100) / 100;
                }
            });
        }

        // Any sizes the keeper named themselves (ASF, a mouse size of their own).
        // They live beside the prices so a type can be listed before it is priced.
        const types = Array.isArray(stored.feederTypes)
            ? stored.feederTypes.map(type => String(type || "").trim()).filter(Boolean)
            : [];

        return { currency, feederPrices: prices, feederTypes: dedupeTypes(types), holdGraceDays };
    }

    function dedupeTypes(types) {
        const seen = {};

        return types.filter(type => {
            const key = type.toLowerCase();

            if (seen[key]) {
                return false;
            }

            seen[key] = true;
            return true;
        });
    }

    function saveSettings(settings) {
        const current = getSettings();
        const next = {
            ...current,
            ...(settings || {})
        };

        if (!CURRENCIES.includes(next.currency)) {
            next.currency = DEFAULT_CURRENCY;
        }

        writeObject(KEYS.settings, {
            currency: next.currency,
            feederPrices: next.feederPrices || {},
            feederTypes: dedupeTypes((Array.isArray(next.feederTypes) ? next.feederTypes : [])
                .map(type => String(type || "").trim())
                .filter(Boolean)),
            holdGraceDays: normalizeHoldGraceDays(next.holdGraceDays)
        });
    }

    function getCurrency() {
        return getSettings().currency;
    }

    function setCurrency(code) {
        saveSettings({ currency: code });
    }

    const moneyFormatters = {};

    function formatMoney(value, currency = getCurrency()) {
        const amount = toNumber(value);
        const code = CURRENCIES.includes(currency) ? currency : DEFAULT_CURRENCY;

        if (!moneyFormatters[code]) {
            try {
                moneyFormatters[code] = new Intl.NumberFormat("en-CA", {
                    style: "currency",
                    currency: code,
                    currencyDisplay: "narrowSymbol",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            } catch (error) {
                moneyFormatters[code] = null;
            }
        }

        if (!moneyFormatters[code]) {
            return `$${amount.toFixed(2)}`;
        }

        return moneyFormatters[code].format(amount);
    }

    // ---- Expenses ----------------------------------------------------------

    // A feeder order can carry what actually arrived, not just a total. The
    // Feeders page uses these lines to add stock; the money side still treats
    // the order as one expense.
    function normalizeFeederLines(value) {
        return (Array.isArray(value) ? value : [])
            .map(line => {
                if (!line || typeof line !== "object") {
                    return null;
                }

                const size = String(line.size || "").trim();
                const quantity = Math.max(0, Math.round(toNumber(line.quantity)));

                return size && quantity > 0 ? { size, quantity } : null;
            })
            .filter(Boolean);
    }

    function normalizeFeederType(value) {
        return value === "live" || value === "frozen" ? value : "";
    }

    function getExpenses() {
        return readArray(KEYS.expenses)
            .filter(expense => expense && typeof expense === "object")
            .map(expense => ({
                id: expense.id || createId("exp"),
                date: expense.date || "",
                category: EXPENSE_CATEGORIES.some(item => item.id === expense.category)
                    ? expense.category
                    : "Other",
                vendor: String(expense.vendor || ""),
                amount: toMoney(expense.amount),
                note: String(expense.note || ""),
                // Shipping and tax are paid to the courier and the tax office,
                // not for the feeders themselves, so a frozen order keeps them
                // as their own lines inside the one amount paid.
                shipping: toMoney(expense.shipping),
                tax: toMoney(expense.tax),
                feederType: normalizeFeederType(expense.feederType),
                feederLines: normalizeFeederLines(expense.feederLines)
            }));
    }

    function saveExpenses(expenses) {
        writeArray(KEYS.expenses, expenses);
    }

    function addExpense(expense) {
        const expenses = getExpenses();
        const entry = {
            id: createId("exp"),
            date: expense.date || getTodayText(),
            category: expense.category || "Other",
            vendor: String(expense.vendor || "").trim(),
            amount: toMoney(expense.amount),
            note: String(expense.note || "").trim(),
            shipping: toMoney(expense.shipping),
            tax: toMoney(expense.tax),
            feederType: normalizeFeederType(expense.feederType),
            feederLines: normalizeFeederLines(expense.feederLines)
        };

        expenses.push(entry);
        saveExpenses(expenses);

        return entry;
    }

    // What an order's total is actually made of. The feeders are whatever is
    // left once the courier and the tax come out of the amount paid.
    function getFeederOrderBreakdown(expense) {
        const total = toMoney(expense && expense.amount);
        const shipping = toMoney(expense && expense.shipping);
        const tax = toMoney(expense && expense.tax);

        return {
            total,
            shipping,
            tax,
            feeders: Math.round((total - shipping - tax) * 100) / 100
        };
    }

    function removeExpense(expenseId) {
        saveExpenses(getExpenses().filter(expense => expense.id !== expenseId));
    }

    // ---- Expos -------------------------------------------------------------

    function getExpos() {
        return readArray(KEYS.expos)
            .filter(expo => expo && typeof expo === "object")
            .map(expo => ({
                id: expo.id || createId("expo"),
                name: String(expo.name || "Unnamed show"),
                date: expo.date || "",
                // Shows run more than one day often enough that a single date
                // was hiding the Sunday takings. Empty means a one-day show.
                endDate: expo.endDate || "",
                location: String(expo.location || ""),
                boothCost: toMoney(expo.boothCost),
                travelCost: toMoney(expo.travelCost),
                otherCost: toMoney(expo.otherCost),
                otherRevenue: toMoney(expo.otherRevenue),
                otherSales: normalizeOtherSales(expo.otherSales),
                notes: String(expo.notes || "")
            }));
    }

    function saveExpos(expos) {
        writeArray(KEYS.expos, expos);
    }

    // What sold besides snakes: hats, shirts, stickers, spare tubs. One line per
    // thing tried, so a keeper can see which item is worth restocking instead of
    // one lump sum that says nothing. Older shows only carry a single number,
    // which stays usable as a fallback.
    function normalizeOtherSales(items) {
        if (!Array.isArray(items)) {
            return [];
        }

        return items
            .filter(item => item && typeof item === "object")
            .map(item => ({
                id: String(item.id || createId("sale")),
                label: String(item.label || "").trim(),
                amount: toMoney(item.amount)
            }))
            .filter(item => item.label || item.amount > 0);
    }

    function getExpoOtherSalesTotal(expo) {
        const items = normalizeOtherSales(expo && expo.otherSales);

        if (items.length === 0) {
            return toMoney(expo && expo.otherRevenue);
        }

        return Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    }

    function findExpo(expos, expoId) {
        if (!expoId) {
            return null;
        }

        return (expos || getExpos()).find(expo => expo.id === expoId) || null;
    }

    // ---- Snakes: purchase and sale -----------------------------------------

    function getSnakePurchase(snake) {
        const amount = toMoney(snake && snake.purchasePrice);

        return {
            amount,
            date: (snake && (snake.purchaseDate || snake.acquiredDate)) || "",
            from: String((snake && snake.purchasedFrom) || ""),
            recorded: amount > 0
        };
    }

    function getSnakeSale(snake) {
        if (!snake) {
            return { amount: 0, date: "", buyer: "", expoId: "", recorded: false };
        }

        const amount = toMoney(snake.salePrice);
        const date = snake.saleDate || "";
        const buyer = String(snake.soldTo || "");
        const expoId = String(snake.saleExpoId || "");

        return {
            amount,
            date,
            buyer,
            expoId,
            recorded: amount > 0 || Boolean(date)
        };
    }

    function isMarkedSold(snake) {
        return Boolean(snake) && String(snake.status || "") === "Sold";
    }

    // A price on a snake that is still Available is an asking price, not money.
    // A sale is realized by the Sold status or by a sale date on the record.
    function isRealizedSale(snake) {
        const sale = getSnakeSale(snake);

        return sale.recorded && (isMarkedSold(snake) || Boolean(sale.date));
    }

    function getSnakeLabel(snake) {
        if (!snake) {
            return "Unknown snake";
        }

        const name = snake.name || "Unnamed";
        const identity = snake.ID || snake.morph || "";

        return identity ? `${name} — ${identity}` : name;
    }

    // ---- Feeding cost ------------------------------------------------------

    function isConsumedFeeding(entry) {
        if (!entry || entry.result === "Refused" || entry.result === "Regurgitated") {
            return false;
        }

        return true;
    }

    function getFeederPrice(size, prices) {
        const list = prices || getSettings().feederPrices;
        const clean = String(size || "").trim().toLowerCase();
        const key = Object.keys(list || {}).find(name => name.toLowerCase() === clean);

        return key ? toMoney(list[key]) : 0;
    }

    // Stamp the price onto the feeding record as it is logged. Without this, a
    // keeper raising a feeder price rewrites the cost of every meal already
    // eaten, and last season's figures change every time a price moves.
    function priceFeedingEntry(entry, prices) {
        if (!entry || typeof entry !== "object") {
            return entry;
        }

        const stored = entry.feederPrice;
        const hasStored = stored !== undefined && stored !== null && String(stored) !== "";

        if (!hasStored) {
            const price = getFeederPrice(entry.feederSize, prices);

            if (price > 0) {
                entry.feederPrice = price;
            }
        }

        return entry;
    }

    function getFeederUsage(snakes, prices, year) {
        const priceList = prices || getSettings().feederPrices;
        const sizes = {};
        let unpricedFeedings = 0;
        let unrecordedSizeFeedings = 0;
        let acceptedFeedings = 0;
        let recordedPriceFeedings = 0;

        (snakes || []).forEach(snake => {
            (Array.isArray(snake.feedingHistory) ? snake.feedingHistory : []).forEach(entry => {
                if (!isConsumedFeeding(entry)) {
                    return;
                }

                if (year) {
                    const match = /^(\d{4})/.exec(String(entry.date || ""));

                    if (!match || Number(match[1]) !== Number(year)) {
                        return;
                    }
                }

                acceptedFeedings += 1;

                const size = String(entry.feederSize || "").trim();

                if (!size) {
                    unrecordedSizeFeedings += 1;
                    return;
                }

                const stored = entry.feederPrice;
                const hasStored = stored !== undefined && stored !== null && String(stored) !== "";
                const entryPrice = hasStored ? toMoney(stored) : toMoney(priceList[size]);

                if (hasStored) {
                    recordedPriceFeedings += 1;
                }

                if (!sizes[size]) {
                    sizes[size] = { count: 0, cost: 0, unpriced: 0 };
                }

                sizes[size].count += 1;
                sizes[size].cost += entryPrice;

                if (entryPrice <= 0) {
                    sizes[size].unpriced += 1;
                }
            });
        });

        const rows = Object.keys(sizes)
            .sort((a, b) => a.localeCompare(b))
            .map(size => {
                const bucket = sizes[size];
                const price = toMoney(priceList[size]);
                const cost = Math.round(bucket.cost * 100) / 100;

                unpricedFeedings += bucket.unpriced;

                return { size, count: bucket.count, price, cost, unpriced: bucket.unpriced };
            });

        const total = Math.round(rows.reduce((sum, row) => sum + row.cost, 0) * 100) / 100;

        return {
            rows,
            total,
            acceptedFeedings,
            unpricedFeedings,
            unrecordedSizeFeedings,
            recordedPriceFeedings
        };
    }

    // ---- Expo totals -------------------------------------------------------

    function getExpoTotals(expo, snakes) {
        const costs = Math.round((toMoney(expo.boothCost) + toMoney(expo.travelCost) + toMoney(expo.otherCost)) * 100) / 100;
        const sales = [];

        (snakes || []).forEach(snake => {
            const sale = getSnakeSale(snake);

            if (isRealizedSale(snake) && expo && sale.expoId === expo.id) {
                sales.push({ snake, sale });
            }
        });

        const snakeRevenue = Math.round(sales.reduce((sum, item) => sum + item.sale.amount, 0) * 100) / 100;
        const otherSales = normalizeOtherSales(expo && expo.otherSales);
        const otherRevenue = getExpoOtherSalesTotal(expo);
        const revenue = Math.round((snakeRevenue + otherRevenue) * 100) / 100;

        return {
            costs,
            sales,
            snakeRevenue,
            otherSales,
            otherRevenue,
            revenue,
            net: Math.round((revenue - costs) * 100) / 100
        };
    }

    // ---- Normalised money events ------------------------------------------
    //
    // One list feeds the totals, the year filter and the recent-activity feed,
    // so those three can never disagree.

    function getEvents(snakes, expenses, expos) {
        const events = [];

        (snakes || []).forEach(snake => {
            const purchase = getSnakePurchase(snake);

            if (purchase.recorded) {
                events.push({
                    date: purchase.date,
                    direction: "out",
                    category: "snake-purchase",
                    label: snake.name || "Unnamed snake",
                    detail: purchase.from || "Purchase",
                    amount: purchase.amount,
                    snakeId: snake.id || ""
                });
            }

            const sale = getSnakeSale(snake);
            const deposit = toMoney(snake.holdDeposit);
            // A dated sale, or a snake marked Sold, is a completed sale and the
            // deposit is already part of its price. Until then a deposit is cash
            // received but not a sale, so it is counted on its own. An asking
            // price on an unsold snake is not money at all.
            const realizedSale = isRealizedSale(snake);

            if (realizedSale) {
                const expo = findExpo(expos, sale.expoId);
                // A sale marked without a price still has real cash in it if a
                // deposit was taken. Never drop that money off the ledger.
                const saleAmount = sale.amount > 0 ? sale.amount : deposit;

                events.push({
                    date: sale.date,
                    direction: "in",
                    category: "snake-sale",
                    label: snake.name || "Unnamed snake",
                    detail: expo ? `${expo.name}${sale.buyer ? ` — ${sale.buyer}` : ""}` : (sale.buyer || "Sale"),
                    amount: saleAmount,
                    snakeId: snake.id || "",
                    expoId: sale.expoId || ""
                });
            }

            if (!realizedSale && deposit > 0) {
                events.push({
                    date: String(snake.holdDepositDate || "").slice(0, 10),
                    direction: "in",
                    category: "hold-deposit",
                    label: snake.name || "Unnamed snake",
                    detail: snake.holdBuyer
                        ? `Hold deposit — ${snake.holdBuyer}`
                        : "Hold deposit",
                    amount: deposit,
                    snakeId: snake.id || ""
                });
            }

            // A released hold stops being a current deposit but its cash does
            // not disappear. The archived hold keeps the deposit event, and a
            // returned deposit adds the matching refund on the way out.
            (Array.isArray(snake.holdHistory) ? snake.holdHistory : []).forEach(entry => {
                if (!entry || typeof entry !== "object") {
                    return;
                }

                const releasedDeposit = toMoney(entry.deposit);

                if (releasedDeposit <= 0) {
                    return;
                }

                const buyer = String(entry.buyer || "").trim();
                const disposition = String(entry.disposition || "");
                const releasedDate = String(entry.releasedDate || "").slice(0, 10);
                const depositDate = String(entry.depositDate || releasedDate).slice(0, 10);
                const dispositionLabel = disposition === "return"
                    ? "returned"
                    : disposition === "transfer"
                        ? "transferred"
                        : "forfeited";

                events.push({
                    date: depositDate,
                    direction: "in",
                    category: "hold-deposit",
                    label: snake.name || "Unnamed snake",
                    detail: `Hold deposit — ${buyer || "buyer"} (${dispositionLabel})`,
                    amount: releasedDeposit,
                    snakeId: snake.id || ""
                });

                if (disposition === "return" || entry.refunded) {
                    events.push({
                        date: releasedDate || depositDate,
                        direction: "out",
                        category: "hold-refund",
                        label: snake.name || "Unnamed snake",
                        detail: `Deposit refund — ${buyer || "buyer"}`,
                        amount: releasedDeposit,
                        snakeId: snake.id || ""
                    });
                }
            });
        });

        (expenses || []).forEach(expense => {
            if (toMoney(expense.amount) <= 0) {
                return;
            }

            events.push({
                date: expense.date,
                direction: "out",
                category: String(expense.category || "Other").toLowerCase(),
                label: expense.vendor || EVENT_LABELS[String(expense.category || "Other").toLowerCase()] || "Expense",
                detail: expense.note || expense.category || "Expense",
                amount: toMoney(expense.amount)
            });
        });

        (expos || []).forEach(expo => {
            const totals = getExpoTotals(expo, snakes);

            if (totals.costs > 0) {
                events.push({
                    date: expo.date,
                    direction: "out",
                    category: "show-cost",
                    label: expo.name || "Show",
                    detail: expo.location || "Show costs",
                    amount: totals.costs,
                    expoId: expo.id
                });
            }

            if (totals.otherRevenue > 0) {
                events.push({
                    date: expo.date,
                    direction: "in",
                    category: "show-revenue",
                    label: expo.name || "Show",
                    detail: expo.location || "Show revenue",
                    amount: totals.otherRevenue,
                    expoId: expo.id
                });
            }
        });

        return events.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    }

    function summarize(events) {
        const totals = { revenue: 0, spend: 0, net: 0, byCategory: {} };

        (events || []).forEach(event => {
            const amount = toNumber(event.amount);
            const key = event.category || "other";

            totals.byCategory[key] = totals.byCategory[key] || { in: 0, out: 0 };

            if (event.direction === "in") {
                totals.revenue += amount;
                totals.byCategory[key].in += amount;
            } else {
                totals.spend += amount;
                totals.byCategory[key].out += amount;
            }
        });

        totals.revenue = Math.round(totals.revenue * 100) / 100;
        totals.spend = Math.round(totals.spend * 100) / 100;
        totals.net = Math.round((totals.revenue - totals.spend) * 100) / 100;

        return totals;
    }

    function getEventYear(event) {
        const match = /^(\d{4})/.exec(String(event.date || ""));
        return match ? Number(match[1]) : null;
    }

    function filterEventsByYear(events, year) {
        if (!year) {
            return events;
        }

        return (events || []).filter(event => getEventYear(event) === Number(year));
    }

    function getAvailableYears(events) {
        const years = new Set();

        (events || []).forEach(event => {
            const year = getEventYear(event);

            if (year) {
                years.add(year);
            }
        });

        return [...years].sort((a, b) => b - a);
    }

    window.SnakeFinance = {
        KEYS,
        CURRENCIES,
        DEFAULT_CURRENCY,
        DEFAULT_HOLD_GRACE_DAYS,
        MIN_HOLD_GRACE_DAYS,
        MAX_HOLD_GRACE_DAYS,
        normalizeHoldGraceDays,
        EXPENSE_CATEGORIES,
        FEEDER_SIZES,
        EVENT_LABELS,
        getSettings,
        saveSettings,
        getCurrency,
        setCurrency,
        formatMoney,
        toMoney,
        toNumber,
        createId,
        getTodayText,
        getExpenses,
        saveExpenses,
        addExpense,
        removeExpense,
        getFeederOrderBreakdown,
        getExpos,
        saveExpos,
        findExpo,
        getSnakePurchase,
        getSnakeSale,
        isMarkedSold,
        isRealizedSale,
        getSnakeLabel,
        getFeederUsage,
        getFeederPrice,
        priceFeedingEntry,
        normalizeOtherSales,
        getExpoOtherSalesTotal,
        getExpoTotals,
        getEvents,
        summarize,
        filterEventsByYear,
        getAvailableYears
    };
})();
