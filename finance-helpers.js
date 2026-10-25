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

    function getSettings() {
        const stored = readObject(KEYS.settings);
        const currency = CURRENCIES.includes(stored.currency) ? stored.currency : DEFAULT_CURRENCY;
        const prices = {};

        if (stored.feederPrices && typeof stored.feederPrices === "object") {
            Object.keys(stored.feederPrices).forEach(size => {
                const price = toNumber(stored.feederPrices[size]);

                if (price > 0) {
                    prices[size] = Math.round(price * 100) / 100;
                }
            });
        }

        return { currency, feederPrices: prices };
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
            feederPrices: next.feederPrices || {}
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
                note: String(expense.note || "")
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
            note: String(expense.note || "").trim()
        };

        expenses.push(entry);
        saveExpenses(expenses);

        return entry;
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
                location: String(expo.location || ""),
                boothCost: toMoney(expo.boothCost),
                travelCost: toMoney(expo.travelCost),
                otherCost: toMoney(expo.otherCost),
                otherRevenue: toMoney(expo.otherRevenue),
                notes: String(expo.notes || "")
            }));
    }

    function saveExpos(expos) {
        writeArray(KEYS.expos, expos);
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

    function getFeederUsage(snakes, prices, year) {
        const priceList = prices || getSettings().feederPrices;
        const sizes = {};
        let unpricedFeedings = 0;
        let unrecordedSizeFeedings = 0;
        let acceptedFeedings = 0;

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

                if (!sizes[size]) {
                    sizes[size] = 0;
                }

                sizes[size] += 1;
            });
        });

        const rows = Object.keys(sizes)
            .sort((a, b) => a.localeCompare(b))
            .map(size => {
                const count = sizes[size];
                const price = toMoney(priceList[size]);
                const cost = Math.round(count * price * 100) / 100;

                if (price <= 0) {
                    unpricedFeedings += count;
                }

                return { size, count, price, cost };
            });

        const total = Math.round(rows.reduce((sum, row) => sum + row.cost, 0) * 100) / 100;

        return {
            rows,
            total,
            acceptedFeedings,
            unpricedFeedings,
            unrecordedSizeFeedings
        };
    }

    // ---- Expo totals -------------------------------------------------------

    function getExpoTotals(expo, snakes) {
        const costs = Math.round((toMoney(expo.boothCost) + toMoney(expo.travelCost) + toMoney(expo.otherCost)) * 100) / 100;
        const sales = [];

        (snakes || []).forEach(snake => {
            const sale = getSnakeSale(snake);

            if (sale.recorded && expo && sale.expoId === expo.id) {
                sales.push({ snake, sale });
            }
        });

        const snakeRevenue = Math.round(sales.reduce((sum, item) => sum + item.sale.amount, 0) * 100) / 100;
        const otherRevenue = toMoney(expo.otherRevenue);
        const revenue = Math.round((snakeRevenue + otherRevenue) * 100) / 100;

        return {
            costs,
            sales,
            snakeRevenue,
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

            if (sale.recorded) {
                const expo = findExpo(expos, sale.expoId);

                events.push({
                    date: sale.date,
                    direction: "in",
                    category: "snake-sale",
                    label: snake.name || "Unnamed snake",
                    detail: expo ? `${expo.name}${sale.buyer ? ` — ${sale.buyer}` : ""}` : (sale.buyer || "Sale"),
                    amount: sale.amount,
                    snakeId: snake.id || "",
                    expoId: sale.expoId || ""
                });
            }
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
        getExpos,
        saveExpos,
        findExpo,
        getSnakePurchase,
        getSnakeSale,
        isMarkedSold,
        getSnakeLabel,
        getFeederUsage,
        getExpoTotals,
        getEvents,
        summarize,
        filterEventsByYear,
        getAvailableYears
    };
})();
