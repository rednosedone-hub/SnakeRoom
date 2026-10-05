let snakes = loadSnakes();
let editingIndex = null;
let currentGenes = [];
let collectionView = localStorage.getItem("collectionView") || "cards";
let selectedSnakeIndexes = new Set();

const snakeGrid = document.getElementById("snakeGrid");
const snakeTableWrapper = document.getElementById("snakeTableWrapper");

const SEX_FILTER_OPTIONS = ["All", "Female", "Male", "Unknown"];
const STATUS_FILTER_OPTIONS = ["Hatchling", "Holdback", "Breeder", "Available", "On Hold", "Sold"];
let collectionFilters = loadCollectionFilters();

function loadCollectionFilters() {
    try {
        const saved = JSON.parse(localStorage.getItem("collectionFilters"));

        if (saved && typeof saved === "object") {
            return {
                sex: saved.sex || "All",
                statuses: Array.isArray(saved.statuses) ? saved.statuses : [],
                morphText: saved.morphText || "",
                genes: Array.isArray(saved.genes) ? saved.genes : [],
                geneMatch: saved.geneMatch === "all" ? "all" : "any"
            };
        }
    } catch (error) {
        // Corrupted value falls through to the defaults.
    }

    return { sex: "All", statuses: [], morphText: "", genes: [], geneMatch: "any" };
}

function saveCollectionFilters() {
    localStorage.setItem("collectionFilters", JSON.stringify(collectionFilters));
}

function getActiveFilterCount() {
    let count = 0;

    if (collectionFilters.sex !== "All") count += 1;
    if (collectionFilters.statuses.length > 0) count += 1;
    if (collectionFilters.morphText.trim() !== "") count += 1;
    if (collectionFilters.genes.length > 0) count += 1;

    return count;
}

function snakeMatchesGene(snake, geneName) {
    const searchName = String(geneName).toLowerCase();
    const hasGene = Array.isArray(snake.genes) && snake.genes.some(gene =>
        String(gene.name || "").toLowerCase() === searchName
    );

    if (hasGene) {
        return true;
    }

    // Older records keep genes in the morph text instead of the genes array.
    return ["morph", "name", "ID"].some(field =>
        String(snake[field] || "").toLowerCase().includes(searchName)
    );
}

function snakeMatchesGeneFilters(snake) {
    if (collectionFilters.genes.length === 0) {
        return true;
    }

    const matches = collectionFilters.genes.map(geneName => snakeMatchesGene(snake, geneName));

    return collectionFilters.geneMatch === "all"
        ? matches.every(Boolean)
        : matches.some(Boolean);
}

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

const SORT_OPTIONS = [
    { key: "none", label: "Default Order" },
    { key: "nameAsc", label: "Name (A-Z)" },
    { key: "nameDesc", label: "Name (Z-A)" },
    { key: "morphAsc", label: "ID (A-Z)" },
    { key: "morphDesc", label: "ID (Z-A)" },
    { key: "binNumberAsc", label: "Bin Number (Low-High)" },
    { key: "binNumberDesc", label: "Bin Number (High-Low)" },
    { key: "sexAsc", label: "Sex (Females First)" },
    { key: "sexDesc", label: "Sex (Males First)" },
    { key: "weightDesc", label: "Weight (High-Low)" },
    { key: "weightAsc", label: "Weight (Low-High)" },
    { key: "fedAsc", label: "Last Fed (Oldest First)" },
    { key: "fedDesc", label: "Last Fed (Newest First)" },
    { key: "intervalAsc", label: "Feeding Interval (Shortest)" },
    { key: "intervalDesc", label: "Feeding Interval (Longest)" },
    { key: "feederAsc", label: "Feeder (A-Z)" },
    { key: "feederDesc", label: "Feeder (Z-A)" },
    { key: "statusAsc", label: "Status (A-Z)" },
    { key: "statusDesc", label: "Status (Z-A)" }
];
let currentSortKey = loadSortKey();

function loadSortKey() {
    const saved = localStorage.getItem("collectionSort");

    return SORT_OPTIONS.some(option => option.key === saved) ? saved : "none";
}

function compareByField(field, direction) {
    return (a, b) => {
        const valueA = a[field];
        const valueB = b[field];
        const aEmpty = valueA === undefined || valueA === null || String(valueA).trim() === "";
        const bEmpty = valueB === undefined || valueB === null || String(valueB).trim() === "";

        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;

        return String(valueA).localeCompare(String(valueB)) * direction;
    };
}

function compareByNumber(field, direction) {
    return (a, b) => {
        const valueA = a[field];
        const valueB = b[field];
        const aEmpty = valueA === undefined || valueA === null || String(valueA).trim() === "";
        const bEmpty = valueB === undefined || valueB === null || String(valueB).trim() === "";

        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;

        return (Number(valueA) - Number(valueB)) * direction;
    };
}

function compareByIdentity(direction) {
    return (a, b) => getSnakeIdentityText(a).localeCompare(getSnakeIdentityText(b)) * direction;
}

function compareByBin(direction) {
    return (a, b) => {
        // Put snakes with no bin at the end.
        if (!a.binNumber && !b.binNumber) return 0;
        if (!a.binNumber) return 1;
        if (!b.binNumber) return -1;

        const binA = String(a.binNumber).split("-");
        const binB = String(b.binNumber).split("-");
        const rowA = Number(binA[0]);
        const positionA = Number(binA[1]);
        const rowB = Number(binB[0]);
        const positionB = Number(binB[1]);

        if (rowA !== rowB) {
            return (rowA - rowB) * direction;
        }

        return (positionA - positionB) * direction;
    };
}

const SORT_COMPARATORS = {
    nameAsc: compareByField("name", 1),
    nameDesc: compareByField("name", -1),
    morphAsc: compareByIdentity(1),
    morphDesc: compareByIdentity(-1),
    binNumberAsc: compareByBin(1),
    binNumberDesc: compareByBin(-1),
    sexAsc: compareByField("sex", 1),
    sexDesc: compareByField("sex", -1),
    weightAsc: compareByNumber("weight", 1),
    weightDesc: compareByNumber("weight", -1),
    fedAsc: compareByField("lastFed", 1),
    fedDesc: compareByField("lastFed", -1),
    intervalAsc: compareByNumber("feedingIntervalDays", 1),
    intervalDesc: compareByNumber("feedingIntervalDays", -1),
    feederAsc: compareByField("feederSize", 1),
    feederDesc: compareByField("feederSize", -1),
    statusAsc: compareByField("status", 1),
    statusDesc: compareByField("status", -1)
};

function toggleSortPopover(event) {
    event.stopPropagation();
    document.getElementById("sortPopover").classList.toggle("open");
}

function closeSortPopover() {
    document.getElementById("sortPopover").classList.remove("open");
}

function renderSortPopover() {
    document.getElementById("sortPopover").innerHTML = SORT_OPTIONS.map(option => `
        <button type="button" class="sort-option ${currentSortKey === option.key ? "active" : ""}"
            onclick="applySortKey('${option.key}')">
            ${option.label}
        </button>
    `).join("");
    updateSortButtonLabel();
}

function updateSortButtonLabel() {
    const current = SORT_OPTIONS.find(option => option.key === currentSortKey);
    const labelSpan = document.getElementById("sortCurrentLabel");

    labelSpan.textContent = current && current.key !== "none" ? current.label : "";
    labelSpan.classList.toggle("visible", Boolean(current) && current.key !== "none");
}

function applySortKey(key) {
    currentSortKey = SORT_OPTIONS.some(option => option.key === key) ? key : "none";
    localStorage.setItem("collectionSort", currentSortKey);
    renderSortPopover();
    closeSortPopover();
    renderSnakes();
}

function toggleTableSort(columnKey) {
    const ascKey = `${columnKey}Asc`;

    applySortKey(currentSortKey === ascKey ? `${columnKey}Desc` : ascKey);
}

function getSortArrowFor(columnKey) {
    if (currentSortKey === `${columnKey}Asc`) {
        return "&#9650;";
    }

    if (currentSortKey === `${columnKey}Desc`) {
        return "&#9660;";
    }

    return "";
}

function getFilteredAndSortedSnakes() {
    let snakeList = snakes.map((snake, index) => {
        return {
            ...snake,
            originalIndex: index
        };
    });

    if (collectionFilters.sex !== "All") {
        snakeList = snakeList.filter(snake => snake.sex === collectionFilters.sex);
    }

    if (collectionFilters.statuses.length > 0) {
        snakeList = snakeList.filter(snake => collectionFilters.statuses.includes(snake.status));
    }

    const morphSearchText = collectionFilters.morphText.trim().toLowerCase();

    if (morphSearchText !== "") {
        snakeList = snakeList.filter(snake =>
            ["name", "morph", "ID"].some(field =>
                String(snake[field] || "").toLowerCase().includes(morphSearchText)
            )
        );
    }

    snakeList = snakeList.filter(snake => snakeMatchesGeneFilters(snake));

    const comparator = SORT_COMPARATORS[currentSortKey];

    if (comparator) {
        snakeList.sort(comparator);
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
        const clearFiltersButton = getActiveFilterCount() > 0
            ? `<button type="button" class="main-button" onclick="clearAllFilters()">Clear Filters</button>`
            : "";
        const emptyMessage = `
            <div class="empty-filter-state">
                <p class="empty-message">
                    No snakes match the current filter.
                </p>
                ${clearFiltersButton}
            </div>
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

function renderSnakeTableHeader() {
    const tableColumns = [
        { label: `<input type="checkbox" onchange="toggleAllVisibleSnakes(this.checked)">` },
        { label: "Name", sortKey: "name" },
        { label: "ID", sortKey: "morph" },
        { label: "Sex", sortKey: "sex" },
        { label: "Weight", sortKey: "weight" },
        { label: "Last Fed", sortKey: "fed" },
        { label: "Every", sortKey: "interval" },
        { label: "Feeder", sortKey: "feeder" },
        { label: "Status", sortKey: "status" },
        { label: "QR" },
        { label: "" }
    ];

    return tableColumns.map(column => {
        if (!column.sortKey) {
            return `<th>${column.label}</th>`;
        }

        return `
            <th class="sortable-header" onclick="toggleTableSort('${column.sortKey}')">
                ${column.label}<span class="sort-arrow">${getSortArrowFor(column.sortKey)}</span>
            </th>
        `;
    }).join("");
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
                    ${renderSnakeTableHeader()}
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

function updateFilterBadge() {
    const badge = document.getElementById("filterCountBadge");
    const count = getActiveFilterCount();

    badge.textContent = count;
    badge.classList.toggle("visible", count > 0);
}

function toggleFilterPanel() {
    document.getElementById("filterPanel").classList.toggle("open");
}

function closeFilterPanel() {
    document.getElementById("filterPanel").classList.remove("open");
}

function renderSexSegmented() {
    document.getElementById("sexSegmented").innerHTML = SEX_FILTER_OPTIONS.map(sex => `
        <button type="button" class="${collectionFilters.sex === sex ? "active" : ""}"
            onclick="setSexFilter('${sex}')">
            ${sex === "All" ? "All" : `${sex}s`}
        </button>
    `).join("");
}

function setSexFilter(sex) {
    collectionFilters.sex = sex;
    saveCollectionFilters();
    renderSexSegmented();
    updateFilterBadge();
    renderSnakes();
}

function renderStatusChips() {
    document.getElementById("statusChipRow").innerHTML = STATUS_FILTER_OPTIONS.map(status => `
        <button type="button" class="filter-chip ${collectionFilters.statuses.includes(status) ? "active" : ""}"
            onclick="toggleStatusFilter('${status}')">
            ${status}
        </button>
    `).join("");
}

function toggleStatusFilter(status) {
    const position = collectionFilters.statuses.indexOf(status);

    if (position >= 0) {
        collectionFilters.statuses.splice(position, 1);
    } else {
        collectionFilters.statuses.push(status);
    }

    saveCollectionFilters();
    renderStatusChips();
    updateFilterBadge();
    renderSnakes();
}

function renderGeneChips() {
    const chipRow = document.getElementById("geneChipRow");

    if (!window.GeneTools || !Array.isArray(window.GeneTools.catalog)) {
        chipRow.innerHTML = `<span class="filter-hint">Gene catalog not loaded.</span>`;
        return;
    }

    chipRow.innerHTML = window.GeneTools.catalog.map(gene => {
        const encodedName = encodeURIComponent(gene.name);

        return `
            <button type="button" class="filter-chip ${collectionFilters.genes.includes(gene.name) ? "active" : ""}"
                onclick="toggleGeneFilter(decodeURIComponent('${encodedName}'))">
                ${gene.name}
            </button>
        `;
    }).join("");
}

function toggleGeneFilter(geneName) {
    const position = collectionFilters.genes.indexOf(geneName);

    if (position >= 0) {
        collectionFilters.genes.splice(position, 1);
    } else {
        collectionFilters.genes.push(geneName);
    }

    saveCollectionFilters();
    renderGeneChips();
    updateFilterBadge();
    renderSnakes();
}

function renderGeneMatchSegmented() {
    document.getElementById("geneMatchSegmented").innerHTML = ["any", "all"].map(mode => `
        <button type="button" class="${collectionFilters.geneMatch === mode ? "active" : ""}"
            onclick="setGeneMatchMode('${mode}')">
            ${mode === "any" ? "Any" : "All"}
        </button>
    `).join("");
}

function setGeneMatchMode(mode) {
    collectionFilters.geneMatch = mode;
    saveCollectionFilters();
    renderGeneMatchSegmented();
    renderSnakes();
}

function updateMorphFilter(value) {
    collectionFilters.morphText = value;
    saveCollectionFilters();
    updateFilterBadge();
    renderSnakes();
}

function clearAllFilters() {
    collectionFilters = { sex: "All", statuses: [], morphText: "", genes: [], geneMatch: "any" };
    document.getElementById("morphFilterInput").value = "";

    saveCollectionFilters();
    renderSexSegmented();
    renderStatusChips();
    renderGeneChips();
    renderGeneMatchSegmented();
    updateFilterBadge();
    renderSnakes();
}

function renderFilterControls() {
    document.getElementById("morphFilterInput").value = collectionFilters.morphText;
    renderSexSegmented();
    renderStatusChips();
    renderGeneChips();
    renderGeneMatchSegmented();
    updateFilterBadge();
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
window.toggleSortPopover = toggleSortPopover;
window.closeSortPopover = closeSortPopover;
window.applySortKey = applySortKey;
window.toggleTableSort = toggleTableSort;
window.toggleFilterPanel = toggleFilterPanel;
window.closeFilterPanel = closeFilterPanel;
window.setSexFilter = setSexFilter;
window.toggleStatusFilter = toggleStatusFilter;
window.toggleGeneFilter = toggleGeneFilter;
window.setGeneMatchMode = setGeneMatchMode;
window.updateMorphFilter = updateMorphFilter;
window.clearAllFilters = clearAllFilters;

setupGeneOptions();
renderFilterControls();
renderSortPopover();
renderSnakes();

document.addEventListener("click", event => {
    const popover = document.getElementById("sortPopover");

    if (!popover || !popover.classList.contains("open")) {
        return;
    }

    const sortButton = document.getElementById("sortToggleButton");

    if (!popover.contains(event.target) && !sortButton.contains(event.target)) {
        closeSortPopover();
    }
});
