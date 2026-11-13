// available.js
// The private "For Sale" staging list.
//
// This is the last look before stock goes public: which animals are listed,
// what they are asking, and whether a hold already has money on it. Buyers
// never see this page — the public list is the Soulless Serpents storefront,
// built from the same records by site-tools/build-available.js.
(function () {
    // Live storefront. Change this one line when a custom domain replaces the
    // workers.dev address.
    const STOREFRONT_URL = "https://soulless-serpents.red-nosed-one.workers.dev/available";
    const LISTED_STATUSES = ["Available", "On Hold"];

    function escapeHtml(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function money(value) {
        const amount = Number(value);

        if (!Number.isFinite(amount) || amount <= 0) {
            return "";
        }

        const hasCents = Math.round(amount * 100) % 100 !== 0;

        return "$" + amount.toLocaleString("en-US", {
            minimumFractionDigits: hasCents ? 2 : 0,
            maximumFractionDigits: 2
        });
    }

    function statusOrder(snake) {
        return snake.status === "Available" ? 0 : 1;
    }

    function loadListedSnakes() {
        const snakes = window.SnakeData ? window.SnakeData.loadSnakesWithIds([]) : [];

        return snakes
            .map((snake, index) => ({ snake, index }))
            .filter(entry => LISTED_STATUSES.includes(entry.snake.status))
            .sort((left, right) => statusOrder(left.snake) - statusOrder(right.snake)
                || String(left.snake.name || "").localeCompare(String(right.snake.name || "")));
    }

    function photoFor(snake) {
        return snake.image || "Images/TheSnakeRoom.jpg";
    }

    function genePills(snake) {
        const genes = Array.isArray(snake.genes) ? snake.genes : [];

        if (genes.length === 0) {
            return '<span class="gene-pill">No genes entered</span>';
        }

        const ordered = window.GeneTools && window.GeneTools.sortGenesForDisplay
            ? window.GeneTools.sortGenesForDisplay(genes)
            : genes;

        return ordered.map(gene => {
            const label = window.GeneTools && window.GeneTools.describeGene
                ? window.GeneTools.describeGene(gene)
                : (gene && gene.name) || "";
            const pillClass = window.GeneTools && window.GeneTools.getStoredGenePillClass
                ? window.GeneTools.getStoredGenePillClass(gene)
                : "";

            return `<span class="gene-pill ${pillClass}">${escapeHtml(label)}</span>`;
        }).join("");
    }

    function listingBadge(snake) {
        if (snake.status === "On Hold") {
            return '<span class="sale-badge sale-badge-hold">On Hold</span>';
        }

        return '<span class="sale-badge sale-badge-available">Available</span>';
    }

    function priceLine(snake) {
        const asking = money(snake.askingPrice);
        const agreed = money(snake.holdPrice);

        if (snake.status === "On Hold") {
            return `<span>Agreed ${agreed || "<em>not recorded</em>"}` +
                (asking ? ` &middot; asked ${asking}` : "") + "</span>";
        }

        if (asking) {
            return `<span>Asking <strong>${asking}</strong></span>`;
        }

        return '<span class="sale-badge sale-badge-overdue">No asking price</span>';
    }

    function holdLine(snake) {
        if (snake.status !== "On Hold") {
            return "";
        }

        const parts = [];

        if (snake.holdBuyer) {
            parts.push(`for ${escapeHtml(snake.holdBuyer)}`);
        }

        if (money(snake.holdDeposit)) {
            parts.push(`${money(snake.holdDeposit)} deposit in`);
        }

        if (snake.holdDueDate) {
            parts.push(`due ${escapeHtml(snake.holdDueDate)}`);
        }

        return parts.length
            ? `<span>Hold ${parts.join(" &middot; ")}</span>`
            : "<span>Hold with no buyer or deposit recorded</span>";
    }

    function cardHtml({ snake, index }) {
        const sexIcon = snake.sex === "Male" ? "&male;" : snake.sex === "Female" ? "&female;" : "?";
        const sexClass = snake.sex === "Male" ? "male-icon" : snake.sex === "Female" ? "female-icon" : "unknown-icon";
        const identity = escapeHtml(snake.ID || snake.morph || "No ID");
        const morph = escapeHtml(snake.morph || snake.ID || "");
        const bin = snake.binNumber ? `<span class="bin-number">Bin: ${escapeHtml(snake.binNumber)}</span>` : "";
        const weight = snake.weight ? `${escapeHtml(snake.weight)}g` : "No weight";
        const hatched = snake.hatchDate ? escapeHtml(snake.hatchDate) : "No hatch date";
        const editUrl = `snake-form.html?index=${index}`;

        return `
            <div class="snake-card">
                <a href="${escapeHtml(photoFor(snake))}">
                    <img src="${escapeHtml(photoFor(snake))}" class="snake-thumbnail"
                        alt="${escapeHtml(snake.name || "Snake")}"
                        onerror="this.onerror=null;this.src='Images/TheSnakeRoom.jpg'">
                </a>

                <div class="snake-info">
                    <div class="snake-header">
                        <h3 class="snake-name">${escapeHtml(snake.name || "Unnamed")}</h3>
                        <span class="${sexClass}">${sexIcon}</span>
                    </div>

                    <p class="snake-morph">${identity}${morph && morph !== identity ? " &middot; " + morph : ""}
                        ${bin}</p>

                    <div class="snake-details">
                        ${listingBadge(snake)}
                        ${priceLine(snake)}
                    </div>

                    <div class="snake-genes">${genePills(snake)}</div>

                    <div class="snake-details">
                        <span>${weight}</span>
                        <span>Hatched ${hatched}</span>
                        ${holdLine(snake)}
                    </div>

                    <div class="button-row" style="margin-top:auto; justify-content:center;">
                        <a href="${editUrl}" class="secondary-button">Edit listing</a>
                    </div>
                </div>
            </div>
        `;
    }

    function storefrontContact() {
        return window.StorefrontContact ? window.StorefrontContact.read() : null;
    }

    function renderStorefrontNotice() {
        const notice = document.getElementById("storefrontNotice");

        if (!notice) {
            return;
        }

        const contact = storefrontContact();
        const complete = contact && window.StorefrontContact.isComplete(contact);

        notice.hidden = Boolean(complete);
        notice.textContent = complete
            ? ""
            : "Storefront contact missing \u2014 animals cannot be published until a shop name and a working email are saved above.";
        notice.style.color = "#ffb4a8";
    }

    function renderSummary(listed) {
        const summary = document.getElementById("availableSummary");

        if (!summary) {
            return;
        }

        if (listed.length === 0) {
            summary.innerHTML = "";
            return;
        }

        const available = listed.filter(entry => entry.snake.status === "Available");
        const onHold = listed.filter(entry => entry.snake.status === "On Hold");
        const asking = available.reduce((total, entry) => total + (Number(entry.snake.askingPrice) || 0), 0);
        const parts = [`<span class="money-summary-item"><strong>${available.length}</strong> available</span>`];

        parts.push(`<span class="money-summary-item"><strong>${onHold.length}</strong> on hold</span>`);

        if (asking > 0) {
            parts.push(`<span class="money-summary-item">Total asking <strong>${money(asking)}</strong></span>`);
        }

        const contact = storefrontContact();

        if (contact && window.StorefrontContact.isComplete(contact)) {
            parts.push(`<span class="money-summary-item">Publishing as <strong>${escapeHtml(contact.name)}</strong> &middot; ${escapeHtml(contact.email)}</span>`);
        }

        parts.push('<span class="money-summary-item">Not on the storefront until the export is built</span>');

        summary.innerHTML = parts.join("");
    }

    function renderListedSnakes() {
        const grid = document.getElementById("availableGrid");

        if (!grid) {
            return;
        }

        const listed = loadListedSnakes();
        renderStorefrontNotice();
        renderSummary(listed);

        if (listed.length === 0) {
            grid.innerHTML = `
                <p class="empty-message" style="width:100%;">
                    Nothing is marked Available or On Hold yet. Open a snake, set its status to
                    <strong>Available</strong> and give it an <strong>Asking price</strong> &mdash;
                    it will appear here and in the next export.
                </p>
            `;
            return;
        }

        grid.innerHTML = listed.map(cardHtml).join("");
    }

    function pointStorefrontLink() {
        const link = document.getElementById("storefrontLink");

        if (link) {
            link.href = STOREFRONT_URL;
        }
    }

    function init() {
        pointStorefrontLink();
        renderListedSnakes();
    }

    window.addEventListener("storefront-contact-changed", renderListedSnakes);

    window.AvailableList = { render: renderListedSnakes, storefrontUrl: STOREFRONT_URL };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
