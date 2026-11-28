// The show take list lives on the existing finance show record. Scans add
// animal ids only; sales are still recorded on each animal as before.
(function () {
    const select = document.getElementById("plannerShowSelect");
    const scanLink = document.getElementById("plannerScanLink");
    const printAllLink = document.getElementById("plannerPrintAllCards");
    const list = document.getElementById("plannerAnimalList");
    const empty = document.getElementById("plannerEmpty");
    const status = document.getElementById("plannerStatus");
    const missing = document.getElementById("plannerMissing");

    function escapeHtml(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function data() {
        return {
            expos: window.SnakeFinance.getExpos(),
            snakes: window.SnakeData.loadSnakesWithIds([])
        };
    }

    function selectedExpo(expos) {
        const wanted = new URLSearchParams(window.location.search).get("expo") || select.value;
        return expos.find(expo => expo.id === wanted) || expos[0] || null;
    }

    function setSelectedUrl(expoId) {
        const url = new URL(window.location.href);
        if (expoId) url.searchParams.set("expo", expoId);
        else url.searchParams.delete("expo");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }

    function render() {
        const { expos, snakes } = data();
        const current = selectedExpo(expos);

        select.innerHTML = expos.length
            ? expos.map(expo => `<option value="${escapeHtml(expo.id)}">${escapeHtml(expo.name)}${expo.date ? ` · ${escapeHtml(expo.date)}` : ""}</option>`).join("")
            : `<option value="">No shows yet</option>`;

        if (!current) {
            list.innerHTML = "";
            empty.hidden = true;
            scanLink.setAttribute("aria-disabled", "true");
            scanLink.href = "finance.html";
            printAllLink.hidden = true;
            status.textContent = "Add a show in Finances first, then return here to plan the animals.";
            missing.hidden = true;
            return;
        }

        select.value = current.id;
        scanLink.removeAttribute("aria-disabled");
        scanLink.href = `scan-session.html?mode=show&expo=${encodeURIComponent(current.id)}`;
        status.textContent = `${current.name}: ${(current.animalIds || []).length} animal${(current.animalIds || []).length === 1 ? "" : "s"} on the take list.`;

        const ids = Array.isArray(current.animalIds) ? current.animalIds : [];
        const animals = ids.map(id => snakes.find(snake => snake.id === id)).filter(Boolean);
        const missingIds = ids.filter(id => !snakes.some(snake => snake.id === id));
        empty.hidden = animals.length > 0;
        missing.hidden = missingIds.length === 0;
        missing.textContent = missingIds.length
            ? `${missingIds.length} listed animal${missingIds.length === 1 ? " is" : "s are"} no longer in this collection. The show list entr${missingIds.length === 1 ? "y is" : "ies are"} kept.`
            : "";

        printAllLink.hidden = animals.length === 0;
        printAllLink.href = `hatchling-record.html?expo=${encodeURIComponent(current.id)}&bulk=1&print=1`;

        list.innerHTML = animals.map(snake => {
            const identity = window.SnakeData.getSnakeIdentityText(snake);
            return `
                <article class="expo-card">
                    <div>
                        <strong>${escapeHtml(snake.name || "Unnamed")}</strong>
                        <p class="form-hint">${escapeHtml(identity)}${snake.sex ? ` · ${escapeHtml(snake.sex)}` : ""}${snake.status ? ` · ${escapeHtml(snake.status)}` : ""}</p>
                    </div>
                    <div class="fin-actions">
                        <a class="secondary-button" target="_blank" rel="noopener"
                            href="hatchling-record.html?id=${encodeURIComponent(snake.id)}&amp;print=1">Print Sale Card</a>
                        <button type="button" class="fin-delete-button" data-remove-animal="${escapeHtml(snake.id)}">Remove</button>
                    </div>
                </article>
            `;
        }).join("");
    }

    select.addEventListener("change", () => {
        setSelectedUrl(select.value);
        render();
    });

    list.addEventListener("click", event => {
        const button = event.target.closest("[data-remove-animal]");
        if (!button) return;

        const id = button.getAttribute("data-remove-animal");
        const expos = window.SnakeFinance.getExpos();
        const current = expos.find(expo => expo.id === select.value);
        if (!current) return;

        current.animalIds = (current.animalIds || []).filter(animalId => animalId !== id);
        window.SnakeFinance.saveExpos(expos);
        render();
    });

    window.addEventListener("storage", event => {
        if (!event.key || event.key === "financeExpos" || event.key === "snakes") render();
    });
    window.addEventListener("pageshow", render);

    render();
})();
