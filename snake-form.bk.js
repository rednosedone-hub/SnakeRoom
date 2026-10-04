let snakes = loadSnakes();
let currentGenes = [];
let currentWeightHistory = [];

const editingIndex = getEditingIndex();

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

let currentFeedingHistory = [];

function loadSnakes() {
    const savedText = localStorage.getItem("snakes");

    if (!savedText) {
        return [];
    }

    const savedSnakes = JSON.parse(savedText);

    if (Array.isArray(savedSnakes)) {
        return savedSnakes;
    }

    return [];
}

function saveSnakes() {
    localStorage.setItem("snakes", JSON.stringify(snakes));
}

function getEditingIndex() {
    const params = new URLSearchParams(window.location.search);

    if (!params.has("index")) {
        return null;
    }

    const index = Number(params.get("index"));

    if (Number.isInteger(index) && index >= 0) {
        return index;
    }

    return null;
}

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

function setupGeneOptions() {
    const geneOptions = document.getElementById("geneOptions");

    geneOptions.innerHTML = window.GeneTools.catalog.map(gene => `
        <option value="${gene.name}"></option>
    `).join("");
}

function getGeneDescription(geneRecord) {
    return window.GeneTools.describeGene(geneRecord);
}

function hideCustomGenePanel() {
    document.getElementById("customGenePanel").style.display = "none";
}

function showCustomGenePanel() {
    document.getElementById("customGenePanel").style.display = "grid";
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

    const copies = mode === "visual" || mode === "super" ? 2 : 1;

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

    const savedGene = window.GeneTools.addCustomGeneToCatalog({
        name: geneName,
        type: geneType,
        superType: geneType === "recessive" ? "visual" : superType,
        allelicGroup: allelicGroup
    });

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

function updateImagePreview() {
    const imageInput = document.getElementById("imageInput");
    const imagePreview = document.getElementById("imagePreview");
    imagePreview.src = imageInput.value || "Images/TheSnakeRoom.jpg";
}

function fillFormForEdit() {
    if (editingIndex === null || !snakes[editingIndex]) {
        document.getElementById("formPageTitle").textContent = "Add Snake";
        document.getElementById("feedingIntervalInput").value = "14";
        currentGenes = [];
        currentWeightHistory = Array.isArray(snake.weightHistory)
            ? [...snake.weightHistory]
            : [];
        currentFeedingHistory = Array.isArray(snake.feedingHistory)
            ? [...snake.feedingHistory]
            : [];    
        renderGeneList();
        updateFeederSuggestion();
        updateImagePreview();
        renderWeightHistory({ weight: "" });
        return;
    }

    const snake = snakes[editingIndex];

    let snakes = loadSnakes();
let currentGenes = [];
let currentWeightHistory = [];
const editingIndex = getEditingIndex();

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

let currentFeedingHistory = [];
let currentWeightHistory = [];

function loadSnakes() {
    const savedText = localStorage.getItem("snakes");

    if (!savedText) {
        return [];
    }

    const savedSnakes = JSON.parse(savedText);

    if (Array.isArray(savedSnakes)) {
        return savedSnakes;
    }

    return [];
}

function saveSnakes() {
    localStorage.setItem("snakes", JSON.stringify(snakes));
}

function getEditingIndex() {
    const params = new URLSearchParams(window.location.search);

    if (!params.has("index")) {
        return null;
    }

    const index = Number(params.get("index"));

    if (Number.isInteger(index) && index >= 0) {
        return index;
    }

    return null;
}

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

function setupGeneOptions() {
    const geneOptions = document.getElementById("geneOptions");

    geneOptions.innerHTML = window.GeneTools.catalog.map(gene => `
        <option value="${gene.name}"></option>
    `).join("");
}

function getGeneDescription(geneRecord) {
    return window.GeneTools.describeGene(geneRecord);
}

function hideCustomGenePanel() {
    document.getElementById("customGenePanel").style.display = "none";
}

function showCustomGenePanel() {
    document.getElementById("customGenePanel").style.display = "grid";
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

    const copies = mode === "visual" || mode === "super" ? 2 : 1;

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

    const savedGene = window.GeneTools.addCustomGeneToCatalog({
        name: geneName,
        type: geneType,
        superType: geneType === "recessive" ? "visual" : superType,
        allelicGroup: allelicGroup
    });

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

function updateImagePreview() {
    const imageInput = document.getElementById("imageInput");
    const imagePreview = document.getElementById("imagePreview");
    imagePreview.src = imageInput.value || "Images/TheSnakeRoom.jpg";
}

function fillFormForEdit() {
    if (editingIndex === null || !snakes[editingIndex]) {
        document.getElementById("formPageTitle").textContent = "Add Snake";
        document.getElementById("feedingIntervalInput").value = "14";
        
        currentGenes = [];
        currentWeightHistory = [];
        currentFeedingHistory = [];
          
        renderGeneList();
        updateFeederSuggestion();
        updateImagePreview();
        renderWeightHistory({ weight: "" });
        return;
    }

    const snake = snakes[editingIndex];

    document.getElementById("formPageTitle").textContent = `Edit ${snake.name}`;
    document.getElementById("nameInput").value = snake.name || "";
    document.getElementById("snakeIDInput").value = snake.ID || snake.morph || "";
    document.getElementById("sexInput").value = snake.sex || "Unknown";
    document.getElementById("statusInput").value = snake.status || "Holdback";
    document.getElementById("weightInput").value = snake.weight || "";
    document.getElementById("hatchDateInput").value = snake.hatchDate || "";
    document.getElementById("acquiredDateInput").value = snake.acquiredDate || "";
    document.getElementById("lastFedInput").value = snake.lastFed || "";
    document.getElementById("feedingIntervalInput").value = snake.feedingIntervalDays || "7";
    document.getElementById("feederSizeInput").value = snake.feederSize || "";
    document.getElementById("imageInput").value = snake.image || "";
    currentGenes = Array.isArray(snake.genes) ? [...snake.genes] : [];
    currentWeightHistory = Array.isArray(snake.weightHistory) 
        ? [...snake.weightHistory] 
        : [];
    currentFeedingHistory = Array.isArray(snake.feedingHistory)
        ? [...snake.feedingHistory]
        :[];

    renderGeneList();
    updateFeederSuggestion();
    updateImagePreview();
    renderFeedingHistory(snake);
    renderWeightHistory(snake);
}

function getCurrentWeightHistory() {
    return Array.isArray(currentWeightHistory) ? currentWeightHistory : [];
}

function addWeightHistoryEntry() {
    const weightValue = document.getElementById("weightInput").value.trim();
    const weightDate = document.getElementById("weightDateInput").value;

    if (!weightValue || !weightDate) {
        alert("Enter both a weight and a date before adding a record.");
        return;
    }

    const entry = {
        date: weightDate,
        weight: Number(weightValue)
    };

    currentWeightHistory.push(entry);
    currentWeightHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    renderWeightHistory({ weight: weightValue, weightHistory: getCurrentWeightHistory() });
    document.getElementById("weightDateInput").value = "";
}

function renderWeightChart(history) {
    const container = document.getElementById("weightChartContainer");
    if (!container) return;

    const rows = history
        .map(entry => ({
            date: entry.date || entry.day || entry.label || "",
            weight: Number(entry.weight ?? entry.value ?? entry.result ?? entry)
        }))
        .filter(item => item.date && !Number.isNaN(item.weight))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (rows.length === 0) {
        container.innerHTML = `<p class="empty-message">No chart data yet.</p>`;
        return;
    }

    const width = 440;
    const height = 180;
    const padding = 30;
    const values = rows.map(item => item.weight);
    const minWeight = Math.min(...values);
    const maxWeight = Math.max(...values);
    const range = Math.max(1, maxWeight - minWeight);

    const points = rows.map((item, index) => {
        const x = padding + (index * (width - 2 * padding) / Math.max(1, rows.length - 1));
        const y = height - padding - ((item.weight - minWeight) / range) * (height - 2 * padding);
        return { x, y, label: item.date, value: item.weight };
    });

    const linePath = points.map(point => `${point.x},${point.y}`).join(" ");
    const minLabel = `${minWeight}g`;
    const maxLabel = `${maxWeight}g`;
    const xLabels = rows.map((row, index) => `
            <text x="${points[index].x}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#e6d986">
                ${row.date}
            </text>
        `).join("");

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" width="100%" height="180" aria-label="Weight growth chart">
            <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#555" stroke-width="1" />
            <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#555" stroke-width="1" />
            <text x="${padding - 8}" y="${padding + 4}" text-anchor="end" font-size="10" fill="#e6d986">${maxLabel}</text>
            <text x="${padding - 8}" y="${height - padding + 4}" text-anchor="end" font-size="10" fill="#e6d986">${minLabel}</text>
            <polyline points="${linePath}" fill="none" stroke="gold" stroke-width="2" />
            ${points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="gold" />`).join("")}
            ${xLabels}
        </svg>
    `;
}

function renderWeightHistory(snake) {
    const list = document.getElementById("weightHistoryList");
    if (!list) return;

    const history = Array.isArray(snake.weightHistory) ? snake.weightHistory : getCurrentWeightHistory();
    const weight = snake.weight || document.getElementById("weightInput")?.value || "";

    if (history.length === 0) {
        if (weight) {
            list.innerHTML = `
                <div class="dashboard-list-item">
                    <span>Latest</span>
                    <span>${weight} g</span>
                </div>
            `;
            renderWeightChart([{ date: new Date().toISOString().slice(0, 10), weight: Number(weight) }]);
            return;
        }

        list.innerHTML = `<p class="empty-message">No weight history yet.</p>`;
        renderWeightChart([]);
        return;
    }

    list.innerHTML = history.map((entry, index) => {
        const date = entry.date || entry.day || entry.label || "";
        const weightValue = entry.weight || entry.value || entry.result || entry;

        return `
            <div class="dashboard-list-item">
                <span>${date}</span>
                <span>${weightValue} g</span>
                <button type="button" class="gene-action-button" onclick="removeWeightHistoryEntry(${index})">
                    Remove
                </button>
            </div>
        `;
    }).join("");

    renderWeightChart(history);
}

function removeWeightHistoryEntry(index) {
    const history = getCurrentWeightHistory();
    if (index < 0 || index >= history.length) {
        return;
    }

    history.splice(index, 1);
    renderWeightHistory({ weight: document.getElementById("weightInput")?.value || "", weightHistory: getCurrentWeightHistory() });
}

function saveSnakeFromPage() {
    const name = document.getElementById("nameInput").value.trim();
    const morph = document.getElementById("snakeIDInput").value.trim();

    if (name === "" || morph === "") {
        alert("Please enter at least a name and ID.");
        return;
    }

   const snake = {
    name,
    ID: morph,
    morph,
    sex: document.getElementById("sexInput").value,

    weight: document.getElementById("weightInput").value,
    weightHistory: currentWeightHistory,

    lastFed: document.getElementById("lastFedInput").value,
    feedingIntervalDays: document.getElementById("feedingIntervalInput").value || 7,
    feederSize: document.getElementById("feederSizeInput").value.trim(),

    feedingHistory: currentFeedingHistory,

    hatchDate: document.getElementById("hatchDateInput").value,
    acquiredDate: document.getElementById("acquiredDateInput").value,

    status: document.getElementById("statusInput").value,
    genes: currentGenes,

    image: document.getElementById("imageInput").value.trim() || "Images/TheSnakeRoom.jpg"
};

    // Preserve feeding history when editing
    if (editingIndex === null || !snakes[editingIndex]) {
        snake.feedingHistory = [];
        snakes.push(snake);
    } else {
        snake.feedingHistory = Array.isArray(snakes[editingIndex].feedingHistory) ? snakes[editingIndex].feedingHistory : [];
        if (snake.weightHistory.length === 0 && Array.isArray(snakes[editingIndex].weightHistory)) {
            snake.weightHistory = snakes[editingIndex].weightHistory;
        }
        snakes[editingIndex] = snake;
    }

    saveSnakes();
    window.location.href = "snakes.html";
}

window.updateFeederSuggestion = updateFeederSuggestion;
window.useSuggestedFeederSize = useSuggestedFeederSize;
window.updateGeneButtons = updateGeneButtons;
window.addGene = addGene;
window.addCustomGene = addCustomGene;
window.removeGene = removeGene;
window.updateImagePreview = updateImagePreview;
window.saveSnakeFromPage = saveSnakeFromPage;
window.removeWeightHistoryEntry = removeWeightHistoryEntry;

setupGeneOptions();
fillFormForEdit();


    document.getElementById("formPageTitle").textContent = `Edit ${snake.name}`;
    document.getElementById("nameInput").value = snake.name || "";
    document.getElementById("snakeIDInput").value = snake.ID || snake.morph || "";
    document.getElementById("sexInput").value = snake.sex || "Unknown";
    document.getElementById("statusInput").value = snake.status || "Holdback";
    document.getElementById("weightInput").value = snake.weight || "";
    document.getElementById("hatchDateInput").value = snake.hatchDate || "";
    document.getElementById("acquiredDateInput").value = snake.acquiredDate || "";
    document.getElementById("lastFedInput").value = snake.lastFed || "";
    document.getElementById("feedingIntervalInput").value = snake.feedingIntervalDays || "7";
    document.getElementById("feederSizeInput").value = snake.feederSize || "";
    document.getElementById("imageInput").value = snake.image || "";
    currentGenes = Array.isArray(snake.genes) ? [...snake.genes] : [];
    currentWeightHistory = Array.isArray(snake.weightHistory) ? [...snake.weightHistory] : [];

    renderGeneList();
    updateFeederSuggestion();
    updateImagePreview();
    renderFeedingHistory(snake);
    renderWeightHistory(snake);
}

function getCurrentWeightHistory() {
    return Array.isArray(currentWeightHistory) ? currentWeightHistory : [];
}

function addWeightHistoryEntry() {
    const weightValue = document.getElementById("weightInput").value.trim();
    const weightDate = document.getElementById("weightDateInput").value;

    if (!weightValue || !weightDate) {
        alert("Enter both a weight and a date before adding a record.");
        return;
    }

    const entry = {
        date: weightDate,
        weight: Number(weightValue)
    };

    currentWeightHistory.push(entry);
    currentWeightHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    renderWeightHistory({ weight: weightValue, weightHistory: getCurrentWeightHistory() });
    document.getElementById("weightDateInput").value = "";
}

function renderWeightChart(history) {
    const container = document.getElementById("weightChartContainer");
    if (!container) return;

    const rows = history
        .map(entry => ({
            date: entry.date || entry.day || entry.label || "",
            weight: Number(entry.weight ?? entry.value ?? entry.result ?? entry)
        }))
        .filter(item => item.date && !Number.isNaN(item.weight))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (rows.length === 0) {
        container.innerHTML = `<p class="empty-message">No chart data yet.</p>`;
        return;
    }

    const width = 440;
    const height = 180;
    const padding = 30;
    const values = rows.map(item => item.weight);
    const minWeight = Math.min(...values);
    const maxWeight = Math.max(...values);
    const range = Math.max(1, maxWeight - minWeight);

    const points = rows.map((item, index) => {
        const x = padding + (index * (width - 2 * padding) / Math.max(1, rows.length - 1));
        const y = height - padding - ((item.weight - minWeight) / range) * (height - 2 * padding);
        return { x, y, label: item.date, value: item.weight };
    });

    const linePath = points.map(point => `${point.x},${point.y}`).join(" ");
    const minLabel = `${minWeight}g`;
    const maxLabel = `${maxWeight}g`;
    const xLabels = rows.map((row, index) => `
            <text x="${points[index].x}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#e6d986">
                ${row.date}
            </text>
        `).join("");

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" width="100%" height="180" aria-label="Weight growth chart">
            <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#555" stroke-width="1" />
            <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#555" stroke-width="1" />
            <text x="${padding - 8}" y="${padding + 4}" text-anchor="end" font-size="10" fill="#e6d986">${maxLabel}</text>
            <text x="${padding - 8}" y="${height - padding + 4}" text-anchor="end" font-size="10" fill="#e6d986">${minLabel}</text>
            <polyline points="${linePath}" fill="none" stroke="gold" stroke-width="2" />
            ${points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="gold" />`).join("")}
            ${xLabels}
        </svg>
    `;
}

function renderWeightHistory(snake) {
    const list = document.getElementById("weightHistoryList");
    if (!list) return;

    const history = Array.isArray(snake.weightHistory) ? snake.weightHistory : getCurrentWeightHistory();
    const weight = snake.weight || document.getElementById("weightInput")?.value || "";

    if (history.length === 0) {
        if (weight) {
            list.innerHTML = `
                <div class="dashboard-list-item">
                    <span>Latest</span>
                    <span>${weight} g</span>
                </div>
            `;
            renderWeightChart([{ date: new Date().toISOString().slice(0, 10), weight: Number(weight) }]);
            return;
        }

        list.innerHTML = `<p class="empty-message">No weight history yet.</p>`;
        renderWeightChart([]);
        return;
    }

    list.innerHTML = history.map((entry, index) => {
        const date = entry.date || entry.day || entry.label || "";
        const weightValue = entry.weight || entry.value || entry.result || entry;

        return `
            <div class="dashboard-list-item">
                <span>${date}</span>
                <span>${weightValue} g</span>
                <button type="button" class="gene-action-button" onclick="removeWeightHistoryEntry(${index})">
                    Remove
                </button>
            </div>
        `;
    }).join("");

    renderWeightChart(history);
}

function removeWeightHistoryEntry(index) {
    const history = getCurrentWeightHistory();
    if (index < 0 || index >= history.length) {
        return;
    }

    history.splice(index, 1);
    renderWeightHistory({ weight: document.getElementById("weightInput")?.value || "", weightHistory: getCurrentWeightHistory() });
}

function saveSnakeFromPage() {
    const name = document.getElementById("nameInput").value.trim();
    const morph = document.getElementById("snakeIDInput").value.trim();

    if (name === "" || morph === "") {
        alert("Please enter at least a name and ID.");
        return;
    }

   const snake = {
    name,
    ID: morph,
    morph,
    sex: document.getElementById("sexInput").value,

    weight: document.getElementById("weightInput").value,
    weightHistory: currentWeightHistory,

    lastFed: document.getElementById("lastFedInput").value,
    feedingIntervalDays: document.getElementById("feedingIntervalInput").value || 7,
    feederSize: document.getElementById("feederSizeInput").value.trim(),

    feedingHistory: currentFeedingHistory,

    hatchDate: document.getElementById("hatchDateInput").value,
    acquiredDate: document.getElementById("acquiredDateInput").value,

    status: document.getElementById("statusInput").value,
    genes: currentGenes,

    image: document.getElementById("imageInput").value.trim() || "Images/TheSnakeRoom.jpg"
};

    // Preserve feeding history when editing
    if (editingIndex === null || !snakes[editingIndex]) {
        snake.feedingHistory = [];
        snakes.push(snake);
    } else {
        snake.feedingHistory = Array.isArray(snakes[editingIndex].feedingHistory) ? snakes[editingIndex].feedingHistory : [];
        if (snake.weightHistory.length === 0 && Array.isArray(snakes[editingIndex].weightHistory)) {
            snake.weightHistory = snakes[editingIndex].weightHistory;
        }
        snakes[editingIndex] = snake;
    }

    saveSnakes();
    window.location.href = "snakes.html";
}

window.updateFeederSuggestion = updateFeederSuggestion;
window.useSuggestedFeederSize = useSuggestedFeederSize;
window.updateGeneButtons = updateGeneButtons;
window.addGene = addGene;
window.addCustomGene = addCustomGene;
window.removeGene = removeGene;
window.updateImagePreview = updateImagePreview;
window.saveSnakeFromPage = saveSnakeFromPage;
window.removeWeightHistoryEntry = removeWeightHistoryEntry;

setupGeneOptions();
fillFormForEdit();
