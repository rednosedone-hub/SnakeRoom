const snakes = window.SnakeData.loadSnakesWithIds([]);

const elements = {
    printScopeSelect: document.getElementById("printScopeSelect"),
    singleSnakeField: document.getElementById("singleSnakeField"),
    singleSnakeSelect: document.getElementById("singleSnakeSelect"),
    sexFilter: document.getElementById("sexFilter"),
    statusFilter: document.getElementById("statusFilter"),
    includePhotoInput: document.getElementById("includePhotoInput"),
    singleCardPerPageInput: document.getElementById("singleCardPerPageInput"),
    printButton: document.getElementById("printButton"),
    sheet: document.getElementById("binCardSheet")
};

function getSelectedSnakes() {
    if (elements.printScopeSelect.value === "Single") {
        const snakeId = elements.singleSnakeSelect.value;
        const snake = snakes.find(item => item.id === snakeId);

        return snake ? [snake] : [];
    }

    const selectedSex = elements.sexFilter.value;
    const selectedStatus = elements.statusFilter.value;

    return snakes
        .filter(snake => selectedSex === "All" || snake.sex === selectedSex)
        .filter(snake => selectedStatus === "All" || snake.status === selectedStatus)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

function getSnakePickerText(snake) {
    return `${snake.name || "Unnamed"} - ${window.SnakeData.getSnakeIdentityText(snake)}`;
}

function populateSingleSnakeSelect(selectedId) {
    const sorted = snakes
        .slice()
        .sort((a, b) => getSnakePickerText(a).localeCompare(getSnakePickerText(b)));

    elements.singleSnakeSelect.innerHTML = sorted.map(snake => `
        <option value="${snake.id}"${snake.id === selectedId ? " selected" : ""}>
            ${window.SnakeData.getSnakeLabelByReference(snakes, snake.id)}
        </option>
    `).join("");
}

function handlePrintScopeChange() {
    const isSingle = elements.printScopeSelect.value === "Single";

    elements.singleSnakeField.style.display = isSingle ? "block" : "none";

    if (isSingle) {
        populateSingleSnakeSelect(snakes[0]?.id || "");
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

    if (selectedSnakes.length === 0) {
        elements.sheet.innerHTML = `
            <p class="empty-message print-hidden">No snakes match the selected filters.</p>
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
elements.singleSnakeSelect.addEventListener("change", renderBinCards);
elements.sexFilter.addEventListener("change", renderBinCards);
elements.statusFilter.addEventListener("change", renderBinCards);
elements.includePhotoInput.addEventListener("change", renderBinCards);
elements.singleCardPerPageInput.addEventListener("change", renderBinCards);
elements.printButton.addEventListener("click", printCards);

renderBinCards();
