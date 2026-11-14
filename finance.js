// finance.js
// The Finances page: one honest ledger built from three places —
//   1. each snake's purchase and sale fields,
//   2. feeder orders and other expenses entered here,
//   3. shows with their booth/travel costs and the sales linked to them.
//
// Every total on the page comes from SnakeFinance.getEvents(), so the overview,
// the period filter and the recent-activity list cannot disagree.

(function () {
    const F = window.SnakeFinance;

    if (!F) {
        return;
    }

    const state = {
        tab: "overview",
        year: "",
        editingExpoId: "",
        releaseSnakeId: "",
        expoOtherSales: []
    };

    let snakes = [];
    let expenses = [];
    let expos = [];
    let events = [];
    let settings = F.getSettings();

    const PANEL_NAMES = ["overview", "snakes", "holds", "feeders", "expos", "costs"];

    function $(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatMoney(value) {
        return F.formatMoney(value, settings.currency);
    }

    function formatDate(value) {
        if (!value) {
            return "—";
        }

        const date = new Date(`${value}T00:00:00`);

        if (Number.isNaN(date.getTime())) {
            return escapeHtml(value);
        }

        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function snakeProfileUrl(snake) {
        return `snake-form.html?uid=${encodeURIComponent(snake.id || "")}`;
    }

    function setStatus(elementId, message, isError = false) {
        const element = $(elementId);

        if (!element) {
            return;
        }

        element.textContent = message || "";
        element.classList.toggle("fin-error", Boolean(isError));

        // The page-level report starts hidden so the form area stays quiet
        // until there is something worth saying.
        if (elementId === "finReport") {
            element.style.display = message ? "" : "none";
        }
    }

    // ---- Loading -----------------------------------------------------------

    function loadAll() {
        snakes = window.SnakeData.loadSnakesWithIds([]);
        expenses = F.getExpenses();
        expos = F.getExpos();
        settings = F.getSettings();
        events = F.getEvents(snakes, expenses, expos);
    }

    // ---- Tabs --------------------------------------------------------------

    function showTab(tabName) {
        const nextTab = PANEL_NAMES.includes(tabName) ? tabName : "overview";
        state.tab = nextTab;

        document.querySelectorAll("[data-fin-tab]").forEach(button => {
            const isActive = button.getAttribute("data-fin-tab") === nextTab;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-selected", isActive ? "true" : "false");
        });

        document.querySelectorAll("[data-fin-panel]").forEach(panel => {
            const isActive = panel.getAttribute("data-fin-panel") === nextTab;
            panel.classList.toggle("is-active", isActive);
            panel.style.display = isActive ? "" : "none";
        });

        if (window.location.hash !== `#${nextTab}`) {
            history.replaceState(null, "", `#${nextTab}`);
        }
    }

    // ---- Overview ----------------------------------------------------------

    function renderYearOptions() {
        const select = $("finYearSelect");

        if (!select) {
            return;
        }

        const years = F.getAvailableYears(events).map(String);

        select.innerHTML = `<option value="">All time</option>` + years
            .map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`)
            .join("");

        if (state.year && !years.includes(String(state.year))) {
            state.year = "";
        }

        select.value = state.year;
    }

    function getPeriodEvents() {
        return F.filterEventsByYear(events, state.year);
    }

    function renderKpis(periodEvents) {
        const totals = F.summarize(periodEvents);
        const feeding = F.getFeederUsage(snakes, settings.feederPrices, state.year || null);

        const revenueCount = periodEvents.filter(event => event.direction === "in" && event.amount > 0).length;
        const spendCount = periodEvents.filter(event => event.direction === "out" && event.amount > 0).length;

        const revenue = $("finRevenue");
        const spend = $("finSpend");
        const net = $("finNet");

        revenue.textContent = formatMoney(totals.revenue);
        spend.textContent = formatMoney(totals.spend);
        net.textContent = formatMoney(totals.net);

        net.classList.toggle("fin-positive", totals.net > 0);
        net.classList.toggle("fin-negative", totals.net < 0);

        $("finRevenueNote").textContent = revenueCount === 0
            ? "No money in recorded yet."
            : `${revenueCount} money-in entr${revenueCount === 1 ? "y" : "ies"} recorded.`;

        $("finSpendNote").textContent = spendCount === 0
            ? "No money out recorded yet."
            : `${spendCount} money-out entr${spendCount === 1 ? "y" : "ies"} recorded.`;

        $("finNetNote").textContent = state.year
            ? `Money in minus money out in ${state.year}.`
            : "Money in minus money out, all time.";

        $("finFeedingUsed").textContent = formatMoney(feeding.total);

        const feedingParts = [];

        if (feeding.acceptedFeedings > 0) {
            feedingParts.push(`${feeding.acceptedFeedings} accepted feeding${feeding.acceptedFeedings === 1 ? "" : "s"}`);
        }

        if (feeding.unpricedFeedings > 0) {
            feedingParts.push(`${feeding.unpricedFeedings} of them unpriced`);
        }

        const periodLabel = state.year ? ` in ${state.year}` : "";

        $("finFeedingUsedNote").textContent = feedingParts.length > 0
            ? `Estimated${periodLabel} · ${feedingParts.join(" · ")}.`
            : `Estimated from your feeder prices. No feedings recorded${periodLabel} yet.`;
    }

    function renderBreakdown(periodEvents) {
        const body = $("finBreakdownBody");
        const empty = $("finBreakdownEmpty");
        const totals = {};

        periodEvents.forEach(event => {
            if (event.amount <= 0) {
                return;
            }

            totals[event.category] = totals[event.category] || { in: 0, out: 0 };
            totals[event.category][event.direction] += event.amount;
        });

        const inOrder = ["snake-sale", "hold-deposit", "show-revenue"];
        const outOrder = ["snake-purchase", "hold-refund", "feeders", "show-cost", "supplies", "vet", "shipping", "other"];
        const rows = [];

        inOrder.forEach(category => {
            const amount = totals[category] ? totals[category].in : 0;

            if (amount > 0) {
                rows.push(`
                    <tr>
                        <td><span class="fin-direction fin-in">In</span> ${escapeHtml(F.EVENT_LABELS[category] || category)}</td>
                        <td class="fin-amount-cell fin-positive">${formatMoney(amount)}</td>
                    </tr>
                `);
            }
        });

        outOrder.forEach(category => {
            const amount = totals[category] ? totals[category].out : 0;

            if (amount > 0) {
                rows.push(`
                    <tr>
                        <td><span class="fin-direction fin-out">Out</span> ${escapeHtml(F.EVENT_LABELS[category] || category)}</td>
                        <td class="fin-amount-cell fin-negative">${formatMoney(amount)}</td>
                    </tr>
                `);
            }
        });

        body.innerHTML = rows.join("");
        empty.style.display = rows.length === 0 ? "" : "none";
    }

    function renderActivity(periodEvents) {
        const container = $("finActivity");
        const empty = $("finActivityEmpty");
        const recent = periodEvents.filter(event => event.amount > 0).slice(0, 8);

        if (recent.length === 0) {
            container.innerHTML = "";
            empty.style.display = "";
            return;
        }

        empty.style.display = "none";
        container.innerHTML = recent.map(event => {
            const isIn = event.direction === "in";

            return `
                <div class="fin-activity-row">
                    <span class="fin-activity-date">${formatDate(event.date)}</span>
                    <span class="fin-activity-main">
                        <strong>${escapeHtml(event.label)}</strong>
                        <small>${escapeHtml(event.detail)}</small>
                    </span>
                    <span class="fin-activity-amount ${isIn ? "fin-positive" : "fin-negative"}">
                        ${isIn ? "+" : "−"}${formatMoney(event.amount)}
                    </span>
                </div>
            `;
        }).join("");
    }

    function renderOverview() {
        const periodEvents = getPeriodEvents();
        renderKpis(periodEvents);
        renderBreakdown(periodEvents);
        renderActivity(periodEvents);
    }

    // ---- Snakes ------------------------------------------------------------

    function getPurchases() {
        return snakes
            .map(snake => ({ snake, purchase: F.getSnakePurchase(snake) }))
            .filter(item => item.purchase.recorded)
            .sort((a, b) => String(b.purchase.date || "").localeCompare(String(a.purchase.date || "")));
    }

    function getSales() {
        return snakes
            .map(snake => ({ snake, sale: F.getSnakeSale(snake) }))
            .filter(item => F.isRealizedSale(item.snake))
            .sort((a, b) => String(b.sale.date || "").localeCompare(String(a.sale.date || "")));
    }

    function snakeLink(snake) {
        return window.SnakeData.getSnakeLinkHtml(snake);
    }

    function renderSnakeLedger() {
        const purchases = getPurchases();
        const sales = getSales();

        $("finPurchasesBody").innerHTML = purchases.map(({ snake, purchase }) => `
            <tr>
                <td>${snakeLink(snake)}</td>
                <td>${escapeHtml(purchase.from || "Not recorded")}</td>
                <td>${formatDate(purchase.date)}</td>
                <td class="fin-amount-cell">${formatMoney(purchase.amount)}</td>
            </tr>
        `).join("");

        const purchaseTotal = purchases.reduce((sum, item) => sum + item.purchase.amount, 0);

        $("finPurchasesFoot").innerHTML = purchases.length > 0
            ? `<tr><th colspan="3">Total spent on snakes</th><td class="fin-amount-cell">${formatMoney(purchaseTotal)}</td></tr>`
            : "";

        $("finPurchasesEmpty").style.display = purchases.length === 0 ? "" : "none";

        $("finSalesBody").innerHTML = sales.map(({ snake, sale }) => {
            const expo = F.findExpo(expos, sale.expoId);

            return `
                <tr>
                    <td>${snakeLink(snake)}</td>
                    <td>${escapeHtml(sale.buyer || "Not recorded")}</td>
                    <td>${escapeHtml(expo ? expo.name : "—")}</td>
                    <td>${formatDate(sale.date)}</td>
                    <td class="fin-amount-cell">${formatMoney(sale.amount)}</td>
                </tr>
            `;
        }).join("");

        const saleTotal = sales.reduce((sum, item) => sum + item.sale.amount, 0);

        $("finSalesFoot").innerHTML = sales.length > 0
            ? `<tr><th colspan="4">Total snake sales</th><td class="fin-amount-cell">${formatMoney(saleTotal)}</td></tr>`
            : "";

        $("finSalesEmpty").style.display = sales.length === 0 ? "" : "none";

        // Missing or mismatched sale details would quietly distort the totals,
        // so point at the exact records that need a look.
        const soldWithoutMoney = snakes.filter(snake =>
            F.isMarkedSold(snake) && !F.getSnakeSale(snake).recorded
        );
        const saleWithoutSoldStatus = snakes.filter(snake =>
            F.getSnakeSale(snake).date && !F.isMarkedSold(snake)
        );
        const warningLines = [];

        if (soldWithoutMoney.length > 0) {
            warningLines.push(`
                <p><strong>${soldWithoutMoney.length} snake${soldWithoutMoney.length === 1 ? " is" : "s are"} marked Sold without a price or date:</strong>
                ${soldWithoutMoney.map(snakeLink).join(", ")}.
                These sales are not counted in the totals yet.</p>
            `);
        }

        if (saleWithoutSoldStatus.length > 0) {
            warningLines.push(`
                <p><strong>${saleWithoutSoldStatus.length} sale${saleWithoutSoldStatus.length === 1 ? " is" : "s are"} dated but the snake is not marked Sold:</strong>
                ${saleWithoutSoldStatus.map(snakeLink).join(", ")}.
                The money is counted; set Status to Sold to match the collection.</p>
            `);
        }

        const warnings = $("finSalesWarnings");

        warnings.innerHTML = warningLines.join("");
        warnings.style.display = warningLines.length > 0 ? "" : "none";
    }

    // ---- Feeders -----------------------------------------------------------

    function collectFeederSizes() {
        const sizes = new Set(F.FEEDER_SIZES);

        Object.keys(settings.feederPrices || {}).forEach(size => sizes.add(size));
        (settings.feederTypes || []).forEach(size => sizes.add(size));

        snakes.forEach(snake => {
            (Array.isArray(snake.feedingHistory) ? snake.feedingHistory : []).forEach(entry => {
                const size = String(entry.feederSize || "").trim();

                if (size) {
                    sizes.add(size);
                }
            });
        });

        return [...sizes].sort((a, b) => a.localeCompare(b));
    }

    function renderFeederPrices() {
        const container = $("feederPriceRows");

        if (!container) {
            return;
        }

        container.innerHTML = collectFeederSizes().map(size => {
            const price = settings.feederPrices[size];
            const inputId = `feederPrice-${size.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
            const custom = !F.FEEDER_SIZES.includes(size);

            return `
                <div class="feeder-price-row${custom ? " is-custom" : ""}">
                    <label for="${escapeHtml(inputId)}">${escapeHtml(size)}${custom ? "<small>your size</small>" : ""}</label>
                    <input type="number" min="0" step="0.01" id="${escapeHtml(inputId)}"
                        data-feeder-size="${escapeHtml(size)}"
                        value="${price ? Number(price).toFixed(2) : ""}"
                        placeholder="0.00">
                    ${custom
                        ? `<button type="button" class="fin-delete-button" data-remove-feeder-type="${escapeHtml(size)}"
                            title="Remove this feeder type">Remove</button>`
                        : ""}
                </div>
            `;
        }).join("");
    }

    // Names the keeper added themselves, kept even while unpriced so a half-set-up
    // list survives a reload.
    function collectCustomFeederTypes() {
        const custom = [];

        document.querySelectorAll("[data-feeder-size]").forEach(input => {
            const size = input.getAttribute("data-feeder-size");

            if (size && !F.FEEDER_SIZES.includes(size)) {
                custom.push(size);
            }
        });

        (settings.feederTypes || []).forEach(size => {
            if (!custom.some(name => name.toLowerCase() === size.toLowerCase())) {
                custom.push(size);
            }
        });

        return custom;
    }

    function saveFeederPrices() {
        const prices = {};

        document.querySelectorAll("[data-feeder-size]").forEach(input => {
            const size = input.getAttribute("data-feeder-size");
            const price = F.toMoney(input.value);

            if (size && price > 0) {
                prices[size] = price;
            }

            if (size && price > 0) {
                input.value = price.toFixed(2);
            }
        });

        F.saveSettings({ feederPrices: prices, feederTypes: collectCustomFeederTypes() });
        loadAll();
        renderFeederPrices();
        renderOverview();
        renderFeederUsage();
        setStatus("feederPriceStatus", prices && Object.keys(prices).length > 0
            ? `Saved ${Object.keys(prices).length} feeder price${Object.keys(prices).length === 1 ? "" : "s"}. New feeds use these; feeds already logged keep the price they were recorded at.`
            : "Prices cleared.");
    }

    function addFeederType() {
        const input = $("newFeederTypeInput");

        if (!input) {
            return;
        }

        const name = input.value.trim();

        if (!name) {
            setStatus("feederPriceStatus", "Type a name first — for example ASF Weaner.", true);
            input.focus();
            return;
        }

        const already = collectFeederSizes().some(size => size.toLowerCase() === name.toLowerCase());

        if (already) {
            setStatus("feederPriceStatus", `${name} is already on the list.`, true);
            input.select();
            return;
        }

        F.saveSettings({ feederTypes: [...(F.getSettings().feederTypes || []), name] });
        input.value = "";
        loadAll();
        renderFeederPrices();
        setStatus("feederPriceStatus", `Added ${name}. Set its price, then save.`);
    }

    function removeFeederType(name) {
        const current = F.getSettings();
        const prices = { ...(current.feederPrices || {}) };

        Object.keys(prices).forEach(key => {
            if (key.toLowerCase() === name.toLowerCase()) {
                delete prices[key];
            }
        });

        const types = (current.feederTypes || []).filter(type => type.toLowerCase() !== name.toLowerCase());

        F.saveSettings({ feederPrices: prices, feederTypes: types });
        loadAll();
        renderFeederPrices();
        renderOverview();
        renderFeederUsage();
        setStatus("feederPriceStatus", `Removed ${name}. Meals already logged under it keep their price.`);
    }

    function renderFeederUsage() {
        const usage = F.getFeederUsage(snakes, settings.feederPrices);
        const body = $("feederUsageBody");
        const foot = $("feederUsageFoot");
        const note = $("feederUsageNote");

        body.innerHTML = usage.rows.map(row => `
            <tr>
                <td>${escapeHtml(row.size)}</td>
                <td class="fin-amount-cell">${row.count}</td>
                <td class="fin-amount-cell">${row.price > 0 ? formatMoney(row.price) : "Not set"}</td>
                <td class="fin-amount-cell">${row.price > 0 ? formatMoney(row.cost) : "—"}</td>
            </tr>
        `).join("");

        foot.innerHTML = usage.rows.length > 0
            ? `<tr><th colspan="3">Estimated feeder cost used</th><td class="fin-amount-cell">${formatMoney(usage.total)}</td></tr>`
            : "";

        const notes = [];

        if (usage.acceptedFeedings === 0) {
            notes.push("No accepted feedings recorded yet. Feed records are kept on each snake's page.");
        } else {
            notes.push(`${usage.acceptedFeedings} accepted feeding${usage.acceptedFeedings === 1 ? "" : "s"} on record. Refused feeds and regurgitations are not counted.`);
        }

        if (usage.unrecordedSizeFeedings > 0) {
            notes.push(`${usage.unrecordedSizeFeedings} feeding${usage.unrecordedSizeFeedings === 1 ? " has" : "s have"} no feeder size, so they are left out.`);
        }

        if (usage.unpricedFeedings > 0) {
            notes.push(`${usage.unpricedFeedings} feeding${usage.unpricedFeedings === 1 ? " has" : "s have"} no price set for that size.`);
        }

        if (usage.recordedPriceFeedings > 0) {
            notes.push(`${usage.recordedPriceFeedings} feeding${usage.recordedPriceFeedings === 1 ? " was" : "s were"} costed at the price on the day, so changing a price only affects new feeds.`);
        }

        note.textContent = notes.join(" ");
    }

    function renderFeederOrders() {
        const orders = expenses
            .filter(expense => expense.category === "Feeders")
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

        $("finFeederOrdersBody").innerHTML = orders.map(expense => {
            const money = F.getFeederOrderBreakdown(expense);
            const split = [];

            if (money.shipping > 0) {
                split.push(`Shipping ${formatMoney(money.shipping)}`);
            }

            if (money.tax > 0) {
                split.push(`Tax ${formatMoney(money.tax)}`);
            }

            const splitLine = split.length > 0
                ? `<small class="fin-muted">Feeders ${formatMoney(money.feeders)} · ${split.join(" · ")}</small>`
                : "";

            return `
            <tr>
                <td>${formatDate(expense.date)}</td>
                <td>${escapeHtml(expense.vendor || "—")}</td>
                <td>${escapeHtml(expense.note || "—")}${splitLine}</td>
                <td class="fin-amount-cell">${formatMoney(expense.amount)}</td>
                <td class="fin-row-action">
                    <button type="button" class="fin-delete-button" data-delete-expense="${escapeHtml(expense.id)}"
                        title="Delete this feeder order">Delete</button>
                </td>
            </tr>
        `;
        }).join("");

        const total = orders.reduce((sum, expense) => sum + expense.amount, 0);

        $("finFeederOrdersEmpty").style.display = orders.length === 0 ? "" : "none";
        $("finFeederOrdersTotal").textContent = orders.length > 0
            ? `Total feeder orders: ${formatMoney(total)}`
            : "";
    }

    // ---- Shows -------------------------------------------------------------

    // A show's dates as one readable span: a single day, or a range when it ran
    // over a weekend.
    function formatExpoDates(expo) {
        if (!expo.date) {
            return expo.endDate ? formatDate(expo.endDate) : "Date not set";
        }

        if (!expo.endDate || expo.endDate === expo.date) {
            return formatDate(expo.date);
        }

        return `${formatDate(expo.date)} – ${formatDate(expo.endDate)}`;
    }

    function expoOtherSaleId() {
        return `sale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    }

    function renderExpoOtherSalesRows() {
        const host = $("expoOtherSalesRows");

        if (!host) {
            return;
        }

        if (state.expoOtherSales.length === 0) {
            state.expoOtherSales.push({ id: expoOtherSaleId(), label: "", amount: "" });
        }

        host.innerHTML = state.expoOtherSales.map(item => `
            <div class="expo-sale-row" data-sale-row="${escapeHtml(item.id)}">
                <input type="text" class="expo-sale-label" placeholder="e.g. Hats"
                    aria-label="Item sold" value="${escapeHtml(item.label || "")}">
                <input type="number" class="expo-sale-amount" min="0" step="0.01" placeholder="0.00"
                    aria-label="Amount taken" value="${escapeHtml(item.amount === 0 || item.amount ? item.amount : "")}">
                <button type="button" class="fin-delete-button" data-sale-remove="${escapeHtml(item.id)}"
                    aria-label="Remove this item">Remove</button>
            </div>
        `).join("");
    }

    // Read straight from the inputs: the keeper may type and save without ever
    // causing a re-render, so the DOM is the truth at submit time.
    function readExpoOtherSales(keepEmpty) {
        const host = $("expoOtherSalesRows");

        if (!host) {
            return [];
        }

        return [...host.querySelectorAll(".expo-sale-row")].map(row => ({
            id: row.getAttribute("data-sale-row") || expoOtherSaleId(),
            label: row.querySelector(".expo-sale-label").value.trim(),
            amount: F.toMoney(row.querySelector(".expo-sale-amount").value)
        })).filter(item => keepEmpty || item.label || item.amount > 0);
    }

    function addExpoOtherSale() {
        // Keep the rows already on screen, empty or not: pressing Add on a blank
        // row should give a second blank row, not look like nothing happened.
        const rows = readExpoOtherSales(true);
        state.expoOtherSales = [...rows, { id: expoOtherSaleId(), label: "", amount: "" }];
        renderExpoOtherSalesRows();
        const inputs = document.querySelectorAll("#expoOtherSalesRows .expo-sale-label");
        const last = inputs[inputs.length - 1];

        if (last) {
            last.focus();
        }
    }

    function removeExpoOtherSale(rowId) {
        state.expoOtherSales = readExpoOtherSales(true).filter(item => item.id !== rowId);
        renderExpoOtherSalesRows();
    }

    function renderExpoList() {
        const list = $("expoList");
        const empty = $("expoEmpty");

        const sortedExpos = [...expos].sort((a, b) =>
            String(b.date || "").localeCompare(String(a.date || ""))
        );

        if (sortedExpos.length === 0) {
            list.innerHTML = "";
            empty.style.display = "";
            return;
        }

        empty.style.display = "none";

        list.innerHTML = sortedExpos.map(expo => {
            const totals = F.getExpoTotals(expo, snakes);
            const salesRows = totals.sales.length > 0
                ? totals.sales.map(({ snake, sale }) => `
                    <li>
                        <span>${snakeLink(snake)}${sale.buyer ? ` <small>to ${escapeHtml(sale.buyer)}</small>` : ""}</span>
                        <strong>${formatMoney(sale.amount)}</strong>
                    </li>
                `).join("")
                : `<li class="fin-empty-line">No snakes are linked to this show yet. Set a snake's Sold At to this show on its record.</li>`;

            const otherSalesRows = totals.otherSales.length > 0
                ? `<p class="fin-muted expo-sales-head">Other sales</p>
                    <ul class="expo-sales-list">${totals.otherSales.map(item => `
                        <li>
                            <span>${escapeHtml(item.label || "Unnamed item")}</span>
                            <strong>${formatMoney(item.amount)}</strong>
                        </li>
                    `).join("")}</ul>`
                : "";

            const costLines = [
                { label: "Booth", amount: expo.boothCost },
                { label: "Travel", amount: expo.travelCost },
                { label: "Other costs", amount: expo.otherCost }
            ].filter(line => line.amount > 0)
                .map(line => `<span>${escapeHtml(line.label)} ${formatMoney(line.amount)}</span>`)
                .join("");

            return `
                <article class="expo-card" data-expo-card="${escapeHtml(expo.id)}">
                    <div class="expo-card-head">
                        <div>
                            <h4>${escapeHtml(expo.name)}</h4>
                            <p class="fin-muted">
                                ${formatExpoDates(expo)}
                                ${expo.location ? ` · ${escapeHtml(expo.location)}` : ""}
                            </p>
                        </div>

                        <div class="fin-actions">
                            <button type="button" class="small-link-button" data-expo-edit="${escapeHtml(expo.id)}">Edit</button>
                            <button type="button" class="fin-delete-button" data-expo-delete="${escapeHtml(expo.id)}">Delete</button>
                        </div>
                    </div>

                    <div class="expo-metrics">
                        <span><small>Snake sales</small><strong>${formatMoney(totals.snakeRevenue)}</strong></span>
                        <span><small>Other revenue</small><strong>${formatMoney(totals.otherRevenue)}</strong></span>
                        <span><small>Costs</small><strong>${formatMoney(totals.costs)}</strong></span>
                        <span><small>Net</small><strong class="${totals.net > 0 ? "fin-positive" : (totals.net < 0 ? "fin-negative" : "")}">${formatMoney(totals.net)}</strong></span>
                    </div>

                    <details class="expo-details">
                        <summary>Sold at this show (${totals.sales.length})${totals.costs > 0 ? ` · costs ${formatMoney(totals.costs)}` : ""}</summary>
                        <ul class="expo-sales-list">${salesRows}</ul>
                        ${otherSalesRows}
                        ${costLines ? `<p class="expo-costs">${costLines}</p>` : ""}
                        ${expo.notes ? `<p class="fin-muted">${escapeHtml(expo.notes)}</p>` : ""}
                    </details>
                </article>
            `;
        }).join("");
    }

    function resetExpoForm() {
        state.editingExpoId = "";

        ["expoNameInput", "expoLocationInput", "expoNotesInput", "expoBoothInput", "expoTravelInput",
            "expoOtherCostInput", "expoEndDateInput", "expoIdInput"].forEach(id => {
            const input = $(id);

            if (input) {
                input.value = "";
            }
        });

        const dateInput = $("expoDateInput");

        if (dateInput) {
            dateInput.value = F.getTodayText();
        }

        state.expoOtherSales = [];
        renderExpoOtherSalesRows();

        $("expoSubmitButton").textContent = "Add Show";
        $("expoCancelButton").style.display = "none";
        setStatus("expoStatus", "");
    }

    function fillExpoForm(expo) {
        state.editingExpoId = expo.id;

        $("expoIdInput").value = expo.id;
        $("expoNameInput").value = expo.name;
        $("expoDateInput").value = expo.date || "";
        $("expoEndDateInput").value = expo.endDate || "";
        $("expoLocationInput").value = expo.location || "";
        $("expoBoothInput").value = expo.boothCost > 0 ? expo.boothCost : "";
        $("expoTravelInput").value = expo.travelCost > 0 ? expo.travelCost : "";
        $("expoOtherCostInput").value = expo.otherCost > 0 ? expo.otherCost : "";
        $("expoNotesInput").value = expo.notes || "";

        // A show recorded before items existed keeps its single figure as one
        // named line, so editing it does not silently drop the money.
        state.expoOtherSales = expo.otherSales.length > 0
            ? expo.otherSales.map(item => ({ ...item }))
            : (expo.otherRevenue > 0
                ? [{ id: expoOtherSaleId(), label: "Other revenue", amount: expo.otherRevenue }]
                : []);
        renderExpoOtherSalesRows();

        $("expoSubmitButton").textContent = "Update Show";
        $("expoCancelButton").style.display = "";
        setStatus("expoStatus", "");
        $("expoForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function saveExpoFromForm(event) {
        event.preventDefault();

        const name = $("expoNameInput").value.trim();

        if (!name) {
            setStatus("expoStatus", "Give the show a name before saving.", true);
            $("expoNameInput").focus();
            return;
        }

        const date = $("expoDateInput").value;
        const endDate = $("expoEndDateInput").value;

        if (date && endDate && endDate < date) {
            setStatus("expoStatus", "The last day cannot be before the first day.", true);
            $("expoEndDateInput").focus();
            return;
        }

        const otherSales = readExpoOtherSales();
        const otherRevenue = Math.round(
            otherSales.reduce((sum, item) => sum + item.amount, 0) * 100
        ) / 100;

        const entry = {
            id: state.editingExpoId || F.createId("expo"),
            name,
            date,
            endDate,
            location: $("expoLocationInput").value.trim(),
            boothCost: F.toMoney($("expoBoothInput").value),
            travelCost: F.toMoney($("expoTravelInput").value),
            otherCost: F.toMoney($("expoOtherCostInput").value),
            // Kept alongside the itemised list so anything still reading the old
            // single figure (exports, older pages) shows the same total.
            otherRevenue,
            otherSales,
            notes: $("expoNotesInput").value.trim()
        };

        const nextExpos = state.editingExpoId
            ? expos.map(expo => (expo.id === state.editingExpoId ? entry : expo))
            : [...expos, entry];

        F.saveExpos(nextExpos);
        const wasEditing = Boolean(state.editingExpoId);
        loadAll();
        renderAll();
        resetExpoForm();
        setStatus("expoStatus", wasEditing ? "Show updated." : "Show added.");
    }

    function deleteExpo(expoId) {
        const expo = expos.find(item => item.id === expoId);

        if (!expo) {
            return;
        }

        if (!confirm(`Delete ${expo.name}? Snake sales stay in the ledger, but they will no longer be linked to this show.`)) {
            return;
        }

        F.saveExpos(expos.filter(item => item.id !== expoId));

        // Do not leave snakes pointing at a show that no longer exists.
        const currentSnakes = window.SnakeData.loadSnakesWithIds([]);
        let changed = false;

        currentSnakes.forEach(snake => {
            if (snake.saleExpoId === expoId) {
                delete snake.saleExpoId;
                changed = true;
            }
        });

        if (changed) {
            window.SnakeData.saveStorageArray("snakes", currentSnakes);
        }

        if (state.editingExpoId === expoId) {
            resetExpoForm();
        }

        loadAll();
        renderAll();
        setStatus("expoStatus", "Show removed. Its snake sales are still in the ledger.");
    }

    // ---- Other costs -------------------------------------------------------

    function renderExpenseCategoryOptions() {
        const select = $("expenseCategoryInput");

        if (!select) {
            return;
        }

        const categories = F.EXPENSE_CATEGORIES.filter(category => category.id !== "Feeders");

        select.innerHTML = categories.map(category =>
            `<option value="${escapeHtml(category.id)}">${escapeHtml(category.label)}</option>`
        ).join("");
    }

    function renderExpenses() {
        const rows = expenses
            .filter(expense => expense.category !== "Feeders")
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

        $("finExpensesBody").innerHTML = rows.map(expense => `
            <tr>
                <td>${formatDate(expense.date)}</td>
                <td>${escapeHtml(expense.category)}</td>
                <td>${escapeHtml(expense.vendor || "—")}</td>
                <td>${escapeHtml(expense.note || "—")}</td>
                <td class="fin-amount-cell">${formatMoney(expense.amount)}</td>
                <td class="fin-row-action">
                    <button type="button" class="fin-delete-button" data-delete-expense="${escapeHtml(expense.id)}"
                        title="Delete this cost">Delete</button>
                </td>
            </tr>
        `).join("");

        const total = rows.reduce((sum, expense) => sum + expense.amount, 0);

        $("finExpensesEmpty").style.display = rows.length === 0 ? "" : "none";
        $("finExpensesTotal").textContent = rows.length > 0
            ? `Total other costs: ${formatMoney(total)}`
            : "";
    }

    function saveFeederOrder(event) {
        event.preventDefault();

        const amount = F.toMoney($("feederOrderAmount").value);

        if (amount <= 0) {
            setStatus("finReport", "Enter an amount greater than zero for the feeder order.", true);
            $("feederOrderAmount").focus();
            return;
        }

        F.addExpense({
            date: $("feederOrderDate").value || F.getTodayText(),
            category: "Feeders",
            vendor: $("feederOrderVendor").value,
            amount,
            note: $("feederOrderNote").value
        });

        loadAll();
        renderAll();
        $("feederOrderVendor").value = "";
        $("feederOrderAmount").value = "";
        $("feederOrderNote").value = "";
        setStatus("finReport", "Feeder order added.");
    }

    function saveExpense(event) {
        event.preventDefault();

        const amount = F.toMoney($("expenseAmountInput").value);

        if (amount <= 0) {
            setStatus("finReport", "Enter an amount greater than zero for this cost.", true);
            $("expenseAmountInput").focus();
            return;
        }

        F.addExpense({
            date: $("expenseDateInput").value || F.getTodayText(),
            category: $("expenseCategoryInput").value,
            vendor: $("expenseVendorInput").value,
            amount,
            note: $("expenseNoteInput").value
        });

        loadAll();
        renderAll();
        $("expenseVendorInput").value = "";
        $("expenseAmountInput").value = "";
        $("expenseNoteInput").value = "";
        setStatus("finReport", "Cost added.");
    }

    function deleteExpense(expenseId) {
        const expense = expenses.find(item => item.id === expenseId);

        if (!expense) {
            return;
        }

        const label = expense.vendor || expense.category || "this cost";
        const stockNote = expense.category === "Feeders"
            && Array.isArray(expense.feederLines) && expense.feederLines.length > 0
            ? " The stock this order added stays in the freezer count; adjust it on the Feeders page if the order was a mistake."
            : "";

        if (!confirm(`Delete ${label} (${formatMoney(expense.amount)})?${stockNote}`)) {
            return;
        }

        F.removeExpense(expenseId);
        loadAll();
        renderAll();
        setStatus("finReport", "Cost deleted.");
    }

    // ---- Render all --------------------------------------------------------

    // ---- Holds -------------------------------------------------------------

    function renderHolds() {
        const body = $("finHoldsBody");
        const empty = $("finHoldsEmpty");
        const kpis = $("finHoldKpis");
        const helper = window.SaleHolds;

        if (!body || !helper) {
            return;
        }

        const summary = helper.listHolds(snakes, { graceDays: settings.holdGraceDays });

        body.innerHTML = summary.holds.map(({ snake, hold }) => {
            const dueText = hold.dueDate
                ? `${formatDate(hold.dueDate)}${helper.describeDays(hold.daysLeft) ? ` · ${helper.describeDays(hold.daysLeft)}` : ""}`
                : "—";
            const statusText = hold.expired
                ? '<span class="sale-badge sale-badge-expired">Hold expired</span>'
                : hold.overdue
                    ? '<span class="sale-badge sale-badge-overdue">Hold overdue</span>'
                    : hold.paymentPlan
                        ? '<span class="sale-badge sale-badge-hold">Payment plan</span>'
                        : '<span class="sale-badge sale-badge-hold">On hold</span>';
            const snakeId = escapeHtml(snake.id || "");

            return `
                <tr>
                    <td>${snakeLink(snake)}</td>
                    <td>${escapeHtml(hold.buyer || "Not recorded")}</td>
                    <td class="fin-amount-cell">${hold.hasPrice ? formatMoney(hold.agreedPrice) : "—"}</td>
                    <td class="fin-amount-cell">${hold.hasDeposit ? formatMoney(hold.deposit) : "—"}</td>
                    <td class="fin-amount-cell">${hold.hasPrice ? formatMoney(hold.balance) : "—"}</td>
                    <td>${dueText}</td>
                    <td>${statusText}</td>
                    <td class="fin-hold-actions">
                        <button type="button" class="fin-hold-action" data-extend-hold="${snakeId}">+${settings.holdGraceDays} days</button>
                        <button type="button" class="fin-hold-action" data-release-hold="${snakeId}">Release</button>
                    </td>
                </tr>
            `;
        }).join("");

        body.querySelectorAll("[data-extend-hold]").forEach(button => {
            button.addEventListener("click", () => extendSnakeHold(button.getAttribute("data-extend-hold")));
        });

        body.querySelectorAll("[data-release-hold]").forEach(button => {
            button.addEventListener("click", () => openReleaseHoldModal(button.getAttribute("data-release-hold")));
        });

        if (empty) {
            empty.style.display = summary.holds.length > 0 ? "none" : "";
        }

        if (kpis) {
            kpis.innerHTML = [
                {
                    label: "On hold",
                    value: String(summary.holds.length),
                    note: summary.expiredCount > 0
                        ? `${summary.expiredCount} expired · ${summary.overdueCount} past pickup`
                        : summary.overdueCount > 0
                            ? `${summary.overdueCount} past pickup`
                            : "No overdue pickups"
                },
                {
                    label: "Deposits received",
                    value: formatMoney(summary.depositTotal),
                    note: "Counted as money in until the snake sells"
                },
                {
                    label: "Balance due",
                    value: formatMoney(summary.balanceTotal),
                    note: "Across every active hold"
                }
            ].map(kpi => `
                <div class="fin-kpi">
                    <span class="fin-kpi-label">${escapeHtml(kpi.label)}</span>
                    <strong class="fin-kpi-value">${escapeHtml(kpi.value)}</strong>
                    <span class="fin-kpi-note">${escapeHtml(kpi.note)}</span>
                </div>
            `).join("");
        }
    }

    function findSnakeById(snakeId) {
        return snakes.find(snake => snake.id === snakeId) || null;
    }

    function updateReleaseDispositionFields() {
        const field = $("releaseTransferField");
        const note = $("releaseRefundNote");
        const selected = document.querySelector('input[name="releaseDisposition"]:checked');
        const disposition = selected ? selected.value : "forfeit";

        if (field) {
            field.hidden = disposition !== "transfer";
        }

        if (note) {
            note.hidden = disposition !== "return";
            note.textContent = "The deposit stays in the ledger as received, and a matching deposit refund is added as money out, so the pair nets to zero.";
        }
    }

    function openReleaseHoldModal(snakeId) {
        const snake = findSnakeById(snakeId);
        const helper = window.SaleHolds;
        const modal = $("releaseHoldModal");

        if (!snake || !helper || !modal) {
            return;
        }

        const hold = helper.getHold(snake, undefined, settings.holdGraceDays);

        if (!hold.active) {
            setStatus("finHoldsStatus", "That hold has already ended.", true);
            return;
        }

        state.releaseSnakeId = snake.id;

        const depositText = hold.hasDeposit
            ? `${formatMoney(hold.deposit)} deposit is on the ledger.`
            : "No deposit was recorded.";

        $("releaseHoldTitle").textContent = `Release hold \u2014 ${snake.name || "Unnamed snake"}`;
        $("releaseHoldText").textContent = `Held for ${hold.buyer || "no recorded buyer"}. ${depositText} Releasing sets the snake back to Available and keeps this hold in its history.`;
        $("releaseTransferInput").value = "";

        document.querySelectorAll('input[name="releaseDisposition"]').forEach(input => {
            input.checked = input.value === "forfeit";
        });

        updateReleaseDispositionFields();
        modal.style.display = "block";
    }

    function closeReleaseHoldModal() {
        const modal = $("releaseHoldModal");

        if (modal) {
            modal.style.display = "none";
        }

        state.releaseSnakeId = "";
    }

    function confirmReleaseHold() {
        const snake = findSnakeById(state.releaseSnakeId);
        const helper = window.SaleHolds;

        if (!snake || !helper) {
            closeReleaseHoldModal();
            return;
        }

        const selected = document.querySelector('input[name="releaseDisposition"]:checked');
        const disposition = selected ? selected.value : "forfeit";
        const transferTo = $("releaseTransferInput").value.trim();

        if (disposition === "transfer" && !transferTo) {
            alert("Say what the credit was transferred to, or choose another option.");
            $("releaseTransferInput").focus();
            return;
        }

        const hold = helper.getHold(snake, undefined, settings.holdGraceDays);
        const updated = helper.releaseHold(snake, {
            disposition,
            transferTo,
            today: F.getTodayText()
        });

        if (!updated) {
            closeReleaseHoldModal();
            setStatus("finHoldsStatus", "That hold has already ended.", true);
            return;
        }

        const index = snakes.findIndex(candidate => candidate.id === snake.id);

        if (index >= 0) {
            snakes[index] = updated;
        }

        window.SnakeData.saveStorageArray("snakes", snakes);
        closeReleaseHoldModal();
        loadAll();
        renderAll();

        const outcome = !hold.hasDeposit
            ? "No deposit was recorded."
            : disposition === "return"
                ? `The ${formatMoney(hold.deposit)} deposit was refunded in the ledger.`
                : disposition === "transfer"
                    ? `The ${formatMoney(hold.deposit)} deposit was marked transferred to ${transferTo}.`
                    : `The ${formatMoney(hold.deposit)} deposit was marked forfeited and stays counted as received.`;

        setStatus("finHoldsStatus", `${snake.name || "Snake"} is Available again. ${outcome}`);
    }

    function extendSnakeHold(snakeId) {
        const snake = findSnakeById(snakeId);
        const helper = window.SaleHolds;

        if (!snake || !helper) {
            return;
        }

        const updated = helper.extendHold(snake, {
            today: F.getTodayText(),
            days: settings.holdGraceDays
        });

        if (!updated) {
            setStatus("finHoldsStatus", "That hold has already ended.", true);
            return;
        }

        const index = snakes.findIndex(candidate => candidate.id === snake.id);

        if (index >= 0) {
            snakes[index] = updated;
        }

        window.SnakeData.saveStorageArray("snakes", snakes);
        loadAll();
        renderAll();
        setStatus("finHoldsStatus", `Hold for ${snake.name || "this snake"} extended to ${formatDate(updated.holdDueDate)}.`);
    }

    function renderHoldGraceSetting() {
        const input = $("holdGraceDaysInput");

        if (!input) {
            return;
        }

        input.value = String(settings.holdGraceDays);
    }

    function saveHoldGraceSetting(event) {
        if (event) {
            event.preventDefault();
        }

        const input = $("holdGraceDaysInput");
        const days = Number(input.value);

        if (!Number.isFinite(days)
            || Math.round(days) !== days
            || days < F.MIN_HOLD_GRACE_DAYS
            || days > F.MAX_HOLD_GRACE_DAYS) {
            setStatus(
                "holdGraceStatus",
                `Use a whole number from ${F.MIN_HOLD_GRACE_DAYS} to ${F.MAX_HOLD_GRACE_DAYS} days.`,
                true
            );
            input.focus();
            return;
        }

        F.saveSettings({ holdGraceDays: days });
        loadAll();
        renderAll();
        setStatus("holdGraceStatus", `Holds are flagged expired ${settings.holdGraceDays} days past pickup.`);
    }

    window.openReleaseHoldModal = openReleaseHoldModal;
    window.closeReleaseHoldModal = closeReleaseHoldModal;
    window.updateReleaseDispositionFields = updateReleaseDispositionFields;
    window.confirmReleaseHold = confirmReleaseHold;

    function renderAll() {
        renderYearOptions();
        renderOverview();
        renderSnakeLedger();
        renderHoldGraceSetting();
        renderHolds();
        renderFeederUsage();
        renderFeederOrders();
        renderExpoList();
        renderExpenses();
    }

    // ---- Init --------------------------------------------------------------

    function renderCurrencyOptions() {
        const select = $("finCurrencyInput");

        if (!select) {
            return;
        }

        select.innerHTML = F.CURRENCIES.map(code =>
            `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`
        ).join("");
        select.value = settings.currency;
    }

    function initDates() {
        const today = F.getTodayText();

        ["feederOrderDate", "expenseDateInput", "expoDateInput"].forEach(id => {
            const input = $(id);

            if (input) {
                input.value = today;
            }
        });
    }

    function bindEvents() {
        const tabRow = $("finTabRow");

        if (tabRow) {
            tabRow.addEventListener("click", event => {
                const button = event.target.closest("[data-fin-tab]");

                if (button) {
                    showTab(button.getAttribute("data-fin-tab"));
                }
            });
        }

        $("finCurrencyInput").addEventListener("change", event => {
            F.setCurrency(event.target.value);
            loadAll();
            renderAll();
            renderCurrencyOptions();
        });

        $("finYearSelect").addEventListener("change", event => {
            state.year = event.target.value;
            renderOverview();
        });

        $("saveFeederPricesButton").addEventListener("click", saveFeederPrices);

        $("addFeederTypeButton").addEventListener("click", addFeederType);

        $("newFeederTypeInput").addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                addFeederType();
            }
        });

        $("feederPriceRows").addEventListener("click", event => {
            const removeButton = event.target.closest("[data-remove-feeder-type]");

            if (removeButton) {
                removeFeederType(removeButton.getAttribute("data-remove-feeder-type"));
            }
        });

        // Prices read as money once the keeper leaves the field: 4 becomes 4.00.
        $("feederPriceRows").addEventListener("blur", event => {
            const input = event.target.closest("[data-feeder-size]");

            if (!input) {
                return;
            }

            const price = F.toMoney(input.value);
            input.value = price > 0 ? price.toFixed(2) : "";
        }, true);
        $("holdGraceForm").addEventListener("submit", saveHoldGraceSetting);
        $("feederOrderForm").addEventListener("submit", saveFeederOrder);
        $("expenseForm").addEventListener("submit", saveExpense);
        $("expoForm").addEventListener("submit", saveExpoFromForm);
        $("expoCancelButton").addEventListener("click", resetExpoForm);

        $("expoAddSaleButton").addEventListener("click", addExpoOtherSale);

        $("expoOtherSalesRows").addEventListener("click", event => {
            const removeButton = event.target.closest("[data-sale-remove]");

            if (removeButton) {
                removeExpoOtherSale(removeButton.getAttribute("data-sale-remove"));
            }
        });

        $("expoList").addEventListener("click", event => {
            const editButton = event.target.closest("[data-expo-edit]");
            const deleteButton = event.target.closest("[data-expo-delete]");

            if (editButton) {
                const expo = expos.find(item => item.id === editButton.getAttribute("data-expo-edit"));

                if (expo) {
                    fillExpoForm(expo);
                }
            }

            if (deleteButton) {
                deleteExpo(deleteButton.getAttribute("data-expo-delete"));
            }
        });

        [$("finFeederOrdersBody"), $("finExpensesBody")].forEach(container => {
            container.addEventListener("click", event => {
                const button = event.target.closest("[data-delete-expense]");

                if (button) {
                    deleteExpense(button.getAttribute("data-delete-expense"));
                }
            });
        });
    }

    function init() {
        const allowed = !window.SnakePlans || window.SnakePlans.allows("finance");
        const locked = $("financeLocked");
        const body = $("financeBody");

        if (!allowed) {
            const plan = window.SnakePlans ? window.SnakePlans.getPlan() : null;

            if (locked) {
                locked.style.display = "";
            }

            if (body) {
                body.style.display = "none";
            }

            if ($("financeLockedPlan") && plan) {
                $("financeLockedPlan").textContent =
                    `This account is on the ${plan.name} plan. Upgrading to Pro unlocks these tools — `
                    + "your collection, breeding records and snake pages keep working as they do now.";
            }

            return;
        }

        if (body) {
            body.style.display = "";
        }

        loadAll();
        renderCurrencyOptions();
        renderExpenseCategoryOptions();
        initDates();
        renderFeederPrices();
        renderAll();
        renderExpoOtherSalesRows();
        bindEvents();

        const hashTab = window.location.hash.replace("#", "");

        if (PANEL_NAMES.includes(hashTab)) {
            showTab(hashTab);
        } else {
            showTab("overview");
        }

        if ($("finReport")) {
            $("finReport").style.display = "none";
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
