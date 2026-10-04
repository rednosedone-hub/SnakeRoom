let snakes = loadSnakes();
let currentGenes = [];
let currentWeightHistory = [];
let currentFeedingHistory = [];
let currentShedHistory = [];

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

function loadSnakes() {
    return window.SnakeData.loadSnakesWithIds([]);
}

function saveSnakes() {
    localStorage.setItem("snakes", JSON.stringify(snakes));
}

function getEditingIndex() {
    const params = new URLSearchParams(window.location.search);

    if (params.has("uid")) {
        const index = window.SnakeData.findSnakeIndexById(snakes, params.get("uid"));
        return index >= 0 ? index : null;
    }

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
    if (!suggestionText) return;

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

    if (!geneOptions || !window.GeneTools) {
        return;
    }

    geneOptions.innerHTML = window.GeneTools.catalog.map(gene => `
        <option value="${gene.name}"></option>
    `).join("");
}

function getGeneDescription(geneRecord) {
    return window.GeneTools.describeGene(geneRecord);
}

function hideCustomGenePanel() {
    const panel = document.getElementById("customGenePanel");
    if (panel) panel.style.display = "none";
}

function showCustomGenePanel() {
    const panel = document.getElementById("customGenePanel");
    if (panel) panel.style.display = "grid";
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

// ---- Photo picker ----------------------------------------------------------

const DEFAULT_PHOTO_HINT = "Pick a photo from this device. On a phone this opens your camera roll. Photos are shrunk and uploaded to your cloud storage.";

function setPhotoStatus(message, isError = false) {
    const status = document.getElementById("photoUploadStatus");

    if (!status) return;

    status.textContent = message;
    status.classList.toggle("import-error", isError);
}

async function savePhotoAsDataUrl(file, reason, fallbackValue) {
    const imageInput = document.getElementById("imageInput");
    const photoFileInput = document.getElementById("photoFileInput");
    const keepLocal = confirm(
        reason + "\n\n" +
        "Keep this photo on this device only? It will not be in your cloud backup " +
        "until you connect and sign in on the Cloud Sync page."
    );

    if (!keepLocal) {
        imageInput.value = fallbackValue || "";

        if (photoFileInput) {
            photoFileInput.value = "";
        }

        updateImagePreview();
        setPhotoStatus("Photo not added.");
        return;
    }

    setPhotoStatus("Preparing photo for this device\u2026");

    let blob = file;

    if (window.CloudSync && typeof window.CloudSync.compressImageToJpeg === "function") {
        try {
            blob = await window.CloudSync.compressImageToJpeg(file);
        } catch (error) {
            blob = file;
        }
    }

    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(blob);
    });

    imageInput.value = dataUrl;
    updateImagePreview();
    setPhotoStatus("Photo saved on this device only. Connect to Cloud Sync and pick it again to store it in the cloud.");
}

async function handlePhotoFileChange(event) {
    const input = event.target;
    const file = input.files && input.files[0];

    if (!file) return;

    const imageInput = document.getElementById("imageInput");
    const previousValue = imageInput.value;
    const objectUrl = URL.createObjectURL(file);

    imageInput.value = objectUrl;
    updateImagePreview();

    if (!window.CloudSync || typeof window.CloudSync.uploadSnakePhotoFile !== "function") {
        await savePhotoAsDataUrl(file, "The cloud sync helper did not load on this page.", previousValue);
        return;
    }

    setPhotoStatus("Shrinking and uploading photo\u2026");

    try {
        const url = await window.CloudSync.uploadSnakePhotoFile(file, previousValue);

        imageInput.value = url;
        URL.revokeObjectURL(objectUrl);
        updateImagePreview();
        setPhotoStatus("Photo saved to cloud storage. Press Save Snake to keep it.");
    } catch (error) {
        const message = error && error.message ? error.message : String(error);

        if (message === "Not signed in." || message.includes("No Supabase connection")) {
            await savePhotoAsDataUrl(file, message, previousValue);
            return;
        }

        imageInput.value = previousValue;
        updateImagePreview();
        setPhotoStatus(`Photo upload failed: ${message}. The previous image was kept.`, true);
    }
}

function fillFormForEdit() {
    const photoFileInput = document.getElementById("photoFileInput");

    if (photoFileInput) {
        photoFileInput.value = "";
    }

    setPhotoStatus(DEFAULT_PHOTO_HINT);

    if (editingIndex === null || !snakes[editingIndex]) {
        document.getElementById("formPageTitle").textContent = "Add Snake";
        document.getElementById("feedingIntervalInput").value = "14";
        document.getElementById("binNumberInput").value = "";
        currentGenes = [];
        currentWeightHistory = [];
        currentFeedingHistory = [];
        currentShedHistory = [];
        renderGeneList();
        updateFeederSuggestion();
        updateImagePreview();
        renderWeightHistory({ weight: "", weightHistory: [] });
        renderFeedingHistory({ feedingHistory: [] });
        renderShedHistory({ shedHistory: [] });
        return;
    }

    const snake = snakes[editingIndex];

    document.getElementById("formPageTitle").textContent = `Edit ${snake.name}`;
    document.getElementById("nameInput").value = snake.name || "";
    document.getElementById("snakeIDInput").value = snake.ID || snake.morph || "";
    document.getElementById("binNumberInput").value = snake.binNumber || "";
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
    currentFeedingHistory = Array.isArray(snake.feedingHistory) ? [...snake.feedingHistory] : [];
    currentShedHistory = Array.isArray(snake.shedHistory) ? [...snake.shedHistory] : [];

    renderGeneList();
    updateFeederSuggestion();
    updateImagePreview();
    renderFeedingHistory({ feedingHistory: currentFeedingHistory });
    renderWeightHistory({ weight: snake.weight, weightHistory: currentWeightHistory });
    renderShedHistory({ shedHistory: currentShedHistory });
}

function getCurrentWeightHistory() {
    return Array.isArray(currentWeightHistory) ? currentWeightHistory : [];
}

function getCurrentFeedingHistory() {
    return Array.isArray(currentFeedingHistory) ? currentFeedingHistory : [];
}

function getCurrentShedHistory() {
    return Array.isArray(currentShedHistory) ? currentShedHistory : [];
}

function persistCurrentHistories() {
    if (editingIndex === null || !snakes[editingIndex]) {
        return;
    }

    snakes[editingIndex].weight = document.getElementById("weightInput").value;
    snakes[editingIndex].weightHistory = [...getCurrentWeightHistory()];
    snakes[editingIndex].lastFed = document.getElementById("lastFedInput").value;
    snakes[editingIndex].feedingHistory = [...getCurrentFeedingHistory()];
    snakes[editingIndex].shedHistory = [...getCurrentShedHistory()];
    saveSnakes();
}

function addWeightHistoryEntry() {
    const weightValue = document.getElementById("weightInput").value.trim();
    const weightDate = document.getElementById("weightDateInput").value;

    if (!weightValue || !weightDate) {
        alert("Enter both a weight and a date before adding a record.");
        return;
    }

    currentWeightHistory.push({
        date: weightDate,
        weight: Number(weightValue)
    });
    currentWeightHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    renderWeightHistory({ weight: weightValue, weightHistory: getCurrentWeightHistory() });
    document.getElementById("weightDateInput").value = "";
    persistCurrentHistories();
}

function addFeedingHistoryEntry() {
    const fedDate = document.getElementById("lastFedInput").value;
    const feederSize = document.getElementById("feederSizeInput").value.trim();
    const resultInput = document.getElementById("feedingResultInput");
    const result = resultInput ? resultInput.value : "";

    if (!fedDate) {
        alert("Enter a feeding date before adding a record.");
        return;
    }

    currentFeedingHistory.push({
        date: fedDate,
        feederSize: feederSize,
        result: result
    });
    currentFeedingHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    renderFeedingHistory({ feedingHistory: getCurrentFeedingHistory() });
    persistCurrentHistories();
}

function addShedHistoryEntry() {
    const shedDate = document.getElementById("shedDateInput").value;
    const quality = document.getElementById("shedQualityInput").value;
    const notes = document.getElementById("shedNotesInput").value.trim();

    if (!shedDate) {
        alert("Enter a shed date before adding a record.");
        return;
    }

    currentShedHistory.push({
        date: shedDate,
        quality: quality,
        notes: notes
    });
    currentShedHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    renderShedHistory({ shedHistory: getCurrentShedHistory() });
    document.getElementById("shedDateInput").value = "";
    document.getElementById("shedQualityInput").value = "";
    document.getElementById("shedNotesInput").value = "";
    persistCurrentHistories();
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
        return { x, y };
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
                <button type="button" class="gene-action-button" 
                onclick="removeWeightHistoryEntry(${index})">
                    Remove
                </button>
            </div>
        `;
    }).join("");

    renderWeightChart(history);
}

function renderFeedingHistory(snake) {
    const list = document.getElementById("feedingHistoryList");
    if (!list) return;

    const history = Array.isArray(snake.feedingHistory) ? snake.feedingHistory : getCurrentFeedingHistory();

    if (history.length === 0) {
        list.innerHTML = `<p class="empty-message">No feeding history yet.</p>`;
        return;
    }

    list.innerHTML = history.map((entry, index) => {
        const date = entry.date || entry.day || entry.label || "";
        const feederSize = entry.feederSize || entry.feeder || "";
        const result = entry.result || "";
        const details = [feederSize, result].filter(Boolean).join(" - ");

        return `
            <div class="feeding-list-item">
                <span>${date}</span>
                <span>${details || "Fed"}</span>
                <button type="button" class="gene-action-button" 
                    onclick="removeFeedingHistoryEntry(${index})">
                    Remove
                </button>
            </div>
        `;
    }).join("");
}

function renderShedHistory(snake) {
    const list = document.getElementById("shedHistoryList");
    if (!list) return;

    const history = Array.isArray(snake.shedHistory) ? snake.shedHistory : getCurrentShedHistory();

    if (history.length === 0) {
        list.innerHTML = `<p class="empty-message">No shed history yet.</p>`;
        return;
    }

    list.innerHTML = history.map((entry, index) => {
        const date = entry.date || "";
        const quality = entry.quality || "Shed";
        const notes = entry.notes || "";
        const details = [quality, notes].filter(Boolean).join(" - ");

        return `
            <div class="feeding-list-item">
                <span>${date}</span>
                <span>${details}</span>
                <button type="button" class="gene-action-button"
                    onclick="removeShedHistoryEntry(${index})">
                    Remove
                </button>
            </div>
        `;
    }).join("");
}

function removeWeightHistoryEntry(index) {
    const history = getCurrentWeightHistory();
    if (index < 0 || index >= history.length) {
        return;
    }

    history.splice(index, 1);
    renderWeightHistory({
        weight: document.getElementById("weightInput")?.value || "",
        weightHistory: getCurrentWeightHistory()
    });
    persistCurrentHistories();
}

function removeFeedingHistoryEntry(index) {
    const history = getCurrentFeedingHistory();
    if (index < 0 || index >= history.length) {
        return;
    }

    history.splice(index, 1);
    renderFeedingHistory({ feedingHistory: getCurrentFeedingHistory() });
    persistCurrentHistories();
}

function removeShedHistoryEntry(index) {
    const history = getCurrentShedHistory();
    if (index < 0 || index >= history.length) {
        return;
    }

    history.splice(index, 1);
    renderShedHistory({ shedHistory: getCurrentShedHistory() });
    persistCurrentHistories();
}

function saveSnakeFromPage() {
    const name = document.getElementById("nameInput").value.trim();
    const morph = document.getElementById("snakeIDInput").value.trim();

    if (name === "" || morph === "") {
        alert("Please enter at least a name and ID.");
        return;
    }

    const imageValue = document.getElementById("imageInput").value.trim();

    if (imageValue.startsWith("blob:")) {
        alert("The photo is still uploading. Try saving again in a moment.");
        return;
    }

    const existingSnake = editingIndex !== null && snakes[editingIndex]
        ? snakes[editingIndex]
        : {};

    const snake = {
        ...existingSnake,
        id: existingSnake.id || window.SnakeData.createSnakeId({ name, ID: morph, morph }, snakes.length),
        name,
        ID: morph,
        morph,
        binNumber: document.getElementById("binNumberInput").value.trim(),
        sex: document.getElementById("sexInput").value,
        weight: document.getElementById("weightInput").value,
        weightHistory: [...getCurrentWeightHistory()],
        lastFed: document.getElementById("lastFedInput").value,
        feedingIntervalDays: document.getElementById("feedingIntervalInput").value || 7,
        feederSize: document.getElementById("feederSizeInput").value.trim(),
        feedingHistory: [...getCurrentFeedingHistory()],
        shedHistory: [...getCurrentShedHistory()],
        hatchDate: document.getElementById("hatchDateInput").value,
        acquiredDate: document.getElementById("acquiredDateInput").value,
        status: document.getElementById("statusInput").value,
        genes: currentGenes,
        image: imageValue || "Images/TheSnakeRoom.jpg"
    };

    if (editingIndex === null || !snakes[editingIndex]) {
        snakes.push(snake);
    } else {
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
window.addWeightHistoryEntry = addWeightHistoryEntry;
window.addFeedingHistoryEntry = addFeedingHistoryEntry;
window.addShedHistoryEntry = addShedHistoryEntry;
window.removeWeightHistoryEntry = removeWeightHistoryEntry;
window.removeFeedingHistoryEntry = removeFeedingHistoryEntry;
window.removeShedHistoryEntry = removeShedHistoryEntry;
window.saveSnakeFromPage = saveSnakeFromPage;

setupGeneOptions();
fillFormForEdit();

const photoFileInput = document.getElementById("photoFileInput");

if (photoFileInput) {
    photoFileInput.addEventListener("change", handlePhotoFileChange);
}
