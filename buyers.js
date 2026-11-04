// buyers.js
// The buyer directory: contacts, where each buyer came from, what they bought,
// what is still on hold, and which channels are actually producing sales.
//
// The directory stores people, not copies of sales. A sale or hold is linked by
// the buyer name already saved on the snake, which means old records appear the
// moment a name is added — and a typo fix can carry the whole history with it.

(function () {
    const B = window.SnakeBuyers;

    if (!B) {
        return;
    }

    const F = window.SnakeFinance;

    const state = {
        search: "",
        source: "all",
        year: "",
        editingId: "",
        expanded: new Set()
    };

    let snakes = [];
    let buyers = [];
    let settings = {};

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
        if (F) {
            return F.formatMoney(value, settings.currency);
        }

        return `$${(Number(value) || 0).toFixed(2)}`;
    }

    function formatDate(value) {
        const clean = String(value || "").slice(0, 10);

        if (!clean) {
            return "No date";
        }

        const date = new Date(`${clean}T00:00:00`);

        if (Number.isNaN(date.getTime())) {
            return clean;
        }

        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function snakeLink(snake) {
        const name = escapeHtml(snake.name || "Unnamed");

        return `<a href="snake-form.html?uid=${encodeURIComponent(snake.id || "")}">${name}</a>`;
    }

    function setStatus(message, isError = false) {
        const element = $("buyerReport");

        if (!element) {
            return;
        }

        element.textContent = message || "";
        element.classList.toggle("fin-error", Boolean(isError));
        element.style.display = message ? "" : "none";
    }

    function loadAll() {
        snakes = window.SnakeData ? window.SnakeData.loadSnakesWithIds([]) : [];
        buyers = B.getBuyers();
        settings = F ? F.getSettings() : {};
    }

    function todayText() {
        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");

        return `${today.getFullYear()}-${month}-${day}`;
    }

    function summaryFor(buyer) {
        return B.summarizeBuyer(buyer, snakes, {
            today: todayText(),
            graceDays: settings.holdGraceDays
        });
    }

    function summaries() {
        return buyers.map(buyer => summaryFor(buyer));
    }

    // ---- Period and filters -------------------------------------------------

    function availableYears() {
        const years = new Set();
        const current = String(new Date().getFullYear());

        years.add(current);

        buyers.forEach(buyer => {
            const year = String(buyer.createdAt || "").slice(0, 4);

            if (year) {
                years.add(year);
            }
        });

        snakes.forEach(snake => {
            const sale = B.getSaleRecord(snake);

            if (sale && sale.date) {
                years.add(sale.date.slice(0, 4));
            }
        });

        return [...years].filter(Boolean).sort().reverse();
    }

    function renderYearOptions() {
        const select = $("buyerYearSelect");

        if (!select) {
            return;
        }

        const years = availableYears();

        select.innerHTML = '<option value="">All time</option>'
            + years.map(year => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join("");

        select.value = years.includes(state.year) ? state.year : "";
        state.year = select.value;
    }

    function buildSourceSelect(select, includeAll) {
        if (!select) {
            return;
        }

        const options = [];

        if (includeAll) {
            options.push('<option value="all">All sources</option>');
        }

        options.push('<option value="unknown">Not recorded</option>');
        B.BUYER_SOURCES.forEach(source => {
            if (source.id !== B.UNKNOWN_SOURCE) {
                options.push(`<option value="${escapeHtml(source.id)}">${escapeHtml(source.label)}</option>`);
            }
        });

        select.innerHTML = options.join("");
    }

    // ---- Summary ------------------------------------------------------------

    function renderKpis() {
        const element = $("buyerKpis");

        if (!element) {
            return;
        }

        const all = summaries();
        const contactable = buyers.filter(buyer => buyer.email || buyer.phone).length;
        const repeat = all.filter(summary => summary.purchaseCount >= 2).length;
        const activeHolds = all.reduce((sum, summary) => sum + summary.activeHoldCount, 0);
        const depositTotal = all.reduce((sum, summary) => sum + summary.depositTotal, 0);
        const balanceTotal = all.reduce((sum, summary) => sum + summary.balanceTotal, 0);
        const sourceStats = B.summarizeSources(buyers, snakes, { year: state.year });
        const top = sourceStats.topSource;

        element.innerHTML = `
            <div class="fin-kpi">
                <span class="fin-kpi-label">Buyers in directory</span>
                <strong class="fin-kpi-value">${buyers.length}</strong>
                <span class="fin-kpi-note">${contactable} with an email or phone number.</span>
            </div>

            <div class="fin-kpi">
                <span class="fin-kpi-label">Repeat buyers</span>
                <strong class="fin-kpi-value">${repeat}</strong>
                <span class="fin-kpi-note">${repeat === 0
                    ? "No one has bought twice yet."
                    : `${repeat === 1 ? "One person has" : `${repeat} people have`} bought more than once.`}</span>
            </div>

            <div class="fin-kpi">
                <span class="fin-kpi-label">Tracked revenue</span>
                <strong class="fin-kpi-value">${escapeHtml(formatMoney(sourceStats.totalRevenue))}</strong>
                <span class="fin-kpi-note">${sourceStats.totalSales === 0
                    ? "No sales in this period."
                    : `${sourceStats.totalSales} ${sourceStats.totalSales === 1 ? "sale" : "sales"} in this period.`}</span>
            </div>

            <div class="fin-kpi">
                <span class="fin-kpi-label">Best source</span>
                <strong class="fin-kpi-value buyer-kpi-text">${top ? escapeHtml(top.label) : "—"}</strong>
                <span class="fin-kpi-note">${top
                    ? `${escapeHtml(formatMoney(top.revenue))} from ${top.sales} ${top.sales === 1 ? "sale" : "sales"}.`
                    : "No source has produced a sale yet."}</span>
            </div>

            <div class="fin-kpi">
                <span class="fin-kpi-label">Active holds</span>
                <strong class="fin-kpi-value">${activeHolds}</strong>
                <span class="fin-kpi-note">${activeHolds === 0
                    ? "Nothing promised right now."
                    : `${escapeHtml(formatMoney(depositTotal))} in deposits · ${escapeHtml(formatMoney(balanceTotal))} due.`}</span>
            </div>
        `;
    }

    function renderSources() {
        const body = $("buyerSourceBody");
        const empty = $("buyerSourceEmpty");
        const note = $("buyerSourceNote");

        if (!body) {
            return;
        }

        const stats = B.summarizeSources(buyers, snakes, { year: state.year });

        body.innerHTML = stats.rows.map(row => `
            <tr>
                <td><span class="buyer-source-pill buyer-source-${escapeHtml(row.source)}">${escapeHtml(row.label)}</span></td>
                <td class="fin-amount-cell">${row.buyers}</td>
                <td class="fin-amount-cell">${row.sales}</td>
                <td class="fin-amount-cell">${escapeHtml(formatMoney(row.revenue))}</td>
                <td class="fin-amount-cell">
                    <span class="buyer-share">
                        <span class="buyer-share-track"><span class="buyer-share-fill" style="width: ${Math.min(100, row.share)}%"></span></span>
                        <em>${row.share}%</em>
                    </span>
                </td>
            </tr>
        `).join("");

        empty.hidden = stats.rows.length > 0;

        if (note) {
            const unlinked = stats.rows.find(row => row.source === B.UNLINKED_SOURCE);
            const linked = stats.totalSales - (unlinked ? unlinked.sales : 0);

            note.textContent = stats.totalSales === 0
                ? ""
                : `${linked} of ${stats.totalSales} ${stats.totalSales === 1 ? "sale is" : "sales are"} linked to a buyer in the directory.`;
            note.hidden = !note.textContent;
        }
    }

    function renderUnlinked() {
        const section = $("buyerUnlinkedSection");
        const list = $("buyerUnlinkedList");

        if (!section || !list) {
            return;
        }

        const names = B.listUnlinkedNames(buyers, snakes);

        section.hidden = names.length === 0;

        list.innerHTML = names.map(entry => {
            const parts = [];

            if (entry.saleCount > 0) {
                parts.push(`${entry.saleCount} ${entry.saleCount === 1 ? "sale" : "sales"} · ${formatMoney(entry.revenue)}`);
            }

            if (entry.holdCount > 0) {
                parts.push(`${entry.holdCount} ${entry.holdCount === 1 ? "hold" : "holds"}`);
            }

            return `
                <div class="buyer-unlinked-row">
                    <div>
                        <strong>${escapeHtml(entry.name)}</strong>
                        <span>${escapeHtml(parts.join(" · "))}</span>
                    </div>
                    <button type="button" class="buyer-action-button" data-unlinked-name="${escapeHtml(entry.name)}">
                        Add to directory
                    </button>
                </div>
            `;
        }).join("");
    }

    // ---- Directory cards ----------------------------------------------------

    function matchesSearch(buyer, search) {
        if (!search) {
            return true;
        }

        const haystack = [
            buyer.name,
            buyer.email,
            buyer.phone,
            buyer.sourceDetail,
            buyer.notes
        ].join(" ").toLowerCase();

        return haystack.includes(search);
    }

    function contactHtml(buyer) {
        const parts = [];

        if (buyer.email) {
            parts.push(`<a href="mailto:${escapeHtml(buyer.email)}">${escapeHtml(buyer.email)}</a>`);
        }

        if (buyer.phone) {
            const dial = buyer.phone.replace(/[^\d+]/g, "");

            parts.push(`<a href="tel:${escapeHtml(dial)}">${escapeHtml(buyer.phone)}</a>`);
        }

        return parts.length > 0
            ? parts.join('<span class="buyer-contact-sep">·</span>')
            : '<span class="buyer-contact-none">No email or phone yet.</span>';
    }

    function purchaseRows(summary) {
        if (summary.purchases.length === 0) {
            return '<tr><td colspan="3" class="buyer-empty-cell">No purchase recorded against this buyer.</td></tr>';
        }

        return summary.purchases.map(({ snake, sale }) => `
            <tr>
                <td>${escapeHtml(formatDate(sale.date))}</td>
                <td>${snakeLink(snake)}</td>
                <td class="fin-amount-cell">${sale.amount > 0 ? escapeHtml(formatMoney(sale.amount)) : "Not recorded"}</td>
            </tr>
        `).join("");
    }

    function holdRows(summary) {
        return summary.activeHolds.map(({ snake, hold }) => `
            <tr>
                <td>${snakeLink(snake)}</td>
                <td>${escapeHtml(hold.dueDate ? formatDate(hold.dueDate) : "No pickup date")}</td>
                <td class="fin-amount-cell">${hold.hasPrice ? escapeHtml(formatMoney(hold.agreedPrice)) : "—"}</td>
                <td class="fin-amount-cell">${hold.hasDeposit ? escapeHtml(formatMoney(hold.deposit)) : "—"}</td>
                <td class="fin-amount-cell">${hold.hasPrice ? escapeHtml(formatMoney(hold.balance)) : "—"}</td>
            </tr>
        `).join("");
    }

    function releasedRows(summary) {
        return summary.releasedHolds.map(({ snake, entry }) => {
            const disposition = entry.disposition === "return"
                ? "Deposit returned"
                : entry.disposition === "transfer"
                    ? `Transferred${entry.transferTo ? ` to ${entry.transferTo}` : ""}`
                    : "Deposit forfeited";

            return `
                <tr>
                    <td>${snakeLink(snake)}</td>
                    <td>${escapeHtml(formatDate(entry.releasedDate))}</td>
                    <td class="fin-amount-cell">${Number(entry.deposit) > 0 ? escapeHtml(formatMoney(entry.deposit)) : "—"}</td>
                    <td>${escapeHtml(disposition)}</td>
                </tr>
            `;
        }).join("");
    }

    function buyerCard(summary) {
        const buyer = summary.buyer;
        const isOpen = state.expanded.has(buyer.id);
        const hasHistory = summary.purchaseCount > 0 || summary.activeHoldCount > 0 || summary.releasedHolds.length > 0;
        const stats = [
            `${summary.purchaseCount} ${summary.purchaseCount === 1 ? "purchase" : "purchases"}`,
            escapeHtml(formatMoney(summary.totalSpent))
        ];

        if (summary.activeHoldCount > 0) {
            stats.push(`${summary.activeHoldCount} on hold`);
        }

        return `
            <article class="buyer-card">
                <button type="button" class="buyer-card-toggle" data-buyer-toggle="${escapeHtml(buyer.id)}"
                    aria-expanded="${isOpen ? "true" : "false"}">
                    <span class="buyer-card-title">
                        <strong>${escapeHtml(buyer.name)}</strong>
                        <span class="buyer-source-pill buyer-source-${escapeHtml(buyer.source)}">${escapeHtml(B.sourceLabel(buyer.source))}</span>
                    </span>
                    <span class="buyer-card-stats">${stats.join('<span class="buyer-contact-sep">·</span>')}</span>
                    <span class="buyer-card-chevron" aria-hidden="true">${isOpen ? "▲" : "▼"}</span>
                </button>

                <div class="buyer-card-body" ${isOpen ? "" : "hidden"}>
                    <div class="buyer-detail-grid">
                        <div>
                            <span class="buyer-detail-label">Contact</span>
                            <div class="buyer-contact">${contactHtml(buyer)}</div>
                        </div>

                        <div>
                            <span class="buyer-detail-label">Found you through</span>
                            <div>
                                ${escapeHtml(B.sourceLabel(buyer.source))}
                                ${buyer.sourceDetail ? `<span class="buyer-source-detail">${escapeHtml(buyer.sourceDetail)}</span>` : ""}
                            </div>
                        </div>

                        <div>
                            <span class="buyer-detail-label">Last activity</span>
                            <div>${escapeHtml(summary.lastActivity ? formatDate(summary.lastActivity) : "Nothing yet")}</div>
                        </div>

                        <div>
                            <span class="buyer-detail-label">Lifetime purchases</span>
                            <div>${summary.purchaseCount} · ${escapeHtml(formatMoney(summary.totalSpent))}</div>
                        </div>
                    </div>

                    <div class="buyer-history">
                        <h4>Purchases</h4>
                        <div class="fin-table-wrap">
                            <table class="fin-table buyer-mini-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Snake</th>
                                        <th class="fin-amount-cell">Price</th>
                                    </tr>
                                </thead>
                                <tbody>${purchaseRows(summary)}</tbody>
                            </table>
                        </div>
                    </div>

                    <div class="buyer-history">
                        <h4>Active holds</h4>
                        ${summary.activeHolds.length > 0 ? `
                            <div class="fin-table-wrap">
                                <table class="fin-table buyer-mini-table">
                                    <thead>
                                        <tr>
                                            <th>Snake</th>
                                            <th>Pickup</th>
                                            <th class="fin-amount-cell">Agreed</th>
                                            <th class="fin-amount-cell">Deposit</th>
                                            <th class="fin-amount-cell">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>${holdRows(summary)}</tbody>
                                </table>
                            </div>
                        ` : '<p class="empty-message buyer-none">No active holds.</p>'}
                    </div>

                    ${summary.releasedHolds.length > 0 ? `
                        <div class="buyer-history">
                            <h4>Previous holds</h4>
                            <div class="fin-table-wrap">
                                <table class="fin-table buyer-mini-table">
                                    <thead>
                                        <tr>
                                            <th>Snake</th>
                                            <th>Released</th>
                                            <th class="fin-amount-cell">Deposit</th>
                                            <th>Outcome</th>
                                        </tr>
                                    </thead>
                                    <tbody>${releasedRows(summary)}</tbody>
                                </table>
                            </div>
                        </div>
                    ` : ""}

                    ${buyer.notes ? `
                        <p class="buyer-note">
                            <span class="buyer-detail-label">Private note</span>
                            ${escapeHtml(buyer.notes).replace(/\n/g, "<br>")}
                        </p>
                    ` : ""}

                    <div class="buyer-card-actions">
                        <button type="button" class="buyer-action-button" data-buyer-action="edit" data-buyer-id="${escapeHtml(buyer.id)}">
                            Edit
                        </button>

                        <button type="button" class="buyer-action-button" data-buyer-action="statement"
                            data-buyer-id="${escapeHtml(buyer.id)}" ${hasHistory ? "" : "disabled"}>
                            Print statement
                        </button>

                        <button type="button" class="fin-delete-button" data-buyer-action="remove" data-buyer-id="${escapeHtml(buyer.id)}">
                            Remove
                        </button>
                    </div>
                </div>
            </article>
        `;
    }

    function renderList() {
        const list = $("buyerList");
        const empty = $("buyerEmpty");
        const count = $("buyerDirectoryCount");

        if (!list) {
            return;
        }

        const search = state.search.toLowerCase();
        const visible = summaries().filter(summary => {
            const buyer = summary.buyer;
            const matchesSource = state.source === "all" || buyer.source === state.source;

            return matchesSource && matchesSearch(buyer, search);
        }).sort((left, right) => left.buyer.name.localeCompare(right.buyer.name));

        list.innerHTML = visible.map(buyerCard).join("");

        if (count) {
            count.textContent = `${buyers.length} ${buyers.length === 1 ? "buyer" : "buyers"}`
                + (visible.length !== buyers.length ? ` · ${visible.length} shown` : "");
        }

        if (empty) {
            if (buyers.length === 0) {
                empty.textContent = "No buyers yet. Add the first one, and their sales and holds link automatically.";
            } else if (visible.length === 0) {
                empty.textContent = "No buyer matches that search and source.";
            } else {
                empty.textContent = "";
            }

            empty.hidden = visible.length > 0;
        }
    }

    function renderAll() {
        renderYearOptions();
        renderKpis();
        renderSources();
        renderUnlinked();
        renderList();
    }

    // ---- Add / edit form ----------------------------------------------------

    function sourceDetailPlaceholder(source) {
        const placeholders = {
            expo: "Which show, and where",
            morphmarket: "Listing or seller name",
            website: "The page or search that brought them",
            "word-of-mouth": "Who referred them",
            kijiji: "Listing or neighbourhood",
            facebook: "Group or post",
            instagram: "Account or post",
            other: "Where they found you"
        };

        return placeholders[source] || "Which expo, group, listing or person";
    }

    function updateSourceDetailField() {
        const source = $("buyerSourceInput").value;
        const field = $("buyerSourceDetailField");
        const input = $("buyerSourceDetailInput");

        field.hidden = source === B.UNKNOWN_SOURCE;
        input.placeholder = sourceDetailPlaceholder(source);
    }

    function openBuyerForm(buyer, prefillName = "") {
        state.editingId = buyer ? buyer.id : "";

        $("buyerFormSection").hidden = false;
        $("buyerFormTitle").textContent = buyer ? `Edit ${buyer.name}` : "Add buyer";
        $("buyerSaveButton").textContent = buyer ? "Save Buyer" : "Add Buyer";
        $("buyerNameInput").value = buyer ? buyer.name : prefillName;
        $("buyerEmailInput").value = buyer ? buyer.email : "";
        $("buyerPhoneInput").value = buyer ? buyer.phone : "";
        $("buyerSourceInput").value = buyer ? buyer.source : B.UNKNOWN_SOURCE;
        $("buyerSourceDetailInput").value = buyer ? buyer.sourceDetail : "";
        $("buyerNotesInput").value = buyer ? buyer.notes : "";
        $("buyerFormError").hidden = true;
        $("buyerFormError").textContent = "";

        updateSourceDetailField();

        $("buyerFormSection").scrollIntoView({ behavior: "smooth", block: "start" });
        $("buyerNameInput").focus({ preventScroll: true });
    }

    function closeBuyerForm() {
        state.editingId = "";
        $("buyerFormSection").hidden = true;
        $("buyerForm").reset();
        $("buyerSourceInput").value = B.UNKNOWN_SOURCE;
        updateSourceDetailField();
    }

    function showFormError(message) {
        const element = $("buyerFormError");

        element.textContent = message;
        element.hidden = false;
    }

    function handleSubmit(event) {
        event.preventDefault();

        const draft = {
            name: $("buyerNameInput").value,
            email: $("buyerEmailInput").value,
            phone: $("buyerPhoneInput").value,
            source: $("buyerSourceInput").value,
            sourceDetail: $("buyerSourceDetailInput").value,
            notes: $("buyerNotesInput").value
        };

        if (!draft.name.trim()) {
            showFormError("A buyer needs a name.");
            return;
        }

        if (state.editingId) {
            const current = B.findBuyerById(buyers, state.editingId);
            const result = B.updateBuyer(state.editingId, draft);

            if (result.error) {
                showFormError(result.error);
                return;
            }

            if (current && current.name !== result.buyer.name) {
                snakes = B.renameBuyerInSnakes(snakes, current.name, result.buyer.name);
                window.SnakeData.saveStorageArray("snakes", snakes);
                setStatus(`${result.buyer.name} saved. Sales and holds under “${current.name}” now use the new name.`);
            } else {
                setStatus(`${result.buyer.name} saved.`);
            }
        } else {
            const result = B.addBuyer(draft);

            if (result.error) {
                showFormError(result.error);
                return;
            }

            state.expanded.add(result.buyer.id);
            setStatus(`${result.buyer.name} added. Their existing sales and holds are linked.`);
        }

        closeBuyerForm();
        loadAll();
        renderAll();
    }

    // ---- Statements and removal --------------------------------------------

    function openStatement(id) {
        const buyer = B.findBuyerById(buyers, id);

        if (!buyer) {
            return;
        }

        const summary = summaryFor(buyer);
        const html = B.buildBuyerStatementHtml(summary, {
            formatMoney,
            brand: "The Snake Room",
            showPrintBar: false
        });
        const modal = $("buyerStatementModal");
        const frame = $("buyerStatementFrame");

        frame.srcdoc = html;
        modal.classList.add("is-open");
        $("buyerStatementPrint").focus();
    }

    // Printing an iframe prints only the statement, not the dark page behind it,
    // and it works on phones where a pop-up would be blocked.
    function printStatement() {
        const frame = $("buyerStatementFrame");

        if (frame && frame.contentWindow) {
            frame.contentWindow.focus();
            frame.contentWindow.print();
        }
    }

    function closeStatement() {
        const modal = $("buyerStatementModal");
        const frame = $("buyerStatementFrame");

        if (modal) {
            modal.classList.remove("is-open");
        }

        if (frame) {
            frame.srcdoc = "";
        }
    }

    function removeBuyer(id) {
        const buyer = B.findBuyerById(buyers, id);

        if (!buyer) {
            return;
        }

        const ok = window.confirm(`Remove ${buyer.name} from the directory? Their sales and holds stay, but the name will show under “Not in the directory yet”.`);

        if (!ok) {
            return;
        }

        B.removeBuyer(id);
        state.expanded.delete(id);
        loadAll();
        renderAll();
        setStatus(`${buyer.name} removed from the directory.`);
    }

    // ---- Wiring -------------------------------------------------------------

    function init() {
        loadAll();

        buildSourceSelect($("buyerSourceInput"), false);
        buildSourceSelect($("buyerSourceFilter"), true);

        $("buyerSourceInput").value = B.UNKNOWN_SOURCE;
        updateSourceDetailField();

        $("addBuyerButton").addEventListener("click", () => openBuyerForm(null));
        $("buyerCancelButton").addEventListener("click", closeBuyerForm);
        $("buyerForm").addEventListener("submit", handleSubmit);
        $("buyerSourceInput").addEventListener("change", updateSourceDetailField);

        $("buyerSearchInput").addEventListener("input", event => {
            state.search = event.target.value.trim();
            renderList();
        });

        $("buyerSourceFilter").addEventListener("change", event => {
            state.source = event.target.value;
            renderList();
        });

        $("buyerYearSelect").addEventListener("change", event => {
            state.year = event.target.value;
            renderKpis();
            renderSources();
        });

        $("buyerList").addEventListener("click", event => {
            const toggle = event.target.closest("[data-buyer-toggle]");

            if (toggle) {
                const id = toggle.getAttribute("data-buyer-toggle");

                if (state.expanded.has(id)) {
                    state.expanded.delete(id);
                } else {
                    state.expanded.add(id);
                }

                renderList();
                return;
            }

            const action = event.target.closest("[data-buyer-action]");

            if (!action) {
                return;
            }

            const id = action.getAttribute("data-buyer-id");

            if (action.getAttribute("data-buyer-action") === "edit") {
                openBuyerForm(B.findBuyerById(buyers, id));
            } else if (action.getAttribute("data-buyer-action") === "statement") {
                openStatement(id);
            } else if (action.getAttribute("data-buyer-action") === "remove") {
                removeBuyer(id);
            }
        });

        $("buyerUnlinkedList").addEventListener("click", event => {
            const button = event.target.closest("[data-unlinked-name]");

            if (!button) {
                return;
            }

            openBuyerForm(null, button.getAttribute("data-unlinked-name"));
        });

        $("buyerStatementClose").addEventListener("click", closeStatement);
        $("buyerStatementDone").addEventListener("click", closeStatement);
        $("buyerStatementPrint").addEventListener("click", printStatement);

        $("buyerStatementModal").addEventListener("click", event => {
            if (event.target === $("buyerStatementModal")) {
                closeStatement();
            }
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && $("buyerStatementModal").classList.contains("is-open")) {
                closeStatement();
            }
        });

        renderAll();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
