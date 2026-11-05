// season-review.js
// The Season Review page. Everything numeric comes from SeasonReview.review(),
// so the verdict, the KPIs and the tables can never disagree.
//
// Money is optional: the breeding half works on the Breeder plan, while the
// cash half needs the Pro money tools. Both read the same season.

(function () {
    const F = window.SnakeFinance;
    const R = window.SeasonReview;

    if (!R) {
        return;
    }

    const state = { year: "" };

    const data = {
        snakes: [],
        clutches: [],
        expenses: [],
        expos: [],
        settings: { currency: "CAD", feederPrices: {} }
    };

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

    // A parent or hatchling name that opens that animal's record. The label is
    // escaped here so callers only pass raw names.
    function snakeLink(id, name) {
        const label = escapeHtml(name || "Unnamed");
        const snake = (data.snakes || []).find(item => String(item.id || "") === String(id || ""));

        if (!id || !snake) {
            return label;
        }

        return `<a class="snake-link" href="${escapeHtml(window.SnakeData.getSnakeProfileUrl(snake))}">${label}</a>`;
    }

    // "Nova x Atlas" with each name linking to its own card; falls back to the
    // plain label when an old clutch has no parent ids on record.
    function clutchPair(clutch) {
        if (!clutch.femaleId && !clutch.maleId) {
            return escapeHtml(clutch.pair);
        }

        return `${snakeLink(clutch.femaleId, clutch.femaleName || "Unknown")} x ${snakeLink(clutch.maleId, clutch.maleName || "Unknown")}`;
    }

    function formatMoney(value) {
        if (F && F.formatMoney) {
            return F.formatMoney(value, data.settings.currency);
        }

        return `$${(Number(value) || 0).toFixed(2)}`;
    }

    function formatDate(value, short = false) {
        if (!value) {
            return "—";
        }

        const date = new Date(`${value}T00:00:00`);

        if (Number.isNaN(date.getTime())) {
            return escapeHtml(value);
        }

        return date.toLocaleDateString(undefined, short
            ? { month: "short", day: "numeric" }
            : { year: "numeric", month: "short", day: "numeric" });
    }

    function loadAll() {
        data.snakes = window.SnakeData.loadSnakesWithIds([]);
        data.clutches = window.SnakeData.readStorageArray("clutches", []);

        if (F) {
            data.expenses = F.getExpenses();
            data.expos = F.getExpos();
            data.settings = F.getSettings();
        }
    }

    function requestedYear() {
        const param = Number(new URLSearchParams(window.location.search).get("year"));

        return Number.isFinite(param) && param > 0 ? param : "";
    }

    // ---- Rendering ---------------------------------------------------------

    function renderYearOptions(years, year) {
        const select = $("seasonYearSelect");

        if (!select) {
            return;
        }

        select.innerHTML = years
            .map(value => `<option value="${value}">${value} season</option>`)
            .join("");
        select.value = String(year);
    }

    function renderVerdict(result) {
        const element = $("seasonVerdict");

        if (!element) {
            return;
        }

        const copy = R.verdict(result, { formatMoney });

        element.className = `season-verdict season-verdict-${copy.tone}`;
        element.innerHTML = `
            <h4>${escapeHtml(copy.headline)}</h4>
            <p>${escapeHtml(copy.detail)}</p>
        `;
    }

    function renderKpis(result) {
        const element = $("seasonKpis");
        const totals = result.totals;
        const counts = totals.counts;
        const money = result.money;
        const hatchBits = [
            totals.hatchRate === null ? "" : `${totals.hatchRate}% of completed eggs`,
            totals.waiting > 0 ? `${totals.waiting} clutch${totals.waiting === 1 ? "" : "es"} still incubating` : ""
        ].filter(Boolean);
        const hatchNote = hatchBits.length > 0 ? hatchBits.join(" \u00b7 ") : "No hatched clutch yet";
        const kpis = [
            { label: "Clutches", value: String(totals.clutches), note: `${totals.waiting} still incubating` },
            { label: "Eggs", value: String(totals.eggs), note: totals.unhatched > 0 ? `${totals.unhatched} did not hatch` : "No unhatched eggs" },
            { label: "Hatchlings", value: String(totals.hatched), note: hatchNote },
            {
                label: "Kept back",
                value: String(counts.retained),
                note: `${counts.retained > 0
                    ? "Marked Holdback or Breeder"
                    : "None marked yet"}`
            },
            {
                label: "Still in the room",
                value: String(result.liveHatchlings),
                note: `${counts.forSale} for sale · ${counts.growing} growing out`
            },
            {
                label: "Sold",
                value: String(counts.sold),
                note: totals.saleCount > 0 ? `${formatMoney(totals.revenue)} in sales` : "No sales recorded"
            }
        ];

        if (money) {
            const hasCash = money.revenueCount + money.spendCount > 0;

            kpis.push({
                label: "Cash this year",
                value: formatMoney(money.net),
                note: !hasCash
                    ? "No money recorded this year"
                    : (money.net < 0 ? "Money out minus money in" : "Money in minus money out")
            });
        }

        if (!element) {
            return;
        }

        element.innerHTML = kpis.map(kpi => `
            <div class="fin-kpi">
                <span class="fin-kpi-label">${escapeHtml(kpi.label)}</span>
                <strong class="fin-kpi-value">${escapeHtml(kpi.value)}</strong>
                <span class="fin-kpi-note">${escapeHtml(kpi.note)}</span>
            </div>
        `).join("");
    }

    function renderClutches(result) {
        const body = $("seasonClutchBody");
        const empty = $("seasonClutchEmpty");

        if (!body) {
            return;
        }

        body.innerHTML = result.clutches.map(clutch => {
            const hatched = clutch.isHatched
                ? `${formatDate(clutch.hatchedDate || clutch.laidDate, true)}${clutch.hatchRate === null ? "" : ` (${clutch.hatchRate}%)`}`
                : "Incubating";

            return `
                <tr>
                    <td><strong>${escapeHtml(clutch.id || "Clutch")}</strong></td>
                    <td>${clutchPair(clutch)}</td>
                    <td>${formatDate(clutch.laidDate, true)}</td>
                    <td>${hatched}</td>
                    <td class="fin-amount-cell">${clutch.eggs}</td>
                    <td class="fin-amount-cell">${clutch.isHatched ? clutch.hatched : "—"}</td>
                    <td class="fin-amount-cell">${clutch.counts.retained}</td>
                    <td class="fin-amount-cell">${clutch.counts.sold}</td>
                    <td class="fin-amount-cell">${clutch.revenue > 0 ? formatMoney(clutch.revenue) : "—"}</td>
                </tr>
            `;
        }).join("");

        const cards = $("seasonClutchCards");

        if (cards) {
            cards.innerHTML = result.clutches.map(clutch => {
                const dates = clutch.isHatched
                    ? `Laid ${formatDate(clutch.laidDate, true)} \u00b7 Hatched ${formatDate(clutch.hatchedDate || clutch.laidDate, true)}${clutch.hatchRate === null ? "" : ` (${clutch.hatchRate}%)`}`
                    : `Laid ${formatDate(clutch.laidDate, true)} \u00b7 Incubating`;
                const counts = [
                    `${clutch.eggs} egg${clutch.eggs === 1 ? "" : "s"}`,
                    clutch.isHatched ? `${clutch.hatched} hatchling${clutch.hatched === 1 ? "" : "s"}` : "",
                    `${clutch.counts.retained} kept`,
                    `${clutch.counts.sold} sold`
                ].filter(Boolean).join(" \u00b7 ");

                return `
                    <div class="season-clutch-card">
                        <div class="season-clutch-card-head">
                            <strong>${escapeHtml(clutch.id || "Clutch")}</strong>
                            <span>${clutchPair(clutch)}</span>
                        </div>
                        <p>${dates}</p>
                        <p>${counts}</p>
                        ${clutch.revenue > 0 ? `<p class="season-clutch-card-sales">${formatMoney(clutch.revenue)} in sales</p>` : ""}
                    </div>
                `;
            }).join("");
        }

        if (empty) {
            empty.hidden = result.clutches.length > 0;
        }
    }

    function renderDisposition(result) {
        const element = $("seasonDisposition");
        const empty = $("seasonDispositionEmpty");

        if (!element) {
            return;
        }

        const items = result.disposition.map(group => `
            <div class="season-disposition-item">
                <strong>${group.count}</strong>
                <span>${escapeHtml(group.label)}</span>
                <p>${escapeHtml(group.note)}</p>
            </div>
        `);

        if (result.totals.unhatched > 0) {
            items.push(`
                <div class="season-disposition-item season-disposition-loss">
                    <strong>${result.totals.unhatched}</strong>
                    <span>Eggs not hatched</span>
                    <p>Counted from hatched clutches only. Eggs still incubating are not losses.</p>
                </div>
            `);
        }

        element.innerHTML = items.join("");

        if (empty) {
            empty.hidden = result.totals.hatched > 0;
        }
    }

    function renderKept(result) {
        const body = $("seasonKeptBody");
        const empty = $("seasonKeptEmpty");

        if (!body) {
            return;
        }

        body.innerHTML = result.kept.map(hatchling => `
            <tr>
                <td>${snakeLink(hatchling.id, hatchling.name)}</td>
                <td>${escapeHtml(hatchling.morph || "—")}</td>
                <td>${escapeHtml(hatchling.sex)}</td>
                <td>${formatDate(hatchling.hatchDate, true)}</td>
                <td>${escapeHtml(hatchling.status)}</td>
                <td>${escapeHtml(hatchling.bin || "—")}</td>
            </tr>
        `).join("");

        if (empty) {
            empty.hidden = result.kept.length > 0;
        }
    }

    function canUseMoney() {
        return !window.SnakePlans || window.SnakePlans.allows("finance");
    }

    function renderMoney(result) {
        const locked = $("seasonMoneyLocked");
        const body = $("seasonMoneyBody");

        if (!canUseMoney()) {
            if (locked) {
                locked.hidden = false;
            }

            if (body) {
                body.hidden = true;
            }

            return;
        }

        if (locked) {
            locked.hidden = true;
        }

        if (body) {
            body.hidden = false;
        }

        const money = result.money;

        if (!money) {
            return;
        }

        const kpiGrid = $("seasonMoneyKpis");
        const breakdown = $("seasonMoneyBreakdown");
        const empty = $("seasonMoneyEmpty");
        const breakEven = $("seasonBreakEven");
        const breakEvenNote = $("seasonBreakEvenNote");
        const rows = money.rows.filter(row => row.in > 0 || row.out > 0);

        if (kpiGrid) {
            kpiGrid.innerHTML = [
                { label: "Money in", value: money.revenue, note: `${money.revenueCount} entr${money.revenueCount === 1 ? "y" : "ies"}` },
                { label: "Money out", value: money.spend, note: `${money.spendCount} entr${money.spendCount === 1 ? "y" : "ies"}` },
                { label: "Net", value: money.net, note: `${result.year} cash result` },
                { label: "Feeder cost used", value: money.feederEstimate, note: "Estimated from feeder prices" }
            ].map(kpi => `
                <div class="fin-kpi${kpi.label === "Net" ? " fin-kpi-net" : ""}">
                    <span class="fin-kpi-label">${escapeHtml(kpi.label)}</span>
                    <strong class="fin-kpi-value">${formatMoney(kpi.value)}</strong>
                    <span class="fin-kpi-note">${escapeHtml(kpi.note)}</span>
                </div>
            `).join("");
        }

        if (breakdown) {
            breakdown.innerHTML = rows.map(row => `
                <tr>
                    <td>${escapeHtml(row.label)}</td>
                    <td class="fin-amount-cell">${row.in > 0 ? formatMoney(row.in) : "—"}</td>
                    <td class="fin-amount-cell">${row.out > 0 ? formatMoney(row.out) : "—"}</td>
                </tr>
            `).join("");
        }

        if (empty) {
            empty.hidden = rows.length > 0;
        }

        if (breakEven) {
            const hasCash = money.revenueCount + money.spendCount > 0;

            breakEven.textContent = !hasCash
                ? `No cash is recorded for ${result.year} yet, so there is no break-even price to work out.`
                : (result.breakEven === null
                    ? "No animal from this season is still in the room, so there is no price to carry forward."
                    : `If the ${result.liveHatchlings} animal${result.liveHatchlings === 1 ? "" : "s"} still in the room from this season covered this year's cash out, they would need to average ${formatMoney(result.breakEven)} each.`);
        }

        if (breakEvenNote) {
            breakEvenNote.textContent = [
                `Cash out covers the whole collection for ${result.year}, not only these clutches, so this is a break-even price, not a valuation.`,
                money.sales > 0 ? `${formatMoney(money.sales)} of the money in came from snake sales.` : "",
                "An asking price on an Available animal is not a sale and stays out until the animal is marked Sold or given a sale date.",
                result.totals.soldWithoutPrice > 0
                    ? `${result.totals.soldWithoutPrice} animal${result.totals.soldWithoutPrice === 1 ? " is" : "s are"} marked Sold without a sale price, so the sales figure is low.`
                    : ""
            ].filter(Boolean).join(" ");
        }
    }

    function render() {
        const result = R.review({
            snakes: data.snakes,
            clutches: data.clutches,
            expenses: data.expenses,
            expos: data.expos,
            feederPrices: data.settings.feederPrices,
            year: state.year,
            includeMoney: canUseMoney()
        });

        state.year = String(result.year);

        renderYearOptions(result.years, result.year);
        renderVerdict(result);
        renderKpis(result);
        renderClutches(result);
        renderDisposition(result);
        renderKept(result);
        renderMoney(result);
    }

    function setYear(year) {
        state.year = String(year);
        history.replaceState(null, "", `?year=${encodeURIComponent(state.year)}`);
        render();
    }

    function init() {
        loadAll();
        state.year = requestedYear();

        const select = $("seasonYearSelect");

        if (select) {
            select.addEventListener("change", event => setYear(event.target.value));
        }

        render();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
