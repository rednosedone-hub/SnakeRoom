// buyer-helpers.js
// The buyer side of the ledger: contacts, where each buyer came from, what they
// have bought, what they still have on hold, and a printable statement.
//
// Sales and holds already carry a buyer name. This file matches those names to
// directory records instead of introducing a second, half-linked copy of the
// same person. Adding an old name to the directory immediately links the sales
// and holds that were already recorded under it.
//
// Everything except the buyer CRUD helpers is pure: pass snakes in, get plain
// objects back.

(function () {
    const STORAGE_KEY = "buyers";
    const UNKNOWN_SOURCE = "unknown";
    const UNLINKED_SOURCE = "unlinked";

    // The places a buyer can first find the room. "Other" keeps the list honest
    // without pretending every future channel is known today.
    const BUYER_SOURCES = [
        { id: "expo", label: "Expo / show" },
        { id: "morphmarket", label: "MorphMarket" },
        { id: "website", label: "Website" },
        { id: "word-of-mouth", label: "Word of mouth" },
        { id: "kijiji", label: "Kijiji" },
        { id: "facebook", label: "Facebook" },
        { id: "instagram", label: "Instagram" },
        { id: "other", label: "Other" }
    ];

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function cleanName(value) {
        return text(value).replace(/\s+/g, " ");
    }

    function normalizeName(value) {
        return cleanName(value).toLowerCase();
    }

    function roundMoney(value) {
        return Math.round((Number(value) || 0) * 100) / 100;
    }

    function todayText() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function createBuyerId() {
        return `buyer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function normalizeSource(value) {
        const key = text(value).toLowerCase();

        if (key === UNKNOWN_SOURCE || key === UNLINKED_SOURCE) {
            return key;
        }

        const byId = BUYER_SOURCES.find(source => source.id === key);

        if (byId) {
            return byId.id;
        }

        const byLabel = BUYER_SOURCES.find(source => source.label.toLowerCase() === key);

        return byLabel ? byLabel.id : UNKNOWN_SOURCE;
    }

    function sourceLabel(value) {
        const key = normalizeSource(value);

        if (key === UNLINKED_SOURCE) {
            return "Not in directory";
        }

        if (key === UNKNOWN_SOURCE) {
            return "Not recorded";
        }

        const source = BUYER_SOURCES.find(item => item.id === key);

        return source ? source.label : "Not recorded";
    }

    function sanitizeBuyer(buyer) {
        if (!buyer || typeof buyer !== "object") {
            return null;
        }

        const name = cleanName(buyer.name);

        if (!name) {
            return null;
        }

        return {
            id: text(buyer.id) || createBuyerId(),
            name,
            email: text(buyer.email),
            phone: text(buyer.phone),
            source: normalizeSource(buyer.source),
            sourceDetail: text(buyer.sourceDetail),
            notes: text(buyer.notes),
            createdAt: text(buyer.createdAt).slice(0, 10) || todayText(),
            updatedAt: text(buyer.updatedAt).slice(0, 10) || todayText()
        };
    }

    function readBuyers() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));

            return Array.isArray(raw)
                ? raw.map(sanitizeBuyer).filter(Boolean)
                : [];
        } catch (error) {
            return [];
        }
    }

    function getBuyers() {
        return readBuyers();
    }

    function saveBuyers(buyers) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(
            (Array.isArray(buyers) ? buyers : []).map(sanitizeBuyer).filter(Boolean)
        ));
    }

    function findBuyerByName(buyers, name) {
        const target = normalizeName(name);

        if (!target) {
            return null;
        }

        return (buyers || []).find(buyer => normalizeName(buyer.name) === target) || null;
    }

    function findBuyerById(buyers, id) {
        return (buyers || []).find(buyer => buyer.id === id) || null;
    }

    function addBuyer(draft = {}) {
        const name = cleanName(draft.name);

        if (!name) {
            return { buyer: null, error: "A buyer needs a name." };
        }

        const buyers = readBuyers();

        if (findBuyerByName(buyers, name)) {
            return { buyer: null, error: "A buyer with that name is already in the directory." };
        }

        const buyer = sanitizeBuyer({
            id: createBuyerId(),
            name,
            email: draft.email,
            phone: draft.phone,
            source: draft.source,
            sourceDetail: draft.sourceDetail,
            notes: draft.notes,
            createdAt: todayText(),
            updatedAt: todayText()
        });

        buyers.push(buyer);
        saveBuyers(buyers);

        return { buyer, error: "" };
    }

    function updateBuyer(id, patch = {}) {
        const buyers = readBuyers();
        const index = buyers.findIndex(buyer => buyer.id === id);

        if (index < 0) {
            return { buyer: null, error: "That buyer is no longer in the directory." };
        }

        const current = buyers[index];
        const name = patch.name === undefined ? current.name : cleanName(patch.name);

        if (!name) {
            return { buyer: null, error: "A buyer needs a name." };
        }

        const duplicate = buyers.find(buyer =>
            buyer.id !== id && normalizeName(buyer.name) === normalizeName(name)
        );

        if (duplicate) {
            return { buyer: null, error: "A buyer with that name is already in the directory." };
        }

        const next = sanitizeBuyer({
            ...current,
            ...patch,
            id: current.id,
            name,
            createdAt: current.createdAt,
            updatedAt: todayText()
        });

        buyers[index] = next;
        saveBuyers(buyers);

        return { buyer: next, error: "" };
    }

    function removeBuyer(id) {
        const buyers = readBuyers();
        const next = buyers.filter(buyer => buyer.id !== id);

        if (next.length === buyers.length) {
            return false;
        }

        saveBuyers(next);
        return true;
    }

    // ---- Sales and holds ---------------------------------------------------

    function getSaleRecord(snake) {
        if (!snake) {
            return null;
        }

        const finance = window.SnakeFinance;
        const markedSold = text(snake.status) === "Sold";
        let amount = roundMoney(snake.salePrice);
        let date = text(snake.saleDate).slice(0, 10);
        // A price alone is an asking price, not a sale.
        let realized = markedSold || Boolean(date);

        if (finance && finance.getSnakeSale) {
            const sale = finance.getSnakeSale(snake);

            amount = roundMoney(sale.amount);
            date = text(sale.date).slice(0, 10);
            realized = finance.isRealizedSale
                ? finance.isRealizedSale(snake) || markedSold
                : Boolean(date) || markedSold;
        }

        return realized ? { amount, date, markedSold } : null;
    }

    function matchesBuyer(name, buyer) {
        return Boolean(buyer) && normalizeName(name) === normalizeName(buyer.name);
    }

    function getHoldForSnake(snake, options) {
        return window.SaleHolds && window.SaleHolds.getHold
            ? window.SaleHolds.getHold(snake, options.today, options.graceDays)
            : null;
    }

    function summarizeBuyer(buyer, snakes, options = {}) {
        if (!buyer) {
            return null;
        }

        const purchases = [];
        const activeHolds = [];
        const releasedHolds = [];

        (snakes || []).forEach(snake => {
            const sale = getSaleRecord(snake);

            if (sale && matchesBuyer(snake.soldTo, buyer)) {
                purchases.push({ snake, sale });
            }

            const hold = getHoldForSnake(snake, options);

            if (hold && hold.active && matchesBuyer(hold.buyer, buyer)) {
                activeHolds.push({ snake, hold });
            }

            (Array.isArray(snake.holdHistory) ? snake.holdHistory : []).forEach(entry => {
                if (entry && matchesBuyer(entry.buyer, buyer)) {
                    releasedHolds.push({ snake, entry });
                }
            });
        });

        purchases.sort((left, right) => String(right.sale.date || "").localeCompare(String(left.sale.date || "")));
        activeHolds.sort((left, right) => String(left.hold.dueDate || "9999").localeCompare(String(right.hold.dueDate || "9999")));
        releasedHolds.sort((left, right) => String(right.entry.releasedDate || "").localeCompare(String(left.entry.releasedDate || "")));

        const totalSpent = roundMoney(purchases.reduce((sum, item) => sum + item.sale.amount, 0));
        const depositTotal = roundMoney(activeHolds.reduce((sum, item) => sum + item.hold.deposit, 0));
        const balanceTotal = roundMoney(activeHolds.reduce((sum, item) => sum + item.hold.balance, 0));
        const lastSaleDate = purchases.length > 0 ? String(purchases[0].sale.date || "") : "";
        const activityDates = [
            lastSaleDate,
            ...activeHolds.map(item => item.hold.depositDate),
            ...releasedHolds.map(item => item.entry.releasedDate)
        ].filter(Boolean).sort();

        return {
            buyer,
            purchases,
            activeHolds,
            releasedHolds,
            purchaseCount: purchases.length,
            totalSpent,
            activeHoldCount: activeHolds.length,
            depositTotal,
            balanceTotal,
            lastSaleDate,
            lastActivity: activityDates[activityDates.length - 1] || ""
        };
    }

    function getSales(snakes) {
        return (snakes || [])
            .map(snake => ({ snake, sale: getSaleRecord(snake) }))
            .filter(item => item.sale);
    }

    // First-touch attribution: a repeat buyer stays attached to the source that
    // originally found the room, which is the useful question for deciding where
    // to spend effort next.
    function summarizeSources(buyers, snakes, options = {}) {
        const year = text(options.year);
        const rows = new Map();
        const ensure = source => {
            const key = source === UNLINKED_SOURCE ? UNLINKED_SOURCE : normalizeSource(source);

            if (!rows.has(key)) {
                rows.set(key, {
                    source: key,
                    label: key === UNLINKED_SOURCE ? "Not in directory" : sourceLabel(key),
                    buyers: 0,
                    sales: 0,
                    revenue: 0
                });
            }

            return rows.get(key);
        };

        (buyers || []).forEach(buyer => {
            if (year && !text(buyer.createdAt).startsWith(year)) {
                return;
            }

            ensure(buyer.source).buyers += 1;
        });

        const sales = getSales(snakes).filter(({ sale }) => !year || text(sale.date).startsWith(year));

        sales.forEach(({ snake, sale }) => {
            const buyer = findBuyerByName(buyers, snake.soldTo);
            const row = ensure(buyer ? buyer.source : UNLINKED_SOURCE);

            row.sales += 1;
            row.revenue += sale.amount;
        });

        const totalRevenue = roundMoney(sales.reduce((sum, item) => sum + item.sale.amount, 0));
        const totalSales = sales.length;
        const result = [...rows.values()]
            .filter(row => row.buyers > 0 || row.sales > 0)
            .map(row => ({
                ...row,
                revenue: roundMoney(row.revenue),
                averageSale: row.sales > 0 ? roundMoney(row.revenue / row.sales) : 0,
                share: totalRevenue > 0 ? Math.round((row.revenue / totalRevenue) * 1000) / 10 : 0
            }))
            .sort((left, right) =>
                right.revenue - left.revenue
                || right.sales - left.sales
                || right.buyers - left.buyers
                || left.label.localeCompare(right.label)
            );

        return {
            rows: result,
            totalRevenue,
            totalSales,
            linkedSales: sales.length - (rows.get(UNLINKED_SOURCE)?.sales || 0),
            topSource: result.find(row => row.revenue > 0 || row.sales > 0) || null
        };
    }

    // Names already on sales or holds that do not have a directory record yet.
    // Adding one is how old records become part of the source report.
    function listUnlinkedNames(buyers, snakes) {
        const known = new Set((buyers || []).map(buyer => normalizeName(buyer.name)));
        const found = new Map();

        const add = (name, sale, isHold) => {
            const displayName = cleanName(name);
            const key = normalizeName(displayName);

            if (!displayName || known.has(key)) {
                return;
            }

            if (!found.has(key)) {
                found.set(key, {
                    name: displayName,
                    saleCount: 0,
                    revenue: 0,
                    holdCount: 0
                });
            }

            const entry = found.get(key);

            if (sale) {
                entry.saleCount += 1;
                entry.revenue = roundMoney(entry.revenue + sale.amount);
            }

            if (isHold) {
                entry.holdCount += 1;
            }
        };

        (snakes || []).forEach(snake => {
            add(snake.soldTo, getSaleRecord(snake), false);

            const hold = getHoldForSnake(snake, {});

            if (hold && hold.active) {
                add(hold.buyer, null, true);
            }

            (Array.isArray(snake.holdHistory) ? snake.holdHistory : []).forEach(entry => {
                if (entry) {
                    add(entry.buyer, null, true);
                }
            });
        });

        return [...found.values()].sort((left, right) =>
            right.saleCount - left.saleCount
            || right.revenue - left.revenue
            || left.name.localeCompare(right.name)
        );
    }

    // A name correction should not break the history that was recorded under the
    // old spelling. Sales, current holds and released holds all move together.
    function renameBuyerInSnakes(snakes, oldName, newName) {
        const oldKey = normalizeName(oldName);
        const nextName = cleanName(newName);

        if (!oldKey || !nextName || oldKey === normalizeName(nextName)) {
            return snakes || [];
        }

        return (snakes || []).map(snake => {
            let next = null;

            if (normalizeName(snake.soldTo) === oldKey) {
                next = { ...(next || snake), soldTo: nextName };
            }

            if (normalizeName(snake.holdBuyer) === oldKey) {
                next = { ...(next || snake), holdBuyer: nextName };
            }

            const history = Array.isArray(snake.holdHistory) ? snake.holdHistory : null;

            if (history) {
                let changed = false;
                const nextHistory = history.map(entry => {
                    if (entry && normalizeName(entry.buyer) === oldKey) {
                        changed = true;
                        return { ...entry, buyer: nextName };
                    }

                    return entry;
                });

                if (changed) {
                    next = { ...(next || snake), holdHistory: nextHistory };
                }
            }

            return next || snake;
        });
    }

    // ---- Printable statement ----------------------------------------------

    function escapeHtml(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatStatementDate(value) {
        const clean = text(value).slice(0, 10);
        const parts = clean.split("-").map(Number);

        if (parts.length !== 3 || parts.some(part => Number.isNaN(part))) {
            return clean;
        }

        const date = new Date(parts[0], parts[1] - 1, parts[2]);

        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function buildBuyerStatementHtml(summary, options = {}) {
        if (!summary || !summary.buyer) {
            return "";
        }

        const buyer = summary.buyer;
        const formatMoney = typeof options.formatMoney === "function"
            ? options.formatMoney
            : value => `$${roundMoney(value).toFixed(2)}`;
        const brand = text(options.brand) || "The Snake Room";
        const generated = formatStatementDate(options.today || todayText());
        const contactParts = [];

        if (buyer.email) {
            contactParts.push(escapeHtml(buyer.email));
        }

        if (buyer.phone) {
            contactParts.push(escapeHtml(buyer.phone));
        }

        const purchaseRows = summary.purchases.length > 0
            ? summary.purchases.map(({ snake, sale }) => `
                <tr>
                    <td>${escapeHtml(formatStatementDate(sale.date)) || "No date"}</td>
                    <td>${escapeHtml(snake.name || "Unnamed")}</td>
                    <td class="stmt-optional">${escapeHtml(window.SnakeData?.getSnakeIdentityText
                        ? window.SnakeData.getSnakeIdentityText(snake)
                        : snake.ID || snake.morph || "")}</td>
                    <td class="num">${sale.amount > 0 ? escapeHtml(formatMoney(sale.amount)) : "Not recorded"}</td>
                </tr>
            `).join("")
            : '<tr><td colspan="4">No purchases recorded.</td></tr>';

        const holdRows = summary.activeHolds.length > 0
            ? summary.activeHolds.map(({ snake, hold }) => `
                <tr>
                    <td>${escapeHtml(snake.name || "Unnamed")}</td>
                    <td>${escapeHtml(hold.dueDate ? formatStatementDate(hold.dueDate) : "No pickup date")}</td>
                    <td class="num">${hold.hasPrice ? escapeHtml(formatMoney(hold.agreedPrice)) : "—"}</td>
                    <td class="num">${hold.hasDeposit ? escapeHtml(formatMoney(hold.deposit)) : "—"}</td>
                    <td class="num">${hold.hasPrice ? escapeHtml(formatMoney(hold.balance)) : "—"}</td>
                </tr>
            `).join("")
            : '<tr><td colspan="5">No active holds.</td></tr>';

        const releasedRows = summary.releasedHolds.length > 0
            ? summary.releasedHolds.map(({ snake, entry }) => `
                <tr>
                    <td>${escapeHtml(snake.name || "Unnamed")}</td>
                    <td>${escapeHtml(formatStatementDate(entry.releasedDate)) || "No date"}</td>
                    <td class="num">${roundMoney(entry.deposit) > 0 ? escapeHtml(formatMoney(entry.deposit)) : "—"}</td>
                    <td>${escapeHtml(entry.disposition === "return"
                        ? "Returned"
                        : entry.disposition === "transfer"
                            ? `Transferred${entry.transferTo ? ` to ${entry.transferTo}` : ""}`
                            : "Forfeited")}</td>
                </tr>
            `).join("")
            : "";

        const printBar = options.showPrintBar === false
            ? ""
            : '<div class="print-bar"><button type="button" onclick="window.print()">Print / save as PDF</button></div>';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Buyer statement — ${escapeHtml(buyer.name)}</title>
    <style>
        body { margin: 32px; color: #111; font-family: Georgia, 'Times New Roman', serif; }
        h1 { margin: 0; font-size: 26px; letter-spacing: 0.04em; }
        h2 { margin: 4px 0 0; color: #7a5c00; font-size: 17px; font-weight: normal; }
        .head { border-bottom: 2px solid #b8860b; padding-bottom: 12px; margin-bottom: 20px; }
        .meta { margin: 0 0 22px; line-height: 1.55; font-size: 14px; }
        h3 { margin: 24px 0 4px; font-size: 16px; color: #5a4300; }
        table { width: 100%; border-collapse: collapse; margin: 6px 0 18px; font-size: 13px; }
        th, td { border-bottom: 1px solid #ddd; padding: 7px 6px; text-align: left; vertical-align: top; }
        th { background: #f6f1e4; }
        .num { text-align: right; white-space: nowrap; }
        .totals { margin-top: 22px; font-size: 14px; line-height: 1.8; }
        .totals strong { display: inline-block; min-width: 240px; }
        .note { margin-top: 34px; color: #666; font-size: 11px; }
        .print-bar { margin-bottom: 18px; }
        .print-bar button { padding: 8px 16px; border: 1px solid #b8860b; border-radius: 6px; background: #f6f1e4; color: #111; font: inherit; cursor: pointer; }
        @media (max-width: 600px) {
            body { margin: 14px; }
            .head h1 { font-size: 22px; }
            .meta { font-size: 13px; }
            table { font-size: 11px; }
            th, td { padding: 4px 3px; }
            .stmt-optional { display: none; }
            .totals strong { display: block; min-width: 0; }
        }
        @media print { body { margin: 12mm; } .print-bar { display: none; } }
    </style>
</head>
<body>
    ${printBar}

    <div class="head">
        <h1>${escapeHtml(brand)}</h1>
        <h2>Buyer statement</h2>
    </div>

    <p class="meta">
        <strong>${escapeHtml(buyer.name)}</strong><br>
        ${contactParts.join("<br>")}${contactParts.length > 0 ? "<br>" : ""}
        Statement date: ${escapeHtml(generated)}
    </p>

    <h3>Purchases</h3>
    <table>
        <thead>
            <tr><th>Date</th><th>Snake</th><th class="stmt-optional">ID / morph</th><th class="num">Price</th></tr>
        </thead>
        <tbody>${purchaseRows}</tbody>
    </table>

    <h3>Active holds</h3>
    <table>
        <thead>
            <tr><th>Snake</th><th>Pickup</th><th class="num">Agreed</th><th class="num">Deposit</th><th class="num">Balance</th></tr>
        </thead>
        <tbody>${holdRows}</tbody>
    </table>

    ${releasedRows ? `
    <h3>Previous holds</h3>
    <table>
        <thead>
            <tr><th>Snake</th><th>Released</th><th class="num">Deposit</th><th>Deposit outcome</th></tr>
        </thead>
        <tbody>${releasedRows}</tbody>
    </table>
    ` : ""}

    <p class="totals">
        <strong>Total purchases</strong>${escapeHtml(formatMoney(summary.totalSpent))}<br>
        <strong>Deposits currently held</strong>${escapeHtml(formatMoney(summary.depositTotal))}<br>
        <strong>Balance due on active holds</strong>${escapeHtml(formatMoney(summary.balanceTotal))}
    </p>

    <p class="note">
        Generated from ${escapeHtml(brand)} on ${escapeHtml(generated)}. Amounts are in the
        currency used in the room at the time of this statement.
    </p>
</body>
</html>`;
    }

    window.SnakeBuyers = {
        STORAGE_KEY,
        BUYER_SOURCES,
        UNKNOWN_SOURCE,
        UNLINKED_SOURCE,
        normalizeName,
        normalizeSource,
        sourceLabel,
        getBuyers,
        saveBuyers,
        addBuyer,
        updateBuyer,
        removeBuyer,
        findBuyerByName,
        findBuyerById,
        getSaleRecord,
        summarizeBuyer,
        summarizeSources,
        listUnlinkedNames,
        renameBuyerInSnakes,
        buildBuyerStatementHtml
    };
})();
