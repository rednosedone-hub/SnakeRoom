const snakes = window.SnakeData.loadSnakesWithIds([]);

// Ids ticked in the picker. Kept separate from the filter so changing a filter
// never silently drops an animal the keeper already chose.
const selectedSnakeIds = new Set();

const elements = {
    printScopeSelect: document.getElementById("printScopeSelect"),
    snakePickerField: document.getElementById("snakePickerField"),
    snakePickerList: document.getElementById("snakePickerList"),
    snakePickerCount: document.getElementById("snakePickerCount"),
    selectAllVisibleButton: document.getElementById("selectAllVisibleButton"),
    clearSelectionButton: document.getElementById("clearSelectionButton"),
    sexFilter: document.getElementById("sexFilter"),
    statusFilter: document.getElementById("statusFilter"),
    clutchFilter: document.getElementById("clutchFilter"),
    includePhotoInput: document.getElementById("includePhotoInput"),
    singleCardPerPageInput: document.getElementById("singleCardPerPageInput"),
    printButton: document.getElementById("printButton"),
    sheet: document.getElementById("binCardSheet")
};

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getSnakePickerText(snake) {
    return `${snake.name || "Unnamed"} - ${window.SnakeData.getSnakeIdentityText(snake)}`;
}

function sortBySnakePickerText(a, b) {
    return getSnakePickerText(a).localeCompare(getSnakePickerText(b));
}

function getFilters() {
    return {
        sex: elements.sexFilter.value,
        status: elements.statusFilter.value,
        clutch: elements.clutchFilter.value
    };
}

function matchesFilters(snake, filters) {
    return (filters.sex === "All" || snake.sex === filters.sex)
        && (filters.status === "All" || snake.status === filters.status)
        && (filters.clutch === "All" || String(snake.clutchId || "") === filters.clutch);
}

function getFilteredSnakes() {
    const filters = getFilters();

    return snakes
        .filter(snake => matchesFilters(snake, filters))
        .sort(sortBySnakePickerText);
}

function getSelectedSnakes() {
    if (elements.printScopeSelect.value !== "Selected") {
        return getFilteredSnakes();
    }

    return snakes
        .filter(snake => selectedSnakeIds.has(snake.id))
        .sort(sortBySnakePickerText);
}

// Clutch ids look like "2025-01", so numeric sorting keeps them in hatch order.
function populateClutchFilter() {
    const current = elements.clutchFilter.value;
    const clutchIds = Array.from(new Set(
        snakes
            .map(snake => String(snake.clutchId || "").trim())
            .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    elements.clutchFilter.innerHTML = `<option value="All">All Clutches</option>`
        + clutchIds
            .map(clutchId => `<option value="${escapeHtml(clutchId)}">Clutch ${escapeHtml(clutchId)}</option>`)
            .join("");

    elements.clutchFilter.value = clutchIds.includes(current) ? current : "All";
}

function getPickerMeta(snake) {
    return [
        window.SnakeData.getSnakeIdentityText(snake),
        snake.sex,
        snake.clutchId ? `Clutch ${snake.clutchId}` : "",
        snake.status
    ].filter(Boolean).join(" · ");
}

function updatePickerCount() {
    const visibleIds = new Set(getFilteredSnakes().map(snake => snake.id));
    const hiddenCount = Array.from(selectedSnakeIds)
        .filter(id => !visibleIds.has(id)).length;

    elements.snakePickerCount.textContent = hiddenCount > 0
        ? `${selectedSnakeIds.size} selected · ${hiddenCount} hidden by filters`
        : `${selectedSnakeIds.size} selected`;
}

function renderSnakePicker() {
    const matches = getFilteredSnakes();

    elements.snakePickerList.innerHTML = matches.length > 0
        ? matches.map(snake => `
            <label class="bin-picker-row">
                <input type="checkbox" value="${escapeHtml(snake.id)}" data-snake-picker${selectedSnakeIds.has(snake.id) ? " checked" : ""}>
                <span class="bin-picker-name">${escapeHtml(snake.name || "Unnamed")}</span>
                <span class="bin-picker-meta">${escapeHtml(getPickerMeta(snake))}</span>
            </label>
        `).join("")
        : `<p class="empty-message">No snakes match these filters.</p>`;

    updatePickerCount();
}

function handlePrintScopeChange() {
    const picking = elements.printScopeSelect.value === "Selected";

    elements.snakePickerField.style.display = picking ? "block" : "none";

    if (picking) {
        renderSnakePicker();
    }

    renderBinCards();
}

// Filters narrow the picker list; they do not un-tick anything already chosen.
function handleFilterChange() {
    if (elements.printScopeSelect.value === "Selected") {
        renderSnakePicker();
    }

    renderBinCards();
}

function getSexClass(snake) {
    if (snake.sex === "Female") {
        return "female";
    }

    if (snake.sex === "Male") {
        return "male";
    }

    return "unknown";
}

function getGeneLabel(gene) {
    if (window.GeneTools && gene?.name) {
        return window.GeneTools.describeGene(gene);
    }

    return gene?.name || "";
}

function getMorphLabels(snake) {
    if (Array.isArray(snake.genes) && snake.genes.length > 0) {
        return snake.genes.map(getGeneLabel).filter(Boolean);
    }

    return [snake.morph || snake.ID || "No morph entered"];
}

function getCardDetails(snake) {
    return [
        snake.ID ? `ID: ${snake.ID}` : "",
        snake.hatchDate ? `Hatched: ${snake.hatchDate}` : "",
        snake.acquiredDate ? `Acquired: ${snake.acquiredDate}` : "",
        snake.clutchId ? `Clutch: ${snake.clutchId}` : ""
    ].filter(Boolean);
}

function renderBinCards() {
    const selectedSnakes = getSelectedSnakes();
    const includePhoto = elements.includePhotoInput.checked;
    elements.sheet.classList.toggle("single-card-pages", elements.singleCardPerPageInput.checked);
    // Printing an empty sheet is just a wasted page.
    elements.printButton.disabled = selectedSnakes.length === 0;

    if (selectedSnakes.length === 0) {
        const message = elements.printScopeSelect.value === "Selected"
            ? "No snakes selected yet. Tick the snakes to print their cards."
            : "No snakes match the selected filters.";

        elements.sheet.innerHTML = `
            <p class="empty-message print-hidden">${message}</p>
        `;
        return;
    }

    elements.sheet.innerHTML = selectedSnakes.map(snake => {
        const sexClass = getSexClass(snake);
        const morphLabels = getMorphLabels(snake);
        const details = getCardDetails(snake);
        const image = snake.image || "Images/TheSnakeRoom.jpg";

        return `
            <article class="bin-card ${sexClass}">
                <div class="bin-card-accent"></div>

                <header class="bin-card-header">
                    <div>
                        <p class="bin-card-kicker">${snake.sex || "Unknown"} ${snake.status ? `- ${snake.status}` : ""}</p>
                        <h3>${snake.name || "Unnamed"}</h3>
                    </div>
                    <img class="bin-card-qr" src="${window.SnakeData.getSnakeQrImageUrl(snake, 180)}" alt="QR code for ${snake.name || "snake"}">
                </header>

                <div class="bin-card-body ${includePhoto ? "" : "no-photo"}">
                    ${includePhoto ? `
                        <img class="bin-card-photo" src="${image}" alt="${snake.name || "Snake"}" onerror="this.src='Images/TheSnakeRoom.jpg'">
                    ` : ""}

                    <div class="bin-card-info">
                        <p class="bin-card-id">${window.SnakeData.getSnakeIdentityText(snake)}</p>

                        <div class="bin-card-morphs">
                            ${morphLabels.map(label => `<span>${label}</span>`).join("")}
                        </div>

                        <div class="bin-card-details">
                            ${details.map(detail => `<span>${detail}</span>`).join("")}
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

function printCards() {
    renderBinCards();
    window.print();
}

elements.printScopeSelect.addEventListener("change", handlePrintScopeChange);
elements.sexFilter.addEventListener("change", handleFilterChange);
elements.statusFilter.addEventListener("change", handleFilterChange);
elements.clutchFilter.addEventListener("change", handleFilterChange);
elements.includePhotoInput.addEventListener("change", renderBinCards);
elements.singleCardPerPageInput.addEventListener("change", renderBinCards);
elements.printButton.addEventListener("click", printCards);

elements.snakePickerList.addEventListener("change", event => {
    const checkbox = event.target.closest("input[data-snake-picker]");

    if (!checkbox) {
        return;
    }

    if (checkbox.checked) {
        selectedSnakeIds.add(checkbox.value);
    } else {
        selectedSnakeIds.delete(checkbox.value);
    }

    updatePickerCount();
    renderBinCards();
});

elements.selectAllVisibleButton.addEventListener("click", () => {
    getFilteredSnakes().forEach(snake => selectedSnakeIds.add(snake.id));
    renderSnakePicker();
    renderBinCards();
});

elements.clearSelectionButton.addEventListener("click", () => {
    selectedSnakeIds.clear();
    renderSnakePicker();
    renderBinCards();
});

populateClutchFilter();
renderBinCards();
