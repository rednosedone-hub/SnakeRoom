// morphGallery.js
// The browse / publish face of the shared morph photo library. All the reading,
// writing and genotype keying lives in morph-gallery.js; this file is only the
// page: what to show, and what a click means.

(function () {
    const state = {
        rows: [],
        groups: new Map(),
        search: "",
        sort: "photos",
        userId: "",
        reportCounts: new Map()
    };

    const elements = {
        setupSection: document.getElementById("gallerySetupSection"),
        setupStatus: document.getElementById("gallerySetupStatus"),
        sqlBlock: document.getElementById("morphGallerySqlBlock"),
        copySqlButton: document.getElementById("copyMorphSqlButton"),
        searchInput: document.getElementById("gallerySearchInput"),
        sortSelect: document.getElementById("gallerySortSelect"),
        summary: document.getElementById("gallerySummary"),
        grid: document.getElementById("galleryGrid"),
        empty: document.getElementById("galleryEmpty"),
        status: document.getElementById("galleryStatus"),
        snakeSelect: document.getElementById("gallerySnakeSelect"),
        photoSelect: document.getElementById("galleryPhotoSelect"),
        preview: document.getElementById("galleryPublishPreview"),
        publishButton: document.getElementById("publishMorphPhotoButton"),
        publishStatus: document.getElementById("galleryPublishStatus"),
        consentInput: document.getElementById("galleryConsentInput"),
        mineGrid: document.getElementById("galleryMineGrid"),
        mineNote: document.getElementById("galleryMineNote"),
        mineStatus: document.getElementById("galleryMineStatus"),
        refreshButton: document.getElementById("galleryRefreshButton"),
        modal: document.getElementById("galleryModal"),
        modalTitle: document.getElementById("galleryModalTitle"),
        modalGenes: document.getElementById("galleryModalGenes"),
        modalPhotos: document.getElementById("galleryModalPhotos"),
        modalClose: document.getElementById("galleryModalClose")
    };

    function escapeHtml(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function snakes() {
        return window.SnakeData.loadSnakesWithIds([])
            .filter(snake => window.SnakeData.isActiveSnake(snake));
    }

    function genePills(geneDetails) {
        if (!geneDetails || geneDetails.length === 0) {
            return `<span class="gene-pill">Normal</span>`;
        }

        return geneDetails.map(gene => {
            const label = window.GeneTools && window.GeneTools.describeGene
                ? window.GeneTools.describeGene(gene)
                : gene.name;

            return `<span class="gene-pill">${escapeHtml(label)}</span>`;
        }).join("");
    }

    function photoCountLabel(count) {
        return `${count} photo${count === 1 ? "" : "s"}`;
    }

    function rowText(row) {
        return [
            row.morphName,
            ...(row.genes || []).map(gene => gene.name)
        ].join(" ").toLowerCase();
    }

    // One card per genotype. The newest row supplies the display name so a morph
    // renamed in the catalog shows its current name rather than an old one.
    function buildGroups(rows) {
        const groups = new Map();

        rows.forEach(row => {
            if (!groups.has(row.morphKey)) {
                groups.set(row.morphKey, {
                    key: row.morphKey,
                    morphName: row.morphName,
                    genes: row.genes,
                    photos: [],
                    searchText: ""
                });
            }

            const group = groups.get(row.morphKey);
            group.photos.push(row);
            group.searchText += ` ${rowText(row)}`;
        });

        groups.forEach(group => {
            group.photos.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
            group.newest = group.photos[0] ? group.photos[0].createdAt : "";
        });

        return groups;
    }

    function visibleGroups() {
        const search = state.search.trim().toLowerCase();
        let groups = [...state.groups.values()];

        if (search) {
            groups = groups.filter(group => group.searchText.includes(search));
        }

        if (state.sort === "name") {
            groups.sort((left, right) => left.morphName.localeCompare(right.morphName));
        } else if (state.sort === "newest") {
            groups.sort((left, right) => String(right.newest).localeCompare(String(left.newest)));
        } else {
            groups.sort((left, right) =>
                right.photos.length - left.photos.length
                || left.morphName.localeCompare(right.morphName));
        }

        return groups;
    }

    function renderCard(group) {
        const main = group.photos[0];

        return `
            <article class="morph-gallery-card" data-key="${escapeHtml(group.key)}">
                <button type="button" class="morph-gallery-photo" data-action="open"
                    data-key="${escapeHtml(group.key)}"
                    aria-label="See ${group.photos.length} example${group.photos.length === 1 ? "" : "s"} of ${escapeHtml(group.morphName)}">
                    <img src="${escapeHtml(main.photoUrl)}" alt="${escapeHtml(group.morphName)}"
                        loading="lazy" onerror="this.classList.add('is-broken')">
                    <span class="morph-gallery-count">${photoCountLabel(group.photos.length)}</span>
                </button>

                <div class="morph-gallery-body">
                    <h4>${escapeHtml(group.morphName)}</h4>
                    <div class="morph-gallery-genes">${genePills(group.genes)}</div>
                </div>
            </article>
        `;
    }

    function renderGallery() {
        const groups = visibleGroups();
        const totalPhotos = groups.reduce((sum, group) => sum + group.photos.length, 0);

        elements.grid.innerHTML = groups.map(renderCard).join("");

        elements.summary.textContent = state.rows.length === 0
            ? "No examples published yet."
            : `${groups.length} morph${groups.length === 1 ? "" : "s"} from ${totalPhotos} photo${totalPhotos === 1 ? "" : "s"}`
                + (state.search.trim() ? ` matching "${state.search.trim()}"` : "") + ".";

        const isEmpty = groups.length === 0;
        elements.empty.hidden = !isEmpty;
        elements.empty.textContent = isEmpty
            ? (state.search.trim()
                ? "No published examples match that search yet."
                : "Nothing published yet. Add the first photo from your collection below.")
            : "";
    }

    async function loadGallery() {
        elements.summary.textContent = "Loading examples…";

        try {
            const result = await window.MorphGallery.fetchAll();

            state.rows = result.rows;
            state.groups = buildGroups(result.rows);

            if (window.MorphGallery.setupNeeded()) {
                showSetup();
            } else if (elements.setupSection) {
                elements.setupSection.hidden = true;
            }

            if (result.fromCache) {
                elements.status.textContent = "Showing examples saved on this device. Reconnect to refresh.";
            } else if (window.MorphGallery.lastError() && !window.MorphGallery.setupNeeded()) {
                elements.status.textContent = window.MorphGallery.lastError();
            }

            renderGallery();
        } catch (error) {
            elements.summary.textContent = "The gallery could not be loaded.";
            elements.status.textContent = error && error.message ? error.message : "Reload the page and try again.";
        }
    }

    function showSetup() {
        const sql = window.MorphGallery.setupSql();

        if (!sql || !elements.setupSection) {
            return;
        }

        elements.setupSection.hidden = false;
        elements.sqlBlock.textContent = sql;
    }

    function renderModal(key) {
        const group = state.groups.get(key);

        if (!group) {
            return;
        }

        elements.modalTitle.textContent = group.morphName;
        elements.modalGenes.innerHTML = genePills(group.genes);
        elements.modalPhotos.innerHTML = group.photos.map(photo => {
            const isOwn = Boolean(state.userId && photo.userId === state.userId);

            return `
                <figure class="morph-gallery-modal-photo">
                    <img src="${escapeHtml(photo.photoUrl)}" alt="${escapeHtml(group.morphName)}"
                        loading="lazy" onerror="this.classList.add('is-broken')">
                    ${isOwn ? "" : `
                        <div class="morph-report" data-photo-id="${escapeHtml(photo.id)}">
                            <button type="button" class="morph-report-button" data-action="report-photo">
                                Report photo
                            </button>
                        </div>
                    `}
                </figure>
            `;
        }).join("");

        elements.modal.classList.add("is-open");
        elements.modal.setAttribute("aria-hidden", "false");
    }

    function closeModal() {
        elements.modal.classList.remove("is-open");
        elements.modal.setAttribute("aria-hidden", "true");
    }

    const REPORT_REASONS = [
        "Not my photo, or used without permission",
        "Inappropriate content",
        "Wrong morph or genes"
    ];

    function reportButtonMarkup() {
        return `<button type="button" class="morph-report-button" data-action="report-photo">
            Report photo
        </button>`;
    }

    function showReportForm(container) {
        const photoId = container.dataset.photoId;

        container.innerHTML = `
            <form class="morph-report-form">
                <label class="form-field">
                    <span>Why are you reporting this photo?</span>
                    <select name="reason" required>
                        <option value="">Choose a reason</option>
                        ${REPORT_REASONS.map(reason => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join("")}
                    </select>
                </label>

                <input type="text" name="note" maxlength="200"
                    placeholder="Anything else (optional)">

                <div class="form-page-actions">
                    <button type="submit" class="gene-action-button">Send report</button>
                    <button type="button" class="gene-remove-button" data-action="cancel-report">Cancel</button>
                </div>

                <p class="empty-message morph-report-status" role="status"></p>
            </form>
        `;

        const form = container.querySelector("form");

        form.addEventListener("submit", async event => {
            event.preventDefault();

            const status = form.querySelector(".morph-report-status");
            const data = new FormData(form);

            status.textContent = "Sending…";

            try {
                await window.MorphGallery.report({
                    photoId,
                    reason: data.get("reason"),
                    note: data.get("note")
                });

                container.innerHTML = `<p class="empty-message morph-report-done">
                    Report sent. The keeper who published this photo will see it and can remove it.
                </p>`;
            } catch (error) {
                status.textContent = error.message;
            }
        });

        container.querySelector("[data-action='cancel-report']").addEventListener("click", () => {
            container.innerHTML = reportButtonMarkup();
        });
    }

    // ---- Publishing --------------------------------------------------------

    function publishableSnakes() {
        return snakes().filter(snake =>
            window.MorphGallery.photoUrlsForSnake(snake).length > 0
            && (snake.genes || []).length > 0);
    }

    function selectedSnake() {
        const index = Number(elements.snakeSelect.value);
        const list = publishableSnakes();

        return Number.isInteger(index) && list[index] ? list[index] : null;
    }

    function renderSnakeOptions() {
        const list = publishableSnakes();

        if (list.length === 0) {
            elements.snakeSelect.innerHTML = `<option value="">No snake with genes and a photo yet</option>`;
            elements.photoSelect.innerHTML = `<option value="">Add genes and a photo on a snake first</option>`;
            elements.preview.textContent = "The gallery files photos by genotype, so a snake needs its genes and at least one photo before it can be published.";
            elements.publishButton.disabled = true;
            return;
        }

        elements.snakeSelect.innerHTML = list.map((snake, index) => {
            const described = window.MorphGallery.describeSnake(snake);

            return `<option value="${index}">${escapeHtml(`${snake.name || "Unnamed"} — ${described.morphName}`)}</option>`;
        }).join("");

        renderPhotoOptions();
    }

    function renderPhotoOptions() {
        const snake = selectedSnake();

        if (!snake) {
            return;
        }

        const urls = window.MorphGallery.photoUrlsForSnake(snake);

        elements.photoSelect.innerHTML = urls.map((url, index) =>
            `<option value="${escapeHtml(url)}">Photo ${index + 1}${index === 0 ? " (main)" : ""}</option>`
        ).join("");

        renderPreview();
    }

    function renderPreview() {
        const snake = selectedSnake();

        if (!snake) {
            return;
        }

        const described = window.MorphGallery.describeSnake(snake);
        const labels = described.geneDetails.length > 0
            ? described.geneDetails.map(gene => gene.label).join(" + ")
            : "no genes";

        elements.preview.textContent =
            `Publishes as ${described.morphName} (${labels}) and shows in every user's ${described.morphName} examples.`;
        elements.publishButton.disabled = false;
    }

    async function publishPhoto() {
        const snake = selectedSnake();

        if (!snake) {
            elements.publishStatus.textContent = "Choose a snake first.";
            return;
        }

        if (elements.consentInput && !elements.consentInput.checked) {
            elements.publishStatus.textContent = "Tick the permission box first \u2014 it is the one promise the gallery asks of you.";
            return;
        }

        elements.publishButton.disabled = true;
        elements.publishStatus.textContent = "Publishing…";

        try {
            await window.MorphGallery.publish({
                snake,
                photoUrl: elements.photoSelect.value
            });

            elements.publishStatus.textContent = "Published. Every keeper's calculator can use this photo now.";

            if (elements.consentInput) {
                elements.consentInput.checked = false;
            }
            await loadGallery();
            await loadMine();
        } catch (error) {
            elements.publishStatus.textContent = error.message;
        } finally {
            elements.publishButton.disabled = false;
            showSetup();
        }
    }

    // ---- Your photos -------------------------------------------------------

    async function loadMine() {
        const session = window.CloudSync && window.CloudSync.getSession
            ? await window.CloudSync.getSession()
            : null;

        state.userId = session && session.user ? session.user.id : "";

        if (!session) {
            elements.mineNote.hidden = false;
            elements.mineNote.textContent = "Sign in to see and manage the photos you have published.";
            elements.mineGrid.innerHTML = "";
            return;
        }

        const rows = await window.MorphGallery.fetchMine();
        state.reportCounts = await window.MorphGallery.fetchMyReportCounts();

        elements.mineNote.hidden = rows.length > 0;
        elements.mineNote.textContent = rows.length > 0
            ? ""
            : "You have not published any photos yet.";

        elements.mineGrid.innerHTML = rows.map(row => {
            const reports = state.reportCounts.get(row.id) || 0;

            return `
                <article class="morph-gallery-card">
                    <div class="morph-gallery-photo">
                        <img src="${escapeHtml(row.photoUrl)}" alt="${escapeHtml(row.morphName)}"
                            loading="lazy" onerror="this.classList.add('is-broken')">
                    </div>
                    <div class="morph-gallery-body">
                        <h4>${escapeHtml(row.morphName)}</h4>
                        ${reports ? `<p class="morph-report-badge">
                            Reported ${reports} time${reports === 1 ? "" : "s"} \u2014 review or remove this photo.
                        </p>` : ""}
                        <button type="button" class="gene-remove-button" data-action="remove"
                            data-id="${escapeHtml(row.id)}">Remove</button>
                    </div>
                </article>
            `;
        }).join("");
    }

    async function removePhoto(id) {
        if (!id) {
            return;
        }

        if (!confirm("Remove this photo from the shared gallery? The photo stays on your snake.")) {
            return;
        }

        elements.mineStatus.textContent = "Removing…";

        try {
            await window.MorphGallery.remove(id);
            elements.mineStatus.textContent = "Removed from the gallery.";
            await loadGallery();
            await loadMine();
        } catch (error) {
            elements.mineStatus.textContent = error.message;
        }
    }

    // ---- Wiring ------------------------------------------------------------

    function applyUrlSearch() {
        const params = new URLSearchParams(window.location.search);
        const search = params.get("q") || params.get("morph") || "";

        if (search) {
            state.search = search;
            elements.searchInput.value = search;
        }
    }

    function bindEvents() {
        elements.searchInput.addEventListener("input", event => {
            state.search = event.target.value;
            renderGallery();
        });

        elements.sortSelect.addEventListener("change", event => {
            state.sort = event.target.value;
            renderGallery();
        });

        elements.grid.addEventListener("click", event => {
            const button = event.target.closest("[data-action='open']");

            if (button) {
                renderModal(button.dataset.key);
            }
        });

        elements.mineGrid.addEventListener("click", event => {
            const button = event.target.closest("[data-action='remove']");

            if (button) {
                removePhoto(button.dataset.id);
            }
        });

        elements.snakeSelect.addEventListener("change", renderPhotoOptions);
        elements.photoSelect.addEventListener("change", renderPreview);
        elements.publishButton.addEventListener("click", publishPhoto);
        elements.refreshButton.addEventListener("click", () => {
            elements.status.textContent = "";
            loadGallery();
            loadMine();
        });

        elements.modalClose.addEventListener("click", closeModal);
        elements.modal.addEventListener("click", event => {
            const reportButton = event.target.closest("[data-action='report-photo']");

            if (reportButton && reportButton.closest(".morph-report")) {
                showReportForm(reportButton.closest(".morph-report"));
                return;
            }

            if (event.target === elements.modal) {
                closeModal();
            }
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                closeModal();
            }
        });

        elements.copySqlButton.addEventListener("click", async () => {
            const sql = window.MorphGallery.setupSql();

            try {
                await navigator.clipboard.writeText(sql);
                elements.setupStatus.textContent = "Copied. Paste it into the Supabase SQL Editor and run it once.";
            } catch (error) {
                elements.setupStatus.textContent = "Could not copy automatically — select the SQL above and copy it.";
            }
        });
    }

    // A calculator row links here with ?q=<morph>&open=1: the keeper asked to
    // see examples, so open the first matching animal's photos instead of making
    // them find the card again.
    function openRequestedMorph() {
        const params = new URLSearchParams(window.location.search);

        if (!params.get("open")) {
            return;
        }

        const key = params.get("key");
        const group = key ? state.groups.get(key) : visibleGroups()[0];

        if (group) {
            renderModal(group.key);
        }
    }

    async function init() {
        applyUrlSearch();
        bindEvents();
        renderSnakeOptions();
        await loadGallery();
        await loadMine();
        openRequestedMorph();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
