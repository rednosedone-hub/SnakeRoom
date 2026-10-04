let snakes = loadSnakes();
let editingIndex = null;
let currentGenes = [];
let collectionView = localStorage.getItem("collectionView") || "cards";
let selectedSnakeIndexes = new Set();

const snakeGrid = document.getElementById("snakeGrid");
const snakeTableWrapper = document.getElementById("snakeTableWrapper");

function loadSnakes() {
    return window.SnakeData.loadSnakesWithIds(window.SnakeData.defaultSnakes);
}

function saveSnakes() {
    window.SnakeData.saveStorageArray("snakes", snakes);
}

function goToSnakeForm(index) {
    window.location.href = `snake-form.html?index=${index}`;
}

const feederRules = {
    Female: [
        { maxWeight: 200, feederSize: "Rat Fuzzy" },
        { maxWeight: 350, feederSize: "Rat Pup" },
        { maxWeight: 500, feederSize: "Weaned Rat" },
        { maxWeight: 1000, feederSize: "Small Rat" },
        { maxWeight: Infinity, feederSize: "Medium Rat" }
    ],
    Male: [
        { maxWeight: 200, feederSize: "Rat Fuzzy" },
        { maxWeight: 350, feederSize: "Rat Pup" },
        { maxWeight: 500, feederSize: "Weaned Rat" },
        { maxWeight: Infinity, feederSize: "Small Rat" }
    ],
    Unknown: [
        { maxWeight: 200, feederSize: "Rat Fuzzy" },
        { maxWeight: 350, feederSize: "Rat Pup" },
        { maxWeight: 500, feederSize: "Weaned Rat" },
        { maxWeight: Infinity, feederSize: "Small Rat" }
    ]
};

function getSuggestedFeederSize(weight, sex) {
    const numericWeight = Number(weight);

    if (!numericWeight || numericWeight <= 0) {
        return "";
    }

    const rules = feederRules[sex] || feederRules.Unknown;
    const matchedRule = rules.find(rule => numericWeight <= rule.maxWeight);

    return matchedRule ? matchedRule.feederSize : "";
}

function updateFeederSuggestion() {
    const suggestionText = document.getElementById("feederSuggestionText");
    const weight = document.getElementById("weightInput").value;
    const sex = document.getElementById("sexInput").value;
    const suggestedFeederSize = getSuggestedFeederSize(weight, sex);

    if (!suggestedFeederSize) {
        suggestionText.textContent = "Enter weight to suggest feeder size.";
        return;
    }

    suggestionText.textContent = `Suggested feeder: ${suggestedFeederSize}`;
}

function useSuggestedFeederSize() {
    const weight = document.getElementById("weightInput").value;
    const sex = document.getElementById("sexInput").value;
    const suggestedFeederSize = getSuggestedFeederSize(weight, sex);

    if (!suggestedFeederSize) {
        alert("Enter a weight first.");
        return;
    }

    document.getElementById("feederSizeInput").value = suggestedFeederSize;
}

function setCollectionView(viewName) {
    collectionView = viewName;
    localStorage.setItem("collectionView", viewName);
    renderSnakes();
}

function getTodayText() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function updateViewButtons() {
    document.getElementById("cardsViewButton")
        .classList.toggle("active-view-button", collectionView === "cards");

    document.getElementById("tableViewButton")
        .classList.toggle("active-view-button", collectionView === "table");
}

function updateBulkActionBar() {
    const bulkActionBar = document.getElementById("bulkActionBar");
    const selectedCount = document.getElementById("selectedCount");
    const bulkFedDateInput = document.getElementById("bulkFedDateInput");
    const count = selectedSnakeIndexes.size;

    if (bulkFedDateInput.value === "") {
        bulkFedDateInput.value = getTodayText();
    }

    selectedCount.textContent = count === 1 ? "1 selected" : 
    `${count} selected`;
    bulkActionBar.style.display = collectionView === "table" ? 
    "flex" : "none";
}

function getGeneDescription(geneRecord) {
    if (window.GeneTools) {
        return window.GeneTools.describeGene(geneRecord);
    }

    return geneRecord.name;
}

function getSnakeIdentityText(snake) {
    return window.SnakeData.getSnakeIdentityText(snake);
}

function setupGeneOptions() {
    const geneOptions = document.getElementById("geneOptions");

    if (!geneOptions || !window.GeneTools) {
        return;
    }

    geneOptions.innerHTML = window.GeneTools.catalog.map(gene => `
        <option value="${gene.name}"></option>
    `).join("");
}

function hideCustomGenePanel() {
    document.getElementById("customGenePanel").style.display = "none";
}

function showCustomGenePanel() {
    document.getElementById("customGenePanel").style.display = "grid";
}

function getSelectValue(id, fallbackValue) {
    const select = document.getElementById(id);

    if (select) {
        return select.value;
    }

    return fallbackValue;
}

function getFilteredAndSortedSnakes() {
    const selectedFilter = getSelectValue("filterSelect", "All");
    const selectedStatus = getSelectValue("statusSelect", "All");
    const selectedSort = getSelectValue("sortSelect", "None");

    let snakeList = snakes.map((snake, index) => {
        return {
            ...snake,
            originalIndex: index
        };
    });

    if (selectedFilter !== "All") {
        snakeList = snakeList.filter(snake => snake.sex === selectedFilter);
    }

    if (selectedStatus !== "All") {
        snakeList = snakeList.filter(snake => snake.status === selectedStatus);
    }

    if (selectedSort === "nameAsc") {
        snakeList.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (selectedSort === "nameDesc") {
        snakeList.sort((a, b) => b.name.localeCompare(a.name));
    }

    if (selectedSort === "morphAsc") {
        snakeList.sort((a, b) => getSnakeIdentityText(a).localeCompare(getSnakeIdentityText(b)));
    }

    if (selectedSort === "morphDesc") {
        snakeList.sort((a, b) => getSnakeIdentityText(b).localeCompare(getSnakeIdentityText(a)));
    }

    if (selectedSort === "sexAsc") {
        snakeList.sort((a, b) => a.sex.localeCompare(b.sex));
    }

    if (selectedSort === "sexDesc") {
        snakeList.sort((a, b) => b.sex.localeCompare(a.sex));
    }

    if (selectedSort === "weightAsc") {
        snakeList.sort((a, b) => Number(a.weight || 0) - Number(b.weight || 0));
    }

    if (selectedSort === "weightDesc") {
        snakeList.sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
    }

    if (selectedSort === "binNumberAsc") {
    snakeList.sort((a, b) => {
        const binA = String(a.binNumber || "").split("-");
        const binB = String(b.binNumber || "").split("-");

        // Put snakes with no bin at the end
        if (!a.binNumber && !b.binNumber) return 0;
        if (!a.binNumber) return 1;
        if (!b.binNumber) return -1;

        const rowA = Number(binA[0]);
        const positionA = Number(binA[1]);

        const rowB = Number(binB[0]);
        const positionB = Number(binB[1]);

        if (rowA !== rowB) {
            return rowA - rowB;
        }

        return positionA - positionB;
    });
}

    if (selectedSort === "binNumberDesc") {
        snakeList.sort((a, b) => {
            const binA = String(a.binNumber || "").split("-");
            const binB = String(b.binNumber || "").split("-");

            // Put snakes with no bin at the end
            if (!a.binNumber && !b.binNumber) return 0;
            if (!a.binNumber) return 1;
            if (!b.binNumber) return -1;

            const rowA = Number(binA[0]);
            const positionA = Number(binA[1]);

            const rowB = Number(binB[0]);
            const positionB = Number(binB[1]);

            if (rowA !== rowB) {
                return rowB - rowA;
            }

        return positionB - positionA;
    });
}

    return snakeList;
}

function renderSnakes() {
    const snakeList = getFilteredAndSortedSnakes();

    window.collectionDebug = {
        savedSnakes: snakes,
        visibleSnakes: snakeList,
        collectionView: collectionView
    };

    snakeGrid.innerHTML = "";
    snakeTableWrapper.innerHTML = "";
    updateViewButtons();
    updateBulkActionBar();

    if (snakeList.length === 0) {
        const emptyMessage = `
            <p class="empty-message">
                No snakes match the current filter.
            </p>
        `;

        if (collectionView === "cards") {
            snakeGrid.innerHTML = emptyMessage;
        } else {
            snakeTableWrapper.innerHTML = emptyMessage;
        }

        return;
    }

    if (collectionView === "table") {
        renderSnakeTable(snakeList);
        return;
    }

    snakeList.forEach(snake => {
        const card = document.createElement("div");

        card.classList.add("snake-card");

        const sexIcon = snake.sex === "Male" ? "&male;" : snake.sex === "Female" ? "&female;" : "?";
        const sexClass = snake.sex === "Male" ? "male-icon" : snake.sex === "Female" ? "female-icon" : "unknown-icon";
        const identityText = getSnakeIdentityText(snake);
        const weightText = snake.weight ? `${snake.weight}g` : "No weight";
        const hatchDateText = snake.hatchDate ? snake.hatchDate : "No hatch date";
        const acquiredDateText = snake.acquiredDate ? snake.acquiredDate : "No acquired date";
        const feederText = snake.feederSize ? `Feeder: ${snake.feederSize}` : "No feeder size";
        const feedingText = snake.lastFed
            ? `Last fed: ${snake.lastFed} / every ${snake.feedingIntervalDays || 7} days`
            : "No feeding date";
        const genePills = Array.isArray(snake.genes) && snake.genes.length > 0
            ? snake.genes.map(gene => `<span class="gene-pill">${getGeneDescription(gene)}</span>`).join("")
            : `<span class="gene-pill">No genes entered</span>`;
        const binNumberText = snake.binNumber ? `Bin: ${snake.binNumber}` : "No bin number";
        const photoCountBadge = Array.isArray(snake.photos) && snake.photos.length > 1
            ? `<span class="photo-count-badge" title="${snake.photos.length} photos">&#128247; ${snake.photos.length}</span>`
            : "";

        card.innerHTML = `
            <a href="${snake.image}">
                <img src="${snake.image}" class="snake-thumbnail" alt="${snake.name}"
                    onerror="this.onerror=null;this.src='Images/TheSnakeRoom.jpg'">
            </a>

            <div class="snake-info">
                <div class="snake-header">
                    <h3 class="snake-name">${snake.name}</h3>
                    <span class="${sexClass}">${sexIcon}</span>
                    ${photoCountBadge}
                </div>

                <p class="snake-morph">${identityText}
                    <span class="bin-number">${binNumberText}</span>
                </p>

                <div class="snake-weight">
                    <span>${weightText}</span>
                    <span>${acquiredDateText}</span>
                </div>

                <div class="snake-details">
                    <span>${feedingText}</span>
                    <span>${feederText}</span>
                    <span>${snake.status || "No status"}</span>
                </div>

                <div class="snake-genes">
                    ${genePills}
                </div>

                <div class="snake-qr">
                    <img src="${window.SnakeData.getSnakeQrImageUrl(snake, 130)}" alt="QR code for ${snake.name}">
                    <span>Scan for record</span>
                </div>

                <div class="card-buttons">
                    <button class="edit-button" onclick="goToSnakeForm(${snake.originalIndex})">
                        Edit
                    </button>

                    <button class="delete-button" onclick="deleteSnake(${snake.originalIndex})">
                        Delete
                    </button>
                </div>
            </div>
        `;

        snakeGrid.appendChild(card);
    });
}

function renderSnakeTable(snakeList) {
    const rows = snakeList.map(snake => {
        const isChecked = selectedSnakeIndexes.has(snake.originalIndex) ? "checked" : "";
        const weightText = snake.weight ? `${snake.weight}g` : "";
        const identityText = getSnakeIdentityText(snake);
        const feedingInterval = snake.feedingIntervalDays || 7;

        return `
            <tr>
                <td>
                    <input
                        type="checkbox"
                        ${isChecked}
                        onchange="toggleSnakeSelection(${snake.originalIndex}, this.checked)">
                </td>
                <td>${snake.name}</td>
                <td>${identityText}</td>
                <td>${snake.sex}</td>
                <td>${weightText}</td>
                <td>${snake.lastFed || ""}</td>
                <td>${feedingInterval}</td>
                <td>${snake.feederSize || ""}</td>
                <td>${snake.status || ""}</td>
                <td>
                    <a href="${window.SnakeData.getSnakeQrImageUrl(snake, 220)}" target="_blank" rel="noopener">
                        QR
                    </a>
                </td>
                <td>
                    <button class="edit-button table-action-button" onclick="goToSnakeForm(${snake.originalIndex})">
                        Edit
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    snakeTableWrapper.innerHTML = `
        <table class="snake-table">
            <thead>
                <tr>
                    <th>
                        <input type="checkbox" onchange="toggleAllVisibleSnakes(this.checked)">
                    </th>
                    <th>Name</th>
                    <th>ID</th>
                    <th>Sex</th>
                    <th>Weight</th>
                    <th>Last Fed</th>
                    <th>Every</th>
                    <th>Feeder</th>
                    <th>Status</th>
                    <th>QR</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

function toggleSnakeSelection(index, isSelected) {
    if (isSelected) {
        selectedSnakeIndexes.add(index);
    } else {
        selectedSnakeIndexes.delete(index);
    }

    updateBulkActionBar();
}

function toggleAllVisibleSnakes(isSelected) {
    getFilteredAndSortedSnakes().forEach(snake => {
        if (isSelected) {
            selectedSnakeIndexes.add(snake.originalIndex);
        } else {
            selectedSnakeIndexes.delete(snake.originalIndex);
        }
    });

    renderSnakes();
}

function clearSelectedSnakes() {
    selectedSnakeIndexes.clear();
    renderSnakes();
}

function markSelectedFed() {
    const fedDate = document.getElementById("bulkFedDateInput").value || getTodayText();

    if (selectedSnakeIndexes.size === 0) {
        alert("Select at least one snake first.");
        return;
    }

    selectedSnakeIndexes.forEach(index => {
        snakes[index].lastFed = fedDate;
        if (!Array.isArray(snakes[index].feedingHistory)) {
            snakes[index].feedingHistory = [];
        }
        snakes[index].feedingHistory.push({ date: fedDate, result: "" });
    });

    saveSnakes();
    clearSelectedSnakes();
}

function updateSelectedFeederSizes() {
    if (selectedSnakeIndexes.size === 0) {
        alert("Select at least one snake first.");
        return;
    }

    let updatedCount = 0;

    selectedSnakeIndexes.forEach(index => {
        const snake = snakes[index];
        const suggestedFeederSize = getSuggestedFeederSize(snake.weight, snake.sex);

        if (suggestedFeederSize) {
            snake.feederSize = suggestedFeederSize;
            updatedCount += 1;
        }
    });

    saveSnakes();
    renderSnakes();
    alert(`${updatedCount} feeder sizes updated.`);
}

function deleteSnake(index) {
    const snake = snakes[index];

    if (!snake) {
        return;
    }

    if (!confirm(`Delete ${snake.name || "this snake"}? Active breeding pairs that use it will be removed.`)) {
        return;
    }

    snakes.splice(index, 1);
    saveSnakes();

    // Remove active pairs that reference this snake. Clutches are historical
    // records, so they are kept and simply show "Unknown snake" for a removed parent.
    const breedingPairs = window.SnakeData.readStorageArray("breedingPairs", []);
    const pairsChanged = breedingPairs.some(pair =>
        pair.femaleSnakeId === snake.id || pair.maleSnakeId === snake.id
    );

    if (pairsChanged) {
        window.SnakeData.saveStorageArray("breedingPairs",
            breedingPairs.filter(pair =>
                pair.femaleSnakeId !== snake.id && pair.maleSnakeId !== snake.id
            )
        );
    }

    renderSnakes();
}

function openModal() {
    // Kept for compatibility; the collection uses snake-form.html for add/edit.
}

function closeModal() {
    // Kept for compatibility; the collection uses snake-form.html for add/edit.
}

function updateGeneButtons() {
    const geneName = document.getElementById("geneInput").value.trim();
    const geneButtonRow = document.getElementById("geneButtonRow");
    const geneHelp = document.getElementById("geneHelp");

    geneButtonRow.innerHTML = "";
    hideCustomGenePanel();

    if (geneName === "") {
        geneHelp.textContent = "Type a gene name to add calculator-ready genetics.";
        return;
    }

    const gene = window.GeneTools.findGene(geneName);

    if (!gene) {
        geneHelp.textContent = "This gene is not in the catalog yet.";
        showCustomGenePanel();
        geneButtonRow.innerHTML = `
            <button type="button" class="gene-action-button" onclick="addCustomGene()">
                Save And Add Gene
            </button>
        `;
        return;
    }

    if (gene.type === "recessive") {
        geneHelp.textContent = `${gene.name} is recessive. Add Het for one copy, or Visual for two copies.`;
        geneButtonRow.innerHTML = `
            <button type="button" class="gene-action-button" onclick="addGene('het')">
                Add Het
            </button>
            <button type="button" class="gene-action-button" onclick="addGene('visual')">
                Add Visual
            </button>
        `;
        return;
    }

    geneHelp.textContent = `${gene.name} is co-dom. One copy is visual.`;
    geneButtonRow.innerHTML = `
        <button type="button" class="gene-action-button" onclick="addGene('single')">
            Add
        </button>
    `;

    if (gene.superType === "viable") {
        geneButtonRow.innerHTML += `
            <button type="button" class="gene-action-button" onclick="addGene('super')">
                Add Super
            </button>
        `;
    }

    if (gene.superType === "lethal") {
        geneHelp.textContent += " The super form is lethal, so it is saved for calculator logic but not added as a living snake.";
    }
}

function addGene(mode) {
    const geneInput = document.getElementById("geneInput");
    const gene = window.GeneTools.findGene(geneInput.value);

    if (!gene) {
        alert("That gene is not in the catalog yet.");
        return;
    }

    let copies = 1;

    if (mode === "visual" || mode === "super") {
        copies = 2;
    }

    currentGenes = currentGenes.filter(currentGene => currentGene.name !== gene.name);
    currentGenes.push({
        name: gene.name,
        type: gene.type,
        copies: copies
    });

    geneInput.value = "";
    renderGeneList();
    updateGeneButtons();
}

function addCustomGene() {
    const geneInput = document.getElementById("geneInput");
    const geneName = geneInput.value.trim();
    const geneType = document.getElementById("customGeneType").value;
    const superType = document.getElementById("customSuperType").value;
    const allelicGroup = document.getElementById("customAllelicGroup").value.trim();

    if (geneName === "") {
        return;
    }

    const newGene = {
        name: geneName,
        type: geneType,
        superType: geneType === "recessive" ? "visual" : superType,
        allelicGroup: allelicGroup
    };

    const savedGene = window.GeneTools.addCustomGeneToCatalog(newGene);

    currentGenes = currentGenes.filter(currentGene =>
        currentGene.name.toLowerCase() !== savedGene.name.toLowerCase()
    );

    currentGenes.push({
        name: savedGene.name,
        type: savedGene.type,
        copies: 1
    });

    geneInput.value = "";
    document.getElementById("customAllelicGroup").value = "";
    setupGeneOptions();
    renderGeneList();
    updateGeneButtons();
}

function removeGene(index) {
    currentGenes.splice(index, 1);
    renderGeneList();
}

function renderGeneList() {
    const geneList = document.getElementById("geneList");

    if (currentGenes.length === 0) {
        geneList.innerHTML = `
            <span class="gene-pill">No genes entered</span>
        `;
        return;
    }

    geneList.innerHTML = currentGenes.map((gene, index) => `
        <span class="gene-pill">
            ${getGeneDescription(gene)}
            <button type="button" class="gene-remove-button" onclick="removeGene(${index})">
                x
            </button>
        </span>
    `).join("");
}

window.deleteSnake = deleteSnake;
window.renderSnakes = renderSnakes;
window.goToSnakeForm = goToSnakeForm;
window.setCollectionView = setCollectionView;
window.toggleSnakeSelection = toggleSnakeSelection;
window.toggleAllVisibleSnakes = toggleAllVisibleSnakes;
window.clearSelectedSnakes = clearSelectedSnakes;
window.markSelectedFed = markSelectedFed;
window.updateSelectedFeederSizes = updateSelectedFeederSizes;
window.updateFeederSuggestion = updateFeederSuggestion;
window.useSuggestedFeederSize = useSuggestedFeederSize;
window.updateGeneButtons = updateGeneButtons;
window.addGene = addGene;
window.addCustomGene = addCustomGene;
window.removeGene = removeGene;

setupGeneOptions();
renderSnakes();
