// feeders.js
// The Feeders page: what the collection will eat, what is in the freezer, and
// what has to be ordered. Live and frozen are handled as two different jobs
// because they are: live feeders are bought for a feeding, frozen ones are
// stocked and counted down.

(function () {
    const F = window.SnakeFinance;
    const Feeders = window.SnakeFeeders;

    let snakes = [];
    let expenses = [];
    let forecast = null;
    let linesInitialized = false;
    let printCleanupTimer = null;

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
        if (F && typeof F.formatMoney === "function") {
            return F.formatMoney(value);
        }

        return `$${Number(value || 0).toFixed(2)}`;
    }

    function formatDate(value, withWeekday = false) {
        if (!value) {
            return "—";
        }

        const date = new Date(`${value}T00:00:00`);

        if (Number.isNaN(date.getTime())) {
            return escapeHtml(value);
        }

        return date.toLocaleDateString(undefined, withWeekday
            ? { weekday: "short", day: "numeric", month: "short" }
            : { day: "numeric", month: "short", year: "numeric" });
    }

    function formatShortDate(value) {
        return formatDate(value, true);
    }

    function describeDayDistance(dateText) {
        const days = Feeders.daysBetween(forecast.today, dateText);

        if (days === null) {
            return "";
        }

        if (days <= 0) {
            return "today";
        }

        if (days === 1) {
            return "tomorrow";
        }

        return `in ${days} days`;
    }

    function setStatus(id, message, isError = false) {
        const element = $(id);

        if (!element) {
            return;
        }

        element.textContent = message || "";
        element.classList.toggle("fin-error", Boolean(isError));
    }

    function report(message, isError = false) {
        const element = $("feederReport");

        if (!element) {
            return;
        }

        element.textContent = message || "";
        element.classList.toggle("import-error", Boolean(isError));
    }

    function activeSnakes() {
        return snakes.filter(snake => !window.SnakeData.isInactiveSnake(snake));
    }

    function load() {
        snakes = window.SnakeData.loadSnakesWithIds([]);
        expenses = F ? F.getExpenses() : [];
        forecast = Feeders.buildForecast({
            snakes,
            settings: Feeders.getSettings(),
            inventory: Feeders.getInventory()
        });
    }

    // ---- How you feed ------------------------------------------------------

    function renderMode() {
        const container = $("feederModeSegmented");

        if (!container) {
            return;
        }

        const mode = forecast.mode;

        container.innerHTML = Object.keys(Feeders.MODES).map(id => {
            const item = Feeders.MODES[id];
            const isActive = id === mode;

            return `
                <button type="button" data-feeder-mode="${escapeHtml(id)}"
                    class="${isActive ? "active" : ""}" aria-pressed="${isActive ? "true" : "false"}">
                    ${escapeHtml(item.label)}
                </button>
            `;
        }).join("");

        $("feederModeNote").textContent = Feeders.MODES[mode].description
            + " This is the default for every snake whose feeder size has no marker."
            + " A size like “Small Rat F/T” always draws from the freezer, even in Live mode,"
            + " and “Small Rat (live)” is bought fresh even in Frozen mode.";

        $("feederLeadNote").textContent = mode === "live"
            ? "The lead time decides when a live order shows as “buy now” before its feeding day. Three days is the minimum, so there is time to agree a pickup."
            : "An order is flagged this many days before stock runs out, so there is time to arrange a pickup. Three days is the minimum.";

        $("feederKpiMode").textContent = Feeders.MODES[mode].label;
        $("feederKpiModeNote").textContent = mode === "live"
            ? "Live sizes are bought for each feeding; sizes marked F/T still count down."
            : "Counts down as meals are logged.";
        $("feederKpiOrderLabel").textContent = mode === "live" && forecast.totals.frozenFeedings === 0
            ? "Buy now"
            : "To order";
    }

    function renderSettings() {
        const settings = forecast.settings;

        $("feederHorizonSelect").value = String(settings.horizonDays);
        $("feederLeadInput").value = String(settings.leadDays);
        $("feederWindowLabel").textContent =
            `${formatDate(forecast.today)} – ${formatDate(forecast.endDate)}`;
    }

    // ---- Forecast ----------------------------------------------------------

    function forecastSizes() {
        return forecast.sizes.filter(size => {
            if (size.need > 0) {
                return true;
            }

            // A stocked size still belongs on the table even with no meals in
            // the window: it is stock to count, not a size to order.
            if (size.kind === "frozen") {
                return (size.onHand !== null && size.onHand > 0) || size.keepAtLeast > 0;
            }

            return false;
        });
    }

    // A live and a frozen line can share a name, so the kind has to be visible
    // in the table rather than inferred from the collection's default.
    function kindTag(kind) {
        return `<span class="feeder-type-tag is-${kind}">${kind === "live" ? "Live" : "Frozen"}</span>`;
    }

    function describeSizeStatus(size) {
        if (size.kind === "live") {
            if (size.status === "order") {
                return {
                    tone: "order",
                    label: "Buy now",
                    detail: `${size.suggestedOrder} needed for ${formatShortDate(size.nextDate)}`
                };
            }

            if (size.nextDate) {
                return {
                    tone: "ok",
                    label: "Scheduled",
                    detail: `Next ${formatShortDate(size.nextDate)} · ${size.nextCount} needed`
                };
            }

            return { tone: "ok", label: "No feedings", detail: "No meals in this window" };
        }

        const detailParts = [];

        if (size.runsOutDate) {
            detailParts.push(size.daysUntilRunOut <= 0
                ? "Out of stock"
                : `Runs out ${formatShortDate(size.runsOutDate)}`);
        }

        if (size.orderByDate) {
            detailParts.push(size.orderNow
                ? "Order now"
                : `Order by ${formatDate(size.orderByDate)}`);
        } else if (size.onHand !== null && size.keepAtLeast > 0 && size.onHand < size.keepAtLeast) {
            detailParts.push(`Below the ${size.keepAtLeast} buffer`);
        } else if (size.need === 0) {
            detailParts.push("No meals in this window");
        }

        if (size.daysOfCover !== null) {
            detailParts.push(`${size.daysOfCover} days of cover`);
        }

        if (size.status === "order") {
            return {
                tone: "order",
                label: size.onHand <= 0 ? "Out of stock" : "Order now",
                detail: detailParts.join(" · ")
            };
        }

        if (size.status === "watch") {
            return {
                tone: "watch",
                label: "Running low",
                detail: detailParts.join(" · ")
            };
        }

        return {
            tone: "ok",
            label: size.need === 0 ? "No feedings" : "Covered",
            detail: detailParts.join(" · ") || "Stock covers this window"
        };
    }

    function statusChip(size) {
        const status = describeSizeStatus(size);

        return `<span class="feeder-status is-${status.tone}" title="${escapeHtml(status.detail)}">${escapeHtml(status.label)}</span>`;
    }

    function renderForecast() {
        const sizes = forecastSizes();
        const head = $("feederForecastHead");
        const body = $("feederForecastBody");
        const empty = $("feederForecastEmpty");

        // One table for both jobs: a live size is bought for its feeding day, a
        // frozen one is counted down from the freezer. Both can be in the same
        // size, so the kind is a chip in the size cell.
        head.innerHTML = `<tr>
                <th>Feeder size</th>
                <th>On hand</th>
                <th>Need in ${forecast.horizonDays} days</th>
                <th>Next feeding</th>
                <th>Order by</th>
                <th>Suggested order</th>
                <th>Status</th>
           </tr>`;

        if (sizes.length === 0) {
            body.innerHTML = "";
            empty.style.display = "";
            empty.textContent = "No feeder sizes or stock yet. Give a snake a feeder size, or log an order below.";
            renderForecastNotes();
            renderKpis();
            return;
        }

        empty.style.display = "none";

        body.innerHTML = sizes.map(size => {
            const nextText = size.nextDate
                ? `${formatShortDate(size.nextDate)} <small class="feeder-muted">${size.nextCount} needed</small>`
                : "—";
            const orderText = size.suggestedOrder > 0 ? `<strong>${size.suggestedOrder}</strong>` : "—";
            const sizeCell = `${escapeHtml(size.size)} ${kindTag(size.kind)}`;

            if (size.kind === "live") {
                return `
                    <tr>
                        <td>${sizeCell}</td>
                        <td>—</td>
                        <td>${size.need}</td>
                        <td>${nextText}</td>
                        <td>—</td>
                        <td>${orderText}</td>
                        <td>${statusChip(size)}</td>
                    </tr>
                `;
            }

            const orderByText = size.orderByDate
                ? (size.orderNow ? "Now" : formatDate(size.orderByDate))
                : "—";
            const keepNote = size.keepAtLeast > 0
                ? `<small class="feeder-muted">keep ${size.keepAtLeast}</small>`
                : "";

            return `
                <tr>
                    <td>${sizeCell}</td>
                    <td>${size.onHand === null ? "—" : `<strong>${size.onHand}</strong> ${keepNote}`}</td>
                    <td>${size.need}</td>
                    <td>${nextText}</td>
                    <td>${orderByText}${size.runsOutDate
                        ? `<small class="feeder-muted">runs out ${formatShortDate(size.runsOutDate)}</small>`
                        : ""}</td>
                    <td>${orderText}</td>
                    <td>${statusChip(size)}</td>
                </tr>
            `;
        }).join("");

        renderForecastNotes();
        renderKpis();
    }

    function summarizeNames(names, limit = 6) {
        if (!names || names.length === 0) {
            return "";
        }

        const shown = names.slice(0, limit).join(", ");
        const more = names.length - limit;

        return more > 0 ? `${shown} +${more} more` : shown;
    }

    function renderForecastNotes() {
        const notes = $("feederForecastNotes");
        const skipped = forecast.skipped;
        const lines = [];

        if (skipped.noFeederSize.length > 0) {
            lines.push(`<p><strong>No feeder size:</strong> ${escapeHtml(summarizeNames(skipped.noFeederSize))}. They are left out until a size is set.</p>`);
        }

        if (skipped.noFeedingDate.length > 0) {
            lines.push(`<p><strong>No last-fed date:</strong> ${escapeHtml(summarizeNames(skipped.noFeedingDate))}. Without a date there is no feeding schedule to forecast.</p>`);
        }

        if (skipped.onHold.length > 0) {
            lines.push(`<p><strong>On a feeding hold:</strong> ${escapeHtml(summarizeNames(skipped.onHold))}. Rightly left out of the forecast.</p>`);
        }

        if (skipped.inactive > 0) {
            lines.push(`<p class="feeder-muted">${skipped.inactive} inactive or sold record${skipped.inactive === 1 ? "" : "s"} ignored.</p>`);
        }

        if (forecast.events.length > 0) {
            lines.push(`<p class="feeder-muted">Projection uses each snake's feeding interval, starting from its last fed date. An overdue snake is counted from today.</p>`);
        }

        notes.innerHTML = lines.join("");
    }

    function renderKpis() {
        const totals = forecast.totals;
        const next = forecast.events[0] || null;
        // A live line only carries a suggested order once it is inside the
        // buy-now window, so the same test covers both kinds.
        const orderSizes = forecast.sizes.filter(size => size.suggestedOrder > 0);

        $("feederKpiFeedings").textContent = String(totals.feedings);
        $("feederKpiFeedingsNote").textContent = totals.feedings === 0
            ? "Nothing scheduled in this window."
            : `From ${totals.snakes} scheduled snake${totals.snakes === 1 ? "" : "s"} and ${totals.sizes} size${totals.sizes === 1 ? "" : "s"} in ${forecast.horizonDays} days. Each snake is counted once per feeding interval.`;

        if (next) {
            const sizesThatDay = [...new Set(forecast.events
                .filter(event => event.date === next.date)
                .map(event => event.size))];

            $("feederKpiNext").textContent = formatShortDate(next.date);
            $("feederKpiNextNote").textContent =
                `${forecast.events.filter(event => event.date === next.date).length} meal${forecast.events.filter(event => event.date === next.date).length === 1 ? "" : "s"} · ${sizesThatDay.join(", ")}`;
        } else {
            $("feederKpiNext").textContent = "—";
            $("feederKpiNextNote").textContent = "No feeding scheduled yet.";
        }

        $("feederKpiOrder").textContent = String(orderSizes.length);
        $("feederKpiOrderNote").textContent = orderSizes.length > 0
            ? summarizeNames(orderSizes.map(size =>
                size.kind === "live" ? `${size.size} (live)` : size.size
            ), 4)
            : "Nothing needs buying or ordering right now.";
    }

    // ---- Freezer stock -----------------------------------------------------

    function stockSizes() {
        const sizes = new Map();

        function add(size) {
            const clean = String(size || "").trim();

            if (clean && !sizes.has(clean.toLowerCase())) {
                sizes.set(clean.toLowerCase(), clean);
            }
        }

        Feeders.getInventory().forEach(row => add(row.size));
        // Only the sizes that actually come out of a freezer belong here: a live
        // feeder is bought for its feeding day and never stocked. "Small Rat
        // F/T" is the freezer row "Small Rat", not a second size.
        activeSnakes()
            .filter(snake => Feeders.getFeederKind(snake.feederSize) === "frozen")
            .forEach(snake => add(Feeders.parseFeederSize(snake.feederSize).base));

        return [...sizes.values()].sort((a, b) => a.localeCompare(b));
    }

    function renderStock() {
        const section = $("feederStockSection");

        if (!section) {
            return;
        }

        // Freezer stock is worth counting even when most of the collection eats
        // live: the snakes marked F/T still draw from it.
        section.style.display = "";

        const inventory = Feeders.getInventory();
        const sizes = stockSizes();
        const body = $("feederStockBody");
        const empty = $("feederStockEmpty");

        $("feederStockSummary").textContent = `${forecast.totals.onHand} on hand across ${inventory.filter(row => row.onHand > 0).length} size${inventory.filter(row => row.onHand > 0).length === 1 ? "" : "s"}`;

        if (sizes.length === 0) {
            body.innerHTML = "";
            empty.style.display = "";
            empty.textContent = "No feeder sizes yet. Give a snake a feeder size, or log a frozen order below.";
            return;
        }

        empty.style.display = "none";

        body.innerHTML = sizes.map(size => {
            const row = Feeders.findInventoryRow(inventory, size) || { size, onHand: 0, reorderAt: 0 };
            const forecastSize = forecast.sizes.find(item =>
                item.kind === "frozen" && item.size.toLowerCase() === row.size.toLowerCase()
            );
            const status = forecastSize
                ? statusChip(forecastSize)
                : `<span class="feeder-status is-ok" title="No meals in this window">Unused</span>`;

            return `
                <tr data-stock-row data-size="${escapeHtml(row.size)}">
                    <td>${escapeHtml(row.size)}</td>
                    <td>
                        <input class="feeder-stock-input" type="number" min="0" step="1"
                            inputmode="numeric" data-stock-onhand value="${row.onHand}"
                            aria-label="${escapeHtml(row.size)} on hand">
                    </td>
                    <td>
                        <input class="feeder-stock-input" type="number" min="0" step="1"
                            inputmode="numeric" data-stock-keep value="${row.reorderAt}"
                            aria-label="${escapeHtml(row.size)} keep at least">
                    </td>
                    <td>${status}</td>
                </tr>
            `;
        }).join("");
    }

    function saveStock() {
        const rows = document.querySelectorAll("[data-stock-row]");
        let changed = 0;

        if (rows.length === 0) {
            setStatus("feederStockStatus", "No feeder sizes to save yet.", true);
            return;
        }

        rows.forEach(row => {
            const size = row.getAttribute("data-size");
            const onHandInput = row.querySelector("[data-stock-onhand]");
            const keepInput = row.querySelector("[data-stock-keep]");

            Feeders.setStock(
                size,
                onHandInput ? onHandInput.value : 0,
                keepInput ? keepInput.value : 0
            );
            changed += 1;
        });

        load();
        renderAll();
        setStatus("feederStockStatus", `Saved stock for ${changed} feeder size${changed === 1 ? "" : "s"}.`);
    }

    // ---- Feeding plan ------------------------------------------------------

    function renderPlan() {
        const container = $("feederPlanList");
        const empty = $("feederPlanEmpty");
        const events = forecast.events;

        const mealCount = forecast.totals.feedings;
        const snakeCount = forecast.totals.snakes;

        const liveMeals = forecast.totals.liveFeedings || 0;
        const frozenMeals = forecast.totals.frozenFeedings || 0;

        $("feederPlanLead").textContent = mealCount === 0
            ? "Every meal inside the forecast window will be grouped here by feeding day."
            : `${mealCount} meal${mealCount === 1 ? "" : "s"} across ${snakeCount} scheduled snake${snakeCount === 1 ? "" : "s"} in this window, grouped by feeding day. `
                + (liveMeals > 0 && frozenMeals > 0
                    ? "Live feeders are bought for that day; freezer-fed meals count down stock."
                    : (liveMeals > 0
                        ? "Buy the quantity shown for that day."
                        : "These are the meals that count down freezer stock."));

        if (events.length === 0) {
            container.innerHTML = "";
            empty.style.display = "";
            empty.textContent = "No feedings in this window yet. Set a feeder size and last-fed date on each snake.";
            return;
        }

        empty.style.display = "none";

        const days = new Map();

        events.forEach(event => {
            if (!days.has(event.date)) {
                days.set(event.date, new Map());
            }

            const sizes = days.get(event.date);
            // A live and a frozen "Small Rat" are two separate jobs on the day.
            const key = `${event.kind}|${event.size}`;
            const current = sizes.get(key) || { size: event.size, kind: event.kind, count: 0, snakes: [] };

            current.count += 1;
            current.snakes.push(event.snakeName);
            sizes.set(key, current);
        });

        const dayList = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const visible = dayList.slice(0, 12);

        container.innerHTML = visible.map(([date, sizes]) => {
            const items = [...sizes.values()]
                .sort((a, b) => a.size.localeCompare(b.size) || a.kind.localeCompare(b.kind))
                .map(item => `
                    <span class="feeder-plan-item">
                        <strong>${item.count}×</strong> ${escapeHtml(item.size)} ${kindTag(item.kind)}
                        <small>${escapeHtml(summarizeNames(item.snakes, 4))}</small>
                    </span>
                `).join("");
            const kinds = new Set([...sizes.values()].map(item => item.kind));
            const action = kinds.size > 1
                ? "Freezer + fresh"
                : (kinds.has("live") ? "Buy fresh" : "From freezer");

            return `
                <div class="feeder-plan-day">
                    <div class="feeder-plan-date">
                        <strong>${formatShortDate(date)}</strong>
                        <span>${describeDayDistance(date)}</span>
                    </div>
                    <div class="feeder-plan-sizes">${items}</div>
                    <span class="feeder-plan-action">${action}</span>
                </div>
            `;
        }).join("") + (dayList.length > visible.length
            ? `<p class="empty-message">Showing the first ${visible.length} of ${dayList.length} feeding days in this window.</p>`
            : "");
    }

    // ---- Shopping list -----------------------------------------------------

    function getFeederPrice(size) {
        if (!F || typeof F.getSettings !== "function") {
            return 0;
        }

        const prices = F.getSettings().feederPrices || {};
        const clean = String(size || "").toLowerCase();
        const key = Object.keys(prices).find(name => name.toLowerCase() === clean);

        return key ? F.toMoney(prices[key]) : 0;
    }

    function getShoppingItems() {
        return forecast.sizes
            .filter(size => size.suggestedOrder > 0 && size.status !== "ok")
            .sort((a, b) => a.size.localeCompare(b.size) || a.kind.localeCompare(b.kind))
            .map(size => {
                const price = getFeederPrice(size.size);
                let when = "";

                if (size.kind === "live") {
                    when = `For ${formatShortDate(size.nextDate)}`;
                } else if (size.status === "order") {
                    when = "Order now";
                } else if (size.orderByDate) {
                    when = `Order by ${formatShortDate(size.orderByDate)}`;
                } else {
                    when = `Keep at least ${size.keepAtLeast}`;
                }

                return {
                    size: size.size,
                    kind: size.kind,
                    quantity: size.suggestedOrder,
                    when,
                    cost: Math.round(price * size.suggestedOrder * 100) / 100
                };
            });
    }

    function renderShoppingList() {
        const list = $("feederShoppingList");
        const empty = $("feederShoppingEmpty");
        const note = $("feederShoppingNote");
        const totalLine = $("feederShoppingTotal");
        const copyButton = $("copyFeederShoppingListButton");
        const printButton = $("printFeederShoppingListButton");

        if (!list || !empty || !note || !copyButton) {
            return;
        }

        const items = getShoppingItems();
        const pricedItems = items.filter(item => item.cost > 0);
        const total = pricedItems.reduce((sum, item) => sum + item.cost, 0);
        const hasLive = items.some(item => item.kind === "live");
        const hasFrozen = items.some(item => item.kind === "frozen");
        const liveOnly = hasLive && !hasFrozen;

        note.textContent = hasLive && hasFrozen
            ? "Live lines are bought for their feeding day; frozen lines cover the forecast window plus your keep-at-least buffer."
            : (liveOnly
                ? "Live feeders are bought for the feeding day. Copy the quantities below and take the list with you."
                : "Quantities cover the forecast window plus your keep-at-least buffer. Copy the list for a supplier.");

        copyButton.disabled = items.length === 0;
        copyButton.title = liveOnly ? "Copy live feeding list" : "Copy feeder shopping list";

        if (printButton) {
            printButton.disabled = items.length === 0;
            printButton.title = liveOnly ? "Print live feeding list" : "Print feeder shopping list";
        }

        renderPrintSheet(items);

        if (items.length === 0) {
            list.innerHTML = "";
            empty.style.display = "";
            empty.textContent = forecast.totals.liveFeedings > 0 && forecast.totals.frozenFeedings === 0
                ? "No live feeders are needed for the next feeding day."
                : "Nothing to buy right now. Freezer stock covers the forecast window.";
            totalLine.textContent = "";
            totalLine.style.display = "none";
            return;
        }

        empty.style.display = "none";
        list.innerHTML = items.map(item => `
            <li class="feeder-shopping-item">
                <span class="feeder-shopping-qty">${item.quantity}&times;</span>
                <span class="feeder-shopping-size">${escapeHtml(item.size)} ${kindTag(item.kind)}</span>
                <span class="feeder-shopping-when">${escapeHtml(item.when)}</span>
                <span class="feeder-shopping-cost">${item.cost > 0 ? formatMoney(item.cost) : ""}</span>
            </li>
        `).join("");

        if (pricedItems.length > 0) {
            totalLine.textContent = `Estimated cost${pricedItems.length < items.length ? " for priced sizes" : ""}: ${formatMoney(total)}`;
            totalLine.style.display = "";
        } else {
            totalLine.textContent = "";
            totalLine.style.display = "none";
        }
    }

    // The print sheet is a separate body child, so printing the list never
    // depends on the dark app layout. It is hidden on screen and only the
    // Print button reveals it through the body class below.
    function renderPrintSheet(items) {
        const sheet = $("feederPrintSheet");

        if (!sheet) {
            return;
        }

        if (items.length === 0) {
            sheet.innerHTML = "";
            return;
        }

        const hasLive = items.some(item => item.kind === "live");
        const hasFrozen = items.some(item => item.kind === "frozen");
        const liveOnly = hasLive && !hasFrozen;
        const pricedItems = items.filter(item => item.cost > 0);
        const hasPrices = pricedItems.length > 0;
        const pricedTotal = pricedItems.reduce((sum, item) => sum + item.cost, 0);
        const title = liveOnly ? "Live Feeding List" : "Feeder Shopping List";
        const dateColumn = liveOnly ? "Feed day" : "Order by";
        const listNote = hasLive && hasFrozen
            ? "Live lines are bought for their feeding day; frozen quantities cover the forecast window and your keep-at-least buffer."
            : (liveOnly
                ? "Buy fresh; live feeders are not stocked."
                : "Quantities cover the forecast window and your keep-at-least buffer.");
        const priceNote = hasPrices && pricedItems.length < items.length
            ? " Estimated cost covers priced sizes only."
            : "";

        sheet.innerHTML = `
            <header class="feeder-print-head">
                <h1>${title}</h1>
                <p>${formatDate(forecast.today)} \u00b7 The Snake Room</p>
            </header>

            <table class="feeder-print-table">
                <thead>
                    <tr>
                        <th class="feeder-print-checkcol"></th>
                        <th>Qty</th>
                        <th>Feeder size</th>
                        <th>${dateColumn}</th>
                        ${hasPrices ? "<th class=\"feeder-print-cost\">Est.</th>" : ""}
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => `
                        <tr>
                            <td class="feeder-print-checkcell"><span class="feeder-print-check"></span></td>
                            <td class="feeder-print-qty">${item.quantity}&times;</td>
                            <td>${escapeHtml(item.size)}${item.kind === "live" ? " (live)" : ""}</td>
                            <td>${escapeHtml(item.when)}</td>
                            ${hasPrices ? `<td class="feeder-print-cost">${item.cost > 0 ? formatMoney(item.cost) : ""}</td>` : ""}
                        </tr>
                    `).join("")}
                </tbody>
                ${hasPrices ? `
                    <tfoot>
                        <tr class="feeder-print-total">
                            <td></td>
                            <td colspan="3">Estimated cost</td>
                            <td class="feeder-print-cost">${formatMoney(pricedTotal)}</td>
                        </tr>
                    </tfoot>
                ` : ""}
            </table>

            <p class="feeder-print-note">
                ${listNote}
                ${priceNote}
            </p>

            <div class="feeder-print-lines">
                <p><span>Supplier:</span><span class="feeder-print-blank"></span></p>
                <p><span>Order date:</span><span class="feeder-print-blank"></span></p>
                <p><span>Notes:</span><span class="feeder-print-blank"></span></p>
            </div>
        `;
    }

    function printShoppingList() {
        const items = getShoppingItems();

        if (items.length === 0) {
            return;
        }

        renderPrintSheet(items);
        document.body.classList.add("printing-feeder-list");

        const cleanup = () => {
            document.body.classList.remove("printing-feeder-list");
            window.clearTimeout(printCleanupTimer);
        };

        window.addEventListener("afterprint", cleanup, { once: true });

        try {
            window.print();
        } finally {
            printCleanupTimer = window.setTimeout(cleanup, 2000);
        }
    }

    function buildShoppingListText() {
        const items = getShoppingItems();

        if (items.length === 0) {
            return "";
        }

        const liveOnly = items.some(item => item.kind === "live")
            && !items.some(item => item.kind === "frozen");
        const lines = [
            `${liveOnly ? "Live feeding list" : "Feeder shopping list"} — ${formatDate(forecast.today)}`
        ];
        let hasCost = false;

        items.forEach(item => {
            const costPart = item.cost > 0 ? ` — ${formatMoney(item.cost)}` : "";
            const name = item.kind === "live" ? `${item.size} (live)` : item.size;

            if (item.cost > 0) {
                hasCost = true;
            }

            lines.push(`${item.quantity} × ${name} — ${item.when}${costPart}`);
        });

        if (hasCost) {
            const total = items.reduce((sum, item) => sum + item.cost, 0);

            lines.push(`Estimated cost: ${formatMoney(total)}`);
        }

        return lines.join("\n");
    }

    async function copyTextToClipboard(value) {
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                await navigator.clipboard.writeText(value);
                return true;
            }
        } catch (error) {
            // Fall through to the textarea copy below.
        }

        try {
            const area = document.createElement("textarea");

            area.value = value;
            area.setAttribute("readonly", "");
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            const copied = document.execCommand("copy");

            area.remove();

            return copied;
        } catch (error) {
            return false;
        }
    }

    async function copyShoppingList() {
        const text = buildShoppingListText();

        if (!text) {
            return;
        }

        const copied = await copyTextToClipboard(text);

        setStatus(
            "feederShoppingStatus",
            copied ? "List copied to the clipboard." : "Could not copy automatically. Select the list text and copy it.",
            !copied
        );
    }

    // ---- One order this week -----------------------------------------------

    function getWeeklyOrder() {
        return Feeders.buildWeeklyOrder({ forecast, days: 7 });
    }

    function getLastFeederVendor() {
        const last = expenses
            .filter(expense => expense.category === "Feeders" && String(expense.vendor || "").trim())
            .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")))[0];

        return last ? String(last.vendor).trim() : "";
    }

    // Whoever this week's message is addressed to: a supplier typed into the
    // order form wins, otherwise the last supplier actually used.
    function getWeeklyVendor() {
        const input = $("feederOrderVendor");
        const typed = input ? String(input.value || "").trim() : "";

        return typed || getLastFeederVendor();
    }

    function getWeeklyOrderCost(order) {
        return order.lines.reduce((sum, line) => sum + getFeederPrice(line.size) * line.quantity, 0);
    }

    // One trip covers every size, so the dealer only needs the earliest
    // “last useful day” on the order.
    function getWeeklyCollectBy(order) {
        const dates = order.lines
            .map(line => line.collectBy)
            .filter(Boolean)
            .sort();

        return dates[0] || "";
    }

    // A pickup window only exists while there is still stock to feed; once a
    // size has already run out the useful message is urgency, not a date.
    function getWeeklyPickup(order) {
        const collectBy = getWeeklyCollectBy(order);
        const stillCovered = collectBy && collectBy > forecast.today;

        return {
            collectBy,
            dateText: stillCovered ? formatShortDate(collectBy) : "",
            urgent: Boolean(collectBy) && !stillCovered
        };
    }

    function getWeeklyMessageText(order) {
        const cost = getWeeklyOrderCost(order);
        const pickup = getWeeklyPickup(order);

        return Feeders.formatWeeklyOrderText(order, {
            supplier: getWeeklyVendor(),
            costText: cost > 0 ? formatMoney(Math.round(cost * 100) / 100) : "",
            collectByText: pickup.dateText,
            urgentPickup: pickup.urgent
        });
    }

    function renderWeeklyOrder() {
        const order = getWeeklyOrder();
        const list = $("feederWeeklyList");
        const note = $("feederWeeklyNote");
        const windowLabel = $("feederWeeklyWindow");
        const totalLine = $("feederWeeklyTotal");
        const fillButton = $("fillWeeklyOrderButton");
        const copyButton = $("copyWeeklyOrderButton");
        const message = $("feederWeeklyMessage");

        if (!list || !note || !fillButton || !copyButton) {
            return;
        }

        const cost = getWeeklyOrderCost(order);
        const messageText = getWeeklyMessageText(order);

        if (message) {
            message.textContent = messageText;
            message.hidden = !messageText;
        }

        windowLabel.textContent = order.endDate
            ? `${formatShortDate(order.today)} \u2013 ${formatShortDate(order.endDate)}`
            : "";

        if (order.sizes === 0) {
            list.innerHTML = "";
            totalLine.textContent = "";
            note.textContent = "Nothing needs ordering this week. The forecast below will show the next size to re-order.";
            fillButton.disabled = true;
            copyButton.disabled = true;
            return;
        }

        // Frozen quantities are the whole forecast window plus the buffer, so
        // say that plainly: 13 feeders for one week of meals would be wrong.
        // Live quantities are only the feeding days inside this week.
        const hasFrozenLines = order.lines.some(line => line.kind === "frozen");
        const hasLiveLines = order.lines.some(line => line.kind === "live");
        const coverage = hasFrozenLines
            ? ` Frozen amounts cover the full ${forecast.horizonDays}-day forecast, not just this week.`
            : "";
        const liveCoverage = hasLiveLines
            ? " Live amounts are the feeders needed on the feeding days in this week."
            : "";

        const pickup = getWeeklyPickup(order);
        const pickupNote = pickup.collectBy
            ? pickup.dateText
                ? ` Collection day can move - the last useful day is ${pickup.dateText}.`
                : " Some sizes are already out, so collect as soon as you can."
            : "";

        note.textContent = `${order.sizes} feeder size${order.sizes === 1 ? "" : "s"} `
            + `(${order.totalQuantity} feeders) due by ${formatShortDate(order.endDate)}. `
            + `One supplier run covers the whole week.${coverage}${liveCoverage}${pickupNote}`;

        list.innerHTML = order.lines.map(line => `
            <li class="feeder-weekly-line">
                <span class="feeder-weekly-qty">${line.quantity}</span>
                <span class="feeder-weekly-size">${escapeHtml(line.size)} ${kindTag(line.kind)}</span>
                <span class="feeder-weekly-when">
                    ${line.status === "order"
                        ? "Order now"
                        : `Order by ${formatShortDate(line.neededBy)}`}
                    ${line.collectBy
                        ? `<span class="feeder-weekly-pickup">${line.collectBy > forecast.today
                            ? `Pick up by ${formatShortDate(line.collectBy)}`
                            : "None left"}</span>`
                        : ""}
                </span>
            </li>
        `).join("");

        totalLine.textContent = cost > 0
            ? `Estimated cost: ${formatMoney(Math.round(cost * 100) / 100)} using your saved feeder prices.`
            : "Add feeder prices in Finances to estimate this order.";

        fillButton.disabled = false;
        copyButton.disabled = false;
    }

    function fillWeeklyOrder() {
        const order = getWeeklyOrder();
        const container = $("feederOrderLines");

        if (!container || order.sizes === 0) {
            setStatus("feederWeeklyStatus", "Nothing needs ordering this week.", true);
            return;
        }

        container.innerHTML = "";
        order.lines.forEach(line => addOrderLine({
            size: orderLineSize(line.size, line.kind),
            quantity: line.quantity
        }));
        linesInitialized = true;

        $("feederOrderDate").value = Feeders.todayText();

        const vendor = getLastFeederVendor();

        if (vendor && !$("feederOrderVendor").value.trim()) {
            $("feederOrderVendor").value = vendor;
        }

        setStatus(
            "feederWeeklyStatus",
            `Put ${order.lines.length} size${order.lines.length === 1 ? "" : "s"} into the order log with these amounts. `
            + "Change them to what actually arrives, then save."
        );

        $("feederOrderForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function copyWeeklyOrder() {
        const order = getWeeklyOrder();

        if (order.sizes === 0) {
            return;
        }

        const text = getWeeklyMessageText(order);
        const copied = await copyTextToClipboard(text);

        setStatus(
            "feederWeeklyStatus",
            copied
                ? "Text order copied. Paste it into your message to the supplier."
                : "Could not copy automatically. Select the text order above and copy it.",
            !copied
        );
    }

    // ---- Orders ------------------------------------------------------------

    function renderSizeOptions() {
        const datalist = $("feederSizeOptions");

        if (!datalist) {
            return;
        }

        const sizes = Feeders.collectSizes(activeSnakes(), Feeders.getInventory(), true);

        datalist.innerHTML = sizes
            .map(size => `<option value="${escapeHtml(size)}"></option>`)
            .join("");
    }

    // A live line is written with its marker so the order itself records that
    // no freezer stock came out of it, even when frozen is the default.
    function orderLineSize(size, kind) {
        return kind === "live" ? `${size} (live)` : size;
    }

    function addOrderLine(defaults = {}) {
        const container = $("feederOrderLines");

        if (!container) {
            return;
        }

        const row = document.createElement("div");

        row.className = "feeder-order-line";
        row.setAttribute("data-order-line", "");
        row.innerHTML = `
            <input type="text" list="feederSizeOptions" data-order-size
                placeholder="Feeder size" value="${escapeHtml(defaults.size || "")}"
                aria-label="Feeder size">
            <input type="number" min="1" step="1" inputmode="numeric" data-order-qty
                placeholder="Qty" value="${escapeHtml(defaults.quantity || "")}"
                aria-label="Quantity">
            <button type="button" class="fin-delete-button" data-remove-order-line>Remove</button>
        `;
        container.appendChild(row);
    }

    function firstSuggestedSize() {
        return forecast.sizes.find(size => size.status === "order" && size.suggestedOrder > 0)
            || forecast.sizes.find(size => size.suggestedOrder > 0)
            || forecast.sizes[0]
            || null;
    }

    function resetOrderLines() {
        const container = $("feederOrderLines");
        const suggested = firstSuggestedSize();

        if (!container) {
            return;
        }

        container.innerHTML = "";
        addOrderLine({
            size: suggested ? orderLineSize(suggested.size, suggested.kind) : "",
            quantity: suggested && suggested.suggestedOrder > 0 ? suggested.suggestedOrder : ""
        });
        linesInitialized = true;
    }

    function renderOrderForm() {
        const hasLive = forecast.sizes.some(size => size.kind === "live");
        const hasFrozen = forecast.sizes.some(size => size.kind === "frozen");

        $("feederOrderModeNote").textContent = hasLive && hasFrozen
            ? "Frozen lines add to freezer stock and record the cost in Finances; lines marked live are recorded in Finances only."
            : (hasFrozen
                ? "Saving this order adds the quantities to freezer stock and records the cost in Finances."
                : "Live feeders are bought for a feeding, so this order is recorded in Finances but does not add to freezer stock.");

        if (!linesInitialized) {
            resetOrderLines();
        }
    }

    function readOrderLines() {
        return [...document.querySelectorAll("[data-order-line]")]
            .map(row => {
                const sizeInput = row.querySelector("[data-order-size]");
                const quantityInput = row.querySelector("[data-order-qty]");
                const size = sizeInput ? sizeInput.value.trim() : "";
                const quantity = quantityInput ? parseInt(quantityInput.value, 10) : 0;

                return {
                    size,
                    quantity: Number.isNaN(quantity) ? 0 : quantity
                };
            })
            .filter(line => line.size && line.quantity > 0);
    }

    function saveOrder(event) {
        event.preventDefault();

        const lines = readOrderLines();

        if (lines.length === 0) {
            setStatus("feederOrderStatus", "Add at least one feeder size and quantity.", true);
            return;
        }

        if (!F) {
            setStatus("feederOrderStatus", "The money helpers did not load, so the order cannot be saved.", true);
            return;
        }

        const amount = F.toMoney($("feederOrderAmount").value);
        const note = $("feederOrderNote").value.trim();
        const lineNote = lines
            .map(line => `${line.quantity} × ${line.size}`)
            .join(", ");

        // Each line says how it is fed: a marked F/T or live size decides for
        // itself. An unmarked size follows the forecast line for that size, and
        // only then the collection's default.
        const stockLines = [];
        const liveLines = [];

        lines.forEach(line => {
            const parsed = Feeders.parseFeederSize(line.size);
            const base = parsed.base.toLowerCase();
            const frozenLine = forecast.sizes.some(size =>
                size.kind === "frozen" && size.size.toLowerCase() === base
            );
            const kind = parsed.kind
                || (frozenLine || forecast.mode === "frozen" ? "frozen" : "live");

            if (kind === "frozen") {
                Feeders.addStock(line.size, line.quantity);
                stockLines.push(line);
            } else {
                liveLines.push(line);
            }
        });

        const orderKind = stockLines.length === 0
            ? "live"
            : (liveLines.length === 0 ? "frozen" : forecast.mode);

        F.addExpense({
            date: $("feederOrderDate").value || Feeders.todayText(),
            category: "Feeders",
            vendor: $("feederOrderVendor").value,
            amount,
            note: [lineNote, note].filter(Boolean).join(" · "),
            feederType: orderKind,
            feederLines: lines
        });

        load();
        renderSizeOptions();
        renderAll();

        $("feederOrderVendor").value = "";
        $("feederOrderAmount").value = "";
        $("feederOrderNote").value = "";
        resetOrderLines();

        const stockNote = stockLines.length > 0
            ? ` Added ${stockLines.map(line => `${line.quantity} ${line.size}`).join(", ")} to freezer stock.`
            : "";
        const liveNote = liveLines.length > 0
            ? ` Recorded ${liveLines.map(line => `${line.quantity} ${line.size}`).join(", ")} as live feeders, so no stock was added.`
            : "";

        setStatus("feederOrderStatus", `Order saved.${stockNote}${liveNote}`);
        report(`Feeder order saved.${stockNote}${liveNote}`);
    }

    function renderOrders() {
        const list = $("feederOrderList");
        const empty = $("feederOrderEmpty");
        const orders = expenses
            .filter(expense => expense.category === "Feeders")
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
            .slice(0, 12);

        if (orders.length === 0) {
            list.innerHTML = "";
            empty.style.display = "";
            return;
        }

        empty.style.display = "none";

        list.innerHTML = orders.map(expense => {
            const lines = Array.isArray(expense.feederLines) && expense.feederLines.length > 0
                ? expense.feederLines.map(line => `${line.quantity} × ${line.size}`).join(", ")
                : "";
            const detail = lines || expense.note || "No sizes recorded";
            const type = expense.feederType === "live" || expense.feederType === "frozen"
                ? expense.feederType
                : "";

            return `
                <div class="feeder-order-row">
                    <div class="feeder-order-when">
                        <strong>${formatDate(expense.date)}</strong>
                        <span>${escapeHtml(expense.vendor || "No supplier")}</span>
                    </div>
                    <div class="feeder-order-detail">${escapeHtml(detail)}</div>
                    ${type ? `<span class="feeder-type-tag is-${type}">${type === "live" ? "Live" : "Frozen"}</span>` : ""}
                    <strong class="feeder-order-amount">${expense.amount > 0 ? formatMoney(expense.amount) : "No cost"}</strong>
                </div>
            `;
        }).join("");
    }

    // ---- Wiring ------------------------------------------------------------

    function renderAll() {
        renderSettings();
        renderMode();
        renderForecast();
        renderShoppingList();
        renderWeeklyOrder();
        renderStock();
        renderPlan();
        renderSizeOptions();
        renderOrderForm();
        renderOrders();
    }

    function saveMode(mode) {
        if (!Feeders.MODES[mode]) {
            return;
        }

        Feeders.saveSettings({ mode });
        load();
        renderAll();
        report(mode === "frozen"
            ? "Frozen mode: orders add to freezer stock and meals count it down. Sizes marked live are still bought fresh."
            : "Live mode: feeders are bought for each feeding day. Sizes marked F/T still draw from freezer stock.");
    }

    function bindEvents() {
        $("feederModeSegmented").addEventListener("click", event => {
            const button = event.target.closest("[data-feeder-mode]");

            if (button) {
                saveMode(button.getAttribute("data-feeder-mode"));
            }
        });

        $("feederHorizonSelect").addEventListener("change", event => {
            Feeders.saveSettings({ horizonDays: Number(event.target.value) });
            load();
            renderAll();
        });

        $("feederLeadInput").addEventListener("change", event => {
            Feeders.saveSettings({ leadDays: Number(event.target.value) });
            load();
            renderAll();
        });

        $("saveFeederStockButton").addEventListener("click", saveStock);
        $("copyFeederShoppingListButton").addEventListener("click", copyShoppingList);
        $("printFeederShoppingListButton").addEventListener("click", printShoppingList);

        $("addFeederOrderLineButton").addEventListener("click", () => addOrderLine());
        $("fillWeeklyOrderButton").addEventListener("click", fillWeeklyOrder);
        $("copyWeeklyOrderButton").addEventListener("click", copyWeeklyOrder);

        // The message starts with the supplier's name, so keep it in step with
        // whatever is typed into the order form.
        $("feederOrderVendor").addEventListener("input", () => {
            if (forecast) {
                renderWeeklyOrder();
            }
        });

        $("feederOrderLines").addEventListener("click", event => {
            const button = event.target.closest("[data-remove-order-line]");

            if (!button) {
                return;
            }

            const rows = document.querySelectorAll("[data-order-line]");

            if (rows.length <= 1) {
                const row = button.closest("[data-order-line]");
                const sizeInput = row.querySelector("[data-order-size]");
                const quantityInput = row.querySelector("[data-order-qty]");

                if (sizeInput) {
                    sizeInput.value = "";
                }

                if (quantityInput) {
                    quantityInput.value = "";
                }

                return;
            }

            button.closest("[data-order-line]").remove();
        });

        $("feederOrderForm").addEventListener("submit", saveOrder);
    }

    function init() {
        if (!Feeders) {
            return;
        }

        $("feederOrderDate").value = Feeders.todayText();
        load();
        bindEvents();
        renderAll();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
