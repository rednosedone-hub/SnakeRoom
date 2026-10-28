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
        editingExpoId: ""
    };

    let snakes = [];
    let expenses = [];
    let expos = [];
    let events = [];
    let settings = F.getSettings();

    const PANEL_NAMES = ["overview", "snakes", "feeders", "expos", "costs"];

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
            ? "No sales recorded yet."
            : `${revenueCount} sale${revenueCount === 1 ? "" : "s"} recorded.`;

        $("finSpendNote").textContent = spendCount === 0
            ? "No costs recorded yet."
            : `${spendCount} cost${spendCount === 1 ? "" : "s"} recorded.`;

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

        const inOrder = ["snake-sale", "show-revenue"];
        const outOrder = ["snake-purchase", "feeders", "show-cost", "supplies", "vet", "shipping", "other"];
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
            .filter(item => item.sale.recorded)
            .sort((a, b) => String(b.sale.date || "").localeCompare(String(a.sale.date || "")));
    }

    function snakeLink(snake) {
        return `<a href="${snakeProfileUrl(snake)}">${escapeHtml(snake.name || "Unnamed snake")}</a>`;
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
            F.getSnakeSale(snake).recorded && !F.isMarkedSold(snake)
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
                <p><strong>${saleWithoutSoldStatus.length} sale${saleWithoutSoldStatus.length === 1 ? " is" : "s are"} recorded but the snake is not marked Sold:</strong>
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

            return `
                <label class="feeder-price-row" for="${escapeHtml(inputId)}">
                    <span>${escapeHtml(size)}</span>
                    <input type="number" min="0" step="0.01" id="${escapeHtml(inputId)}"
                        data-feeder-size="${escapeHtml(size)}"
                        value="${price ? escapeHtml(String(price)) : ""}"
                        placeholder="0.00">
                </label>
            `;
        }).join("");
    }

    function saveFeederPrices() {
        const prices = {};

        document.querySelectorAll("[data-feeder-size]").forEach(input => {
            const size = input.getAttribute("data-feeder-size");
            const price = F.toMoney(input.value);

            if (size && price > 0) {
                prices[size] = price;
            }
        });

        F.saveSettings({ feederPrices: prices });
        loadAll();
        renderFeederPrices();
        renderOverview();
        renderFeederUsage();
        setStatus("feederPriceStatus", prices && Object.keys(prices).length > 0
            ? `Saved ${Object.keys(prices).length} feeder price${Object.keys(prices).length === 1 ? "" : "s"}.`
            : "Prices cleared.");
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

        note.textContent = notes.join(" ");
    }

    function renderFeederOrders() {
        const orders = expenses
            .filter(expense => expense.category === "Feeders")
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

        $("finFeederOrdersBody").innerHTML = orders.map(expense => `
            <tr>
                <td>${formatDate(expense.date)}</td>
                <td>${escapeHtml(expense.vendor || "—")}</td>
                <td>${escapeHtml(expense.note || "—")}</td>
                <td class="fin-amount-cell">${formatMoney(expense.amount)}</td>
                <td class="fin-row-action">
                    <button type="button" class="fin-delete-button" data-delete-expense="${escapeHtml(expense.id)}"
                        title="Delete this feeder order">Delete</button>
                </td>
            </tr>
        `).join("");

        const total = orders.reduce((sum, expense) => sum + expense.amount, 0);

        $("finFeederOrdersEmpty").style.display = orders.length === 0 ? "" : "none";
        $("finFeederOrdersTotal").textContent = orders.length > 0
            ? `Total feeder orders: ${formatMoney(total)}`
            : "";
    }

    // ---- Shows -------------------------------------------------------------

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
                                ${expo.date ? formatDate(expo.date) : "Date not set"}
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
            "expoOtherCostInput", "expoOtherRevenueInput", "expoIdInput"].forEach(id => {
            const input = $(id);

            if (input) {
                input.value = "";
            }
        });

        const dateInput = $("expoDateInput");

        if (dateInput) {
            dateInput.value = F.getTodayText();
        }

        $("expoSubmitButton").textContent = "Add Show";
        $("expoCancelButton").style.display = "none";
        setStatus("expoStatus", "");
    }

    function fillExpoForm(expo) {
        state.editingExpoId = expo.id;

        $("expoIdInput").value = expo.id;
        $("expoNameInput").value = expo.name;
        $("expoDateInput").value = expo.date || "";
        $("expoLocationInput").value = expo.location || "";
        $("expoBoothInput").value = expo.boothCost > 0 ? expo.boothCost : "";
        $("expoTravelInput").value = expo.travelCost > 0 ? expo.travelCost : "";
        $("expoOtherCostInput").value = expo.otherCost > 0 ? expo.otherCost : "";
        $("expoOtherRevenueInput").value = expo.otherRevenue > 0 ? expo.otherRevenue : "";
        $("expoNotesInput").value = expo.notes || "";

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

        const entry = {
            id: state.editingExpoId || F.createId("expo"),
            name,
            date: $("expoDateInput").value,
            location: $("expoLocationInput").value.trim(),
            boothCost: F.toMoney($("expoBoothInput").value),
            travelCost: F.toMoney($("expoTravelInput").value),
            otherCost: F.toMoney($("expoOtherCostInput").value),
            otherRevenue: F.toMoney($("expoOtherRevenueInput").value),
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

    function renderAll() {
        renderYearOptions();
        renderOverview();
        renderSnakeLedger();
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
        $("feederOrderForm").addEventListener("submit", saveFeederOrder);
        $("expenseForm").addEventListener("submit", saveExpense);
        $("expoForm").addEventListener("submit", saveExpoFromForm);
        $("expoCancelButton").addEventListener("click", resetExpoForm);

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
