let snakes = loadSnakes();
let currentGenes = [];
let currentWeightHistory = [];
let currentFeedingHistory = [];
let currentShedHistory = [];
let currentHealthHistory = [];
// Set when a refusal reason means the snake should leave the feeding schedule.
let pendingFeedingHold = null;

const editingIndex = getEditingIndex();
const requestedUid = new URLSearchParams(window.location.search).get("uid") || null;
const requestedUidMissing = requestedUid !== null && editingIndex === null;

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
        geneHelp.textContent = `${gene.name} is recessive. Add Het for a proven carrier, 66% Het or 50% Het while it is still unproven; a plain Add is the visual form.`;
        geneButtonRow.innerHTML = `
            <button type="button" class="gene-action-button" onclick="addGene('het')">
                Add Het
            </button>
            <button type="button" class="gene-action-button" onclick="addGene('possible66')">
                Add 66% Het
            </button>
            <button type="button" class="gene-action-button" onclick="addGene('possible50')">
                Add 50% Het
            </button>
            <button type="button" class="gene-action-button" onclick="addGene('visual')">
                Add
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
    const hetOdds = getPossibleHetOddsForMode(mode);

    currentGenes = currentGenes.filter(currentGene => currentGene.name !== gene.name);
    currentGenes.push({
        name: gene.name,
        type: gene.type,
        copies: copies,
        ...(hetOdds ? { hetOdds: hetOdds } : {})
    });

    geneInput.value = "";
    renderGeneList();
    updateGeneButtons();
}

// Possible hets are unproven carriers: the odds are stored on the record so the
// calculator and the goal planner can weigh them instead of guessing.
function getPossibleHetOddsForMode(mode) {
    if (mode === "possible66") {
        return 0.66;
    }

    if (mode === "possible50") {
        return 0.5;
    }

    return null;
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

// Once a possible het proves out it becomes an ordinary het: the odds tag goes
// away but the gene stays, so no retyping is needed.
function proveGene(index) {
    const gene = currentGenes[index];

    if (!gene) {
        return;
    }

    const { hetOdds, ...provenGene } = gene;
    currentGenes[index] = provenGene;
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

    geneList.innerHTML = currentGenes
        .map((gene, index) => ({ gene, index }))
        .sort((left, right) => window.GeneTools.compareGenesForDisplay(left.gene, right.gene))
        .map(({ gene, index }) => {
            const possibleHet = Boolean(window.GeneTools.getPossibleHetOdds(gene));

            return `
        <span class="gene-pill ${window.GeneTools.getStoredGenePillClass(gene)}">
            ${getGeneDescription(gene)}
            ${possibleHet
                ? `<button type="button" class="gene-remove-button" onclick="proveGene(${index})" title="Mark as a proven het">
                Proven
            </button>`
                : ""}
            <button type="button" class="gene-remove-button" onclick="removeGene(${index})">
                x
            </button>
        </span>
    `;
        }).join("");
}

function updateImagePreview() {
    const imageInput = document.getElementById("imageInput");
    const imagePreview = document.getElementById("imagePreview");
    imagePreview.src = imageInput.value || "Images/TheSnakeRoom.jpg";
}

// ---- Photo gallery ---------------------------------------------------------

const DEFAULT_PHOTO_HINT = "Pick a photo from this device, or use Take Photo on a phone. Photos are shrunk, uploaded to your cloud storage, and added to the gallery below.";

let currentPhotos = [];

function setPhotoStatus(message, isError = false) {
    const status = document.getElementById("photoUploadStatus");

    if (!status) return;

    status.textContent = message;
    status.classList.toggle("import-error", isError);
}

async function savePhotoAsDataUrl(file, reason) {
    const keepLocal = confirm(
        reason + "\n\n" +
        "Keep this photo on this device only? It will not be in your cloud backup " +
        "until you're signed in and online \u2014 the app syncs automatically."
    );

    if (!keepLocal) {
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

    currentPhotos.push({ url: dataUrl, addedAt: new Date().toISOString() });
    syncMainPhotoField();
    setPhotoStatus("Photo saved on this device only. Photos added while signed in and online are uploaded to the cloud automatically.");
}

function renderPhotoGallery() {
    const gallery = document.getElementById("photoGallery");

    if (!gallery) return;

    if (currentPhotos.length === 0) {
        gallery.innerHTML = `<p class="empty-message">No photos yet. Add one above.</p>`;
        return;
    }

    gallery.innerHTML = currentPhotos.map((photo, index) => {
        const added = photo.addedAt ? new Date(photo.addedAt).toLocaleDateString() : "Date unknown";
        const isMain = index === 0;

        return `
            <div class="photo-gallery-item${isMain ? " main" : ""}">
                <img src="${photo.url}" alt="Snake photo ${index + 1}" loading="lazy"
                    onerror="this.onerror=null;this.src='Images/TheSnakeRoom.jpg'">
                ${isMain ? `<span class="photo-main-badge">Main</span>` : ""}
                <span class="photo-date">${added}</span>
                <div class="photo-thumb-actions">
                    ${isMain ? "" : `<button type="button" class="gene-action-button" onclick="makePhotoMain(${index})">Make Main</button>`}
                    <button type="button" class="gene-remove-button" onclick="removePhoto(${index})">Remove</button>
                </div>
            </div>
        `;
    }).join("");
}

function syncMainPhotoField() {
    const imageInput = document.getElementById("imageInput");

    imageInput.value = currentPhotos.length > 0 ? currentPhotos[0].url : "";
    updateImagePreview();
    renderPhotoGallery();
}

function seedPhotosFromSnake(snake) {
    if (Array.isArray(snake.photos)) {
        currentPhotos = snake.photos
            .filter(photo => photo && photo.url)
            .map(photo => ({ url: photo.url, addedAt: photo.addedAt || null }));
        return;
    }

    // Older records keep a single image string. Treat it as the main photo.
    currentPhotos = snake.image ? [{ url: snake.image, addedAt: null }] : [];
}

function makePhotoMain(index) {
    if (index <= 0 || index >= currentPhotos.length) return;

    const [photo] = currentPhotos.splice(index, 1);
    currentPhotos.unshift(photo);
    syncMainPhotoField();
}

function removePhoto(index) {
    const photo = currentPhotos[index];

    if (!photo) return;

    if (!confirm("Remove this photo from the snake?")) return;

    currentPhotos.splice(index, 1);

    // Best effort: delete the file from cloud storage too (skipped when
    // another snake still points at the same photo).
    if (window.CloudSync && typeof window.CloudSync.deleteSnakePhoto === "function") {
        window.CloudSync.deleteSnakePhoto(photo.url);
    }

    syncMainPhotoField();
}

function handlePhotoFileChange(event) {
    const input = event.target;
    const file = input.files && input.files[0];

    if (!file) return;

    // Reset so picking the exact same file again still fires a change event.
    input.value = "";

    processPhotoFile(file);
}

async function processPhotoFile(file) {
    const limit = (window.CloudSync && typeof window.CloudSync.getPhotoLimit === "function")
        ? window.CloudSync.getPhotoLimit()
        : Infinity;

    if (currentPhotos.length >= limit) {
        alert(`Your plan allows ${limit} photo${limit === 1 ? "" : "s"} per snake. Upgrading the plan adds more photo slots.`);
        return;
    }

    const imageInput = document.getElementById("imageInput");
    const objectUrl = URL.createObjectURL(file);

    imageInput.value = objectUrl;
    updateImagePreview();

    if (!window.CloudSync || typeof window.CloudSync.uploadSnakePhotoFile !== "function") {
        await savePhotoAsDataUrl(file, "The cloud sync helper did not load on this page.");
        return;
    }

    setPhotoStatus("Shrinking and uploading photo\u2026");

    try {
        const url = await window.CloudSync.uploadSnakePhotoFile(file);

        URL.revokeObjectURL(objectUrl);
        currentPhotos.push({ url, addedAt: new Date().toISOString() });
        syncMainPhotoField();
        setPhotoStatus("Photo added to the gallery. Press Save Snake to keep it.");
    } catch (error) {
        const message = error && error.message ? error.message : String(error);

        if (message === "Not signed in." || message.includes("No Supabase connection")) {
            await savePhotoAsDataUrl(file, message);
            return;
        }

        URL.revokeObjectURL(objectUrl);
        syncMainPhotoField();
        const cleanMessage = message.replace(/\.+$/, "");
        setPhotoStatus(`Photo upload failed: ${cleanMessage}. The photo was not added.`, true);
    }
}

// ---- QR deep-link recovery -------------------------------------------------
// Bin-card QRs open snake-form.html?uid=... . If this device does not hold
// that snake (fresh phone, or it has not pulled recently), offer to pull the
// collection from the cloud and reopen the snake instead of showing Add mode.

function showQrSnakeReport(html) {
    const report = document.getElementById("qrSnakeReport");

    if (!report) return;

    report.innerHTML = html;
    report.style.display = "block";
}

function bindQrPullButton() {
    const button = document.getElementById("qrPullButton");

    if (button) {
        button.addEventListener("click", pullAndOpenRequestedSnake);
    }
}

// Kept for the QR deep-link flow: recovery now just needs the auto-sync pull.
async function pullFreshDataAndReload() {
    const result = await window.CloudSync.pullCore({ silent: true });

    if (result === "pulled" && requestedUid &&
        window.SnakeData.findSnakeIndexById(window.SnakeData.loadSnakesWithIds([]), requestedUid) >= 0) {
        window.location.reload();
        return true;
    }

    return false;
}

async function pullAndOpenRequestedSnake() {
    showQrSnakeReport("Pulling your collection from the cloud\u2026");

    try {
        await window.CloudSync.pullSnapshot();

        const freshSnakes = window.SnakeData.loadSnakesWithIds([]);

        if (requestedUid && window.SnakeData.findSnakeIndexById(freshSnakes, requestedUid) >= 0) {
            window.location.reload();
            return;
        }

        showQrSnakeReport(
            "Pull finished, but that snake is still not on this device. Either you were offline, " +
            "or the card is old and the snake was re-created. " +
            "<a href=\"snakes.html\">Open the Collection</a> to find the right snake, then print fresh cards."
        );
    } catch (error) {
        showQrSnakeReport(
            `Pull failed: ${error.message}. Reconnect to the internet, then scan the card again.`
        );
    }
}

async function recoverMissingUidSnake() {
    const title = document.getElementById("formPageTitle");

    if (title) {
        title.textContent = "Snake Not On This Device";
    }

    try {
        if (!window.CloudSync || typeof window.CloudSync.getSession !== "function") {
            showQrSnakeReport(`This snake is not in this device's data yet, and the cloud sync helper did not load. Reload the page once you're online, then scan the card again.`);
            return;
        }

        const settings = window.CloudSync.readSettings();

        if (!settings.supabaseUrl || !settings.supabaseKey) {
            showQrSnakeReport(`This snake is not in this device's data yet, and no cloud connection is saved. Connect to the internet to sync automatically. If it still does not appear, open the login page and sign in once.`);
            return;
        }

        const session = await window.CloudSync.getSession();

        if (!session) {
            showQrSnakeReport(`This snake is not in this device's data yet. Sign in once on the login page (reached from Home), then scan the card again \u2014 recovery will pull it automatically.`);
            return;
        }

        showQrSnakeReport(`This snake lives in your cloud backup but is not on this device yet. Pulling your collection now\u2026`);

        const recovered = await pullFreshDataAndReload();

        if (!recovered) {
            showQrSnakeReport(`Pull finished, but that snake is still not on this device. The card may be old, or the snake was re-created. <a href="snakes.html">Open the Collection</a> to find the right snake.`);
        }
    } catch (error) {
        showQrSnakeReport(`Could not reach the cloud to look for this snake: ${error.message}. Reconnect to the internet, then scan again.`);
    }
}

// ---- Collapsible sections -------------------------------------------------
//
// The record is long, so every top-level section folds away. The folded state
// is remembered on this device only: it is a reading preference, not collection
// data, so it does not ride along in the cloud snapshot.

const SECTION_STATE_KEY = "snakeFormSectionState";
const collapsedSectionRefs = new Map();

function sectionKeyFromTitle(title) {
    return String(title || "section")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "section";
}

function readCollapsedSections() {
    try {
        const parsed = JSON.parse(localStorage.getItem(SECTION_STATE_KEY));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function saveCollapsedSections(state) {
    try {
        localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(state));
    } catch (error) {
        // Private mode: the sections simply open next visit.
    }
}

function setSectionCollapsed(ref, collapsed) {
    ref.section.classList.toggle("is-collapsed", collapsed);
    ref.button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    ref.body.hidden = collapsed;

    const state = readCollapsedSections();

    if (collapsed) {
        state[ref.key] = true;
    } else {
        delete state[ref.key];
    }

    saveCollapsedSections(state);
}

function setAllSnakeSectionsCollapsed(collapsed) {
    collapsedSectionRefs.forEach(ref => setSectionCollapsed(ref, collapsed));
}

function expandSectionContaining(element) {
    if (!element) {
        return;
    }

    const section = element.closest(".form-section");

    if (!section) {
        return;
    }

    collapsedSectionRefs.forEach(ref => {
        if (ref.section === section) {
            setSectionCollapsed(ref, false);
        }
    });
}

function expandSnakeSectionFromHash() {
    const hash = window.location.hash.replace("#", "");

    if (!hash) {
        return;
    }

    expandSectionContaining(document.getElementById(hash));
}

function setupCollapsibleSections() {
    const savedState = readCollapsedSections();

    document.querySelectorAll(".snake-form-page > .form-section").forEach(section => {
        const heading = section.querySelector("h3");

        if (!heading) {
            return;
        }

        const title = heading.textContent.trim();
        const key = sectionKeyFromTitle(title);
        const body = document.createElement("div");
        body.className = "form-section-body";
        body.id = `sectionBody-${key}`;

        // Move everything after the heading into the collapsible body.
        const nodes = [];
        let node = heading.nextSibling;

        while (node) {
            nodes.push(node);
            node = node.nextSibling;
        }

        nodes.forEach(item => body.appendChild(item));

        const button = document.createElement("button");
        button.type = "button";
        button.className = "form-section-toggle";
        button.id = `sectionToggle-${key}`;
        button.setAttribute("aria-controls", body.id);
        button.setAttribute("aria-expanded", "true");
        button.innerHTML = `
            <span class="form-section-title"></span>
            <span class="form-section-chevron" aria-hidden="true">\u25be</span>
        `;
        button.querySelector(".form-section-title").textContent = title;

        section.insertBefore(button, heading);
        heading.remove();
        section.appendChild(body);

        const ref = { key, section, button, body };
        collapsedSectionRefs.set(key, ref);
        button.addEventListener("click", () => setSectionCollapsed(ref, !section.classList.contains("is-collapsed")));

        if (savedState[key]) {
            setSectionCollapsed(ref, true);
        }
    });
}

window.expandAllSnakeSections = function () {
    setAllSnakeSectionsCollapsed(false);
};

window.collapseAllSnakeSections = function () {
    setAllSnakeSectionsCollapsed(true);
};

// The retirement block only exists for the two retired statuses. Filling the
// date on the first selection saves a step without inventing a date for records
// that were already archived before this field existed.
function updateRetirementFields(fillDate = false) {
    const statusInput = document.getElementById("statusInput");
    const block = document.getElementById("retirementFields");

    if (!statusInput || !block) {
        return;
    }

    const isRetired = window.SnakeData.isRetiredStatus(statusInput.value);
    block.hidden = !isRetired;

    if (isRetired && fillDate) {
        const dateInput = document.getElementById("retiredDateInput");

        if (dateInput && !dateInput.value) {
            dateInput.value = window.getTodayText();
        }
    }
}

function fillFormForEdit() {
    const photoFileInput = document.getElementById("photoFileInput");

    if (photoFileInput) {
        photoFileInput.value = "";
    }

    setPhotoStatus(DEFAULT_PHOTO_HINT);
    pendingFeedingHold = null;

    if (editingIndex === null || !snakes[editingIndex]) {
        document.getElementById("formPageTitle").textContent = "Add Snake";

        if (requestedUidMissing) {
            recoverMissingUidSnake();
        }

        document.getElementById("feedingIntervalInput").value = "14";
        document.getElementById("binNumberInput").value = "";
        document.getElementById("retiredDateInput").value = "";
        document.getElementById("retiredReasonInput").value = "";
        document.getElementById("retiredNoteInput").value = "";
        currentGenes = [];
        currentWeightHistory = [];
        currentFeedingHistory = [];
        currentShedHistory = [];
        currentHealthHistory = [];
        currentPhotos = [];
        [
            "quarantineStartInput",
            "quarantineEndInput",
            "quarantineReasonInput",
            "quarantineNotesInput",
            "quarantineReleasedDateInput"
        ].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = "";
        });
        const releasedInput = document.getElementById("quarantineReleasedInput");
        if (releasedInput) releasedInput.checked = false;
        const healthDateInput = document.getElementById("healthDateInput");
        if (healthDateInput && window.SnakeHealth) healthDateInput.value = window.SnakeHealth.todayText();
        renderGeneList();
        updateFeederSuggestion();
        updateImagePreview();
        renderPhotoGallery();
        renderWeightHistory({ weight: "", weightHistory: [] });
        renderFeedingHistory({ feedingHistory: [] });
        renderShedHistory({ shedHistory: [] });
        renderHealthHistory({ healthHistory: [] });
        renderQuarantineStatus();
        renderFeedingHoldNotice();
        renderBreedingHistory(null);
        updateFeedingReasonVisibility(document.getElementById("feedingResultInput").value);
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
    document.getElementById("retiredDateInput").value = snake.retiredDate || "";
    document.getElementById("retiredReasonInput").value = snake.retiredReason || "";
    document.getElementById("retiredNoteInput").value = snake.retiredNote || "";

    currentGenes = Array.isArray(snake.genes) ? [...snake.genes] : [];
    currentWeightHistory = Array.isArray(snake.weightHistory) ? [...snake.weightHistory] : [];
    currentFeedingHistory = Array.isArray(snake.feedingHistory) ? [...snake.feedingHistory] : [];
    currentShedHistory = Array.isArray(snake.shedHistory) ? [...snake.shedHistory] : [];
    currentHealthHistory = Array.isArray(snake.healthHistory) ? [...snake.healthHistory] : [];
    document.getElementById("quarantineStartInput").value = snake.quarantineStart || "";
    document.getElementById("quarantineEndInput").value = snake.quarantineEnd || "";
    document.getElementById("quarantineReasonInput").value = snake.quarantineReason || "";
    document.getElementById("quarantineNotesInput").value = snake.quarantineNotes || "";
    document.getElementById("quarantineReleasedInput").checked = Boolean(snake.quarantineReleased);
    document.getElementById("quarantineReleasedDateInput").value = snake.quarantineReleasedDate || "";
    if (window.SnakeHealth) {
        document.getElementById("healthDateInput").value = window.SnakeHealth.todayText();
    }
    seedPhotosFromSnake(snake);

    renderGeneList();
    updateFeederSuggestion();
    updateImagePreview();
    renderPhotoGallery();
    renderFeedingHistory({ feedingHistory: currentFeedingHistory });
    renderWeightHistory({ weight: snake.weight, weightHistory: currentWeightHistory });
    renderShedHistory({ shedHistory: currentShedHistory });
    renderHealthHistory({ healthHistory: currentHealthHistory });
    renderQuarantineStatus();
    renderFeedingHoldNotice();
    renderBreedingHistory(snake);
    updateFeedingReasonVisibility(document.getElementById("feedingResultInput").value);
}

// ---- Breeding history -----------------------------------------------------
//
// A record page is where the keeper looks at one animal, so show every pair it
// has been part of, including closed pairs and pairs already converted to a
// clutch. A converted pair is still a pair record: it holds the pairing dates,
// while the clutch owns the egg count and hatch results. Both are listed.

function getBreedingSnake(referenceId, fallbackIndex) {
    const directMatch = referenceId
        ? window.SnakeData.getSnakeByReference(snakes, referenceId)
        : null;

    if (directMatch) {
        return directMatch;
    }

    const index = Number(fallbackIndex);

    return Number.isInteger(index) && index >= 0 ? snakes[index] || null : null;
}

function getBreedingSnakeId(referenceId, fallbackIndex) {
    const directId = String(referenceId || "").trim();
    const directMatch = directId
        ? window.SnakeData.getSnakeByReference(snakes, directId)
        : null;

    if (directMatch && directMatch.id) {
        return directMatch.id;
    }

    const fallbackSnake = getBreedingSnake("", fallbackIndex);

    return fallbackSnake && fallbackSnake.id ? fallbackSnake.id : directId;
}

function recordIncludesSnake(record, snakeId) {
    return getBreedingSnakeId(record.femaleSnakeId, record.femaleIndex) === snakeId
        || getBreedingSnakeId(record.maleSnakeId, record.maleIndex) === snakeId;
}

function getBreedingPairingDates(record) {
    const entries = Array.isArray(record.pairings) ? record.pairings : [];
    const dates = entries
        .map(entry => typeof entry === "string" ? entry : entry && entry.date)
        .filter(Boolean);

    if (dates.length === 0 && record.pairingDate) {
        dates.push(record.pairingDate);
    }

    return [...new Set(dates)].sort();
}

function getBreedingPartnerInfo(record, snakeId) {
    const femaleId = getBreedingSnakeId(record.femaleSnakeId, record.femaleIndex);
    const isDam = femaleId === snakeId;

    return {
        role: isDam ? "Dam" : "Sire",
        partner: isDam
            ? getBreedingSnake(record.maleSnakeId, record.maleIndex)
            : getBreedingSnake(record.femaleSnakeId, record.femaleIndex)
    };
}

function getBreedingPairStatus(pair) {
    if (pair.clutchId) {
        return { key: "converted", label: `Converted to ${pair.clutchId}` };
    }

    if (pair.closedAt) {
        return { key: "closed", label: `Closed ${pair.closedAt}` };
    }

    if (pair.eggsLaidDate) {
        return { key: "active", label: "Active \u00b7 eggs laid" };
    }

    if (pair.ovulationObserved || pair.ovulationDate) {
        return { key: "active", label: "Active \u00b7 ovulated" };
    }

    return { key: "active", label: "Active" };
}

function getBreedingPairSortDate(pair) {
    const pairingDates = getBreedingPairingDates(pair);

    return pair.closedAt
        || pair.eggsLaidDate
        || pair.ovulationDate
        || pair.preLayShedDate
        || pairingDates[pairingDates.length - 1]
        || "";
}

function getClutchSortDate(clutch) {
    return clutch.hatchedDate || clutch.laidDate || "";
}

function breedingHistoryFact(label, value) {
    return `
        <p class="breeding-history-fact">
            <span>${escapeMoneyText(label)}</span>
            <strong>${escapeMoneyText(value || "Not recorded")}</strong>
        </p>
    `;
}

function breedingHistoryPartnerText(info) {
    const partner = info.partner;

    if (!partner) {
        return "Unknown snake (no longer in the collection)";
    }

    return `${partner.name || "Unnamed"} - ${window.SnakeData.getSnakeIdentityText(partner)}`;
}

function breedingHistoryPairCard(pair, snakeId) {
    const partnerInfo = getBreedingPartnerInfo(pair, snakeId);
    const status = getBreedingPairStatus(pair);
    const pairingDates = getBreedingPairingDates(pair);
    const partnerRetired = partnerInfo.partner && window.SnakeData.isRetiredSnake(partnerInfo.partner);
    const facts = [
        breedingHistoryFact(
            "Pairings",
            pairingDates.length > 0
                ? `${pairingDates.length} (${pairingDates.join(", ")})`
                : "None recorded"
        )
    ];

    if (pair.ovulationObserved || pair.ovulationDate) {
        facts.push(breedingHistoryFact(
            "Ovulation",
            pair.ovulationDate
                ? `${pair.ovulationObserved ? "Observed \u00b7 " : ""}${pair.ovulationDate}`
                : "Observed (date not recorded)"
        ));
    }

    if (pair.preLayShedDate) {
        facts.push(breedingHistoryFact("Pre-lay shed", pair.preLayShedDate));
    }

    if (pair.eggsLaidDate) {
        facts.push(breedingHistoryFact("Eggs laid", pair.eggsLaidDate));
    }

    if (pair.eggCount) {
        facts.push(breedingHistoryFact("Egg count", pair.eggCount));
    }

    if (pair.closedAt) {
        facts.push(breedingHistoryFact("Closed on", pair.closedAt));
        facts.push(breedingHistoryFact("Reason", pair.closedReason || "Not recorded"));
    }

    const warning = status.key === "active" && partnerRetired
        ? `
            <p class="pair-warning">
                <strong>Partner retired:</strong> ${escapeMoneyText(breedingHistoryPartnerText(partnerInfo))}
                is ${escapeMoneyText(partnerInfo.partner.status)}. This pair is still marked active.
            </p>
        `
        : "";

    const clutchLink = pair.clutchId
        ? `
            <div class="breeding-history-links">
                <a class="secondary-button small-action-button"
                    href="breedingOutcomes.html#clutch-${encodeURIComponent(pair.clutchId)}">
                    View Clutch ${escapeMoneyText(pair.clutchId)}
                </a>
            </div>
        `
        : "";

    return `
        <article class="breeding-history-card">
            <div class="breeding-history-card-header">
                <div>
                    <h4>${escapeMoneyText(breedingHistoryPartnerText(partnerInfo))}</h4>
                    <p class="breeding-history-role">This snake is the ${partnerInfo.role.toLowerCase()}</p>
                </div>
                <span class="breeding-history-status is-${status.key}">${escapeMoneyText(status.label)}</span>
            </div>

            <div class="breeding-history-facts">
                ${facts.join("")}
            </div>

            ${warning}
            ${clutchLink}
        </article>
    `;
}

function breedingHistoryClutchCard(clutch, snakeId) {
    const partnerInfo = getBreedingPartnerInfo(clutch, snakeId);
    const isHatched = Boolean(clutch.convertedToSnakes);
    const statusKey = isHatched ? "converted" : "active";
    const statusLabel = isHatched ? "Hatched" : "Waiting to hatch";
    const pairingDates = getBreedingPairingDates(clutch);
    const offspring = snakes.filter(snake => snake && snake.clutchId === clutch.id);
    const facts = [
        breedingHistoryFact("Laid", clutch.laidDate || "Not recorded"),
        breedingHistoryFact("Egg count", clutch.eggCount || "Not recorded")
    ];

    if (pairingDates.length > 0) {
        facts.push(breedingHistoryFact(
            "Pairings",
            `${pairingDates.length} (${pairingDates.join(", ")})`
        ));
    }

    facts.push(isHatched
        ? breedingHistoryFact(
            "Hatched",
            `${clutch.hatchlingCount || 0} on ${clutch.hatchedDate || "date not recorded"}`
        )
        : breedingHistoryFact("Hatched", "Not yet"));

    const offspringText = offspring.length > 0
        ? `
            <p class="breeding-history-offspring">
                <span>Offspring on file:</span>
                ${offspring.map(snake => escapeMoneyText(
                    `${snake.name || "Unnamed"} (${window.SnakeData.getSnakeIdentityText(snake)})`
                )).join(", ")}
            </p>
        `
        : "";

    return `
        <article class="breeding-history-card">
            <div class="breeding-history-card-header">
                <div>
                    <h4>${escapeMoneyText(clutch.id || "Clutch without an ID")}</h4>
                    <p class="breeding-history-role">
                        With ${escapeMoneyText(breedingHistoryPartnerText(partnerInfo))} \u00b7
                        this snake is the ${partnerInfo.role.toLowerCase()}
                    </p>
                </div>
                <span class="breeding-history-status is-${statusKey}">${statusLabel}</span>
            </div>

            <div class="breeding-history-facts">
                ${facts.join("")}
            </div>

            ${offspringText}

            ${clutch.id ? `
                <div class="breeding-history-links">
                    <a class="secondary-button small-action-button"
                        href="breedingOutcomes.html#clutch-${encodeURIComponent(clutch.id)}">
                        View Clutch Outcomes
                    </a>
                </div>
            ` : ""}
        </article>
    `;
}

function renderBreedingHistory(snake) {
    const section = document.getElementById("breedingHistorySection");
    const summary = document.getElementById("breedingHistorySummary");
    const list = document.getElementById("breedingHistoryList");

    if (!section || !summary || !list) {
        return;
    }

    if (!snake || !snake.id) {
        section.hidden = true;
        return;
    }

    section.hidden = false;

    const pairs = window.SnakeData.readStorageArray("breedingPairs", [])
        .filter(pair => pair && recordIncludesSnake(pair, snake.id))
        .sort((a, b) => getBreedingPairSortDate(b).localeCompare(getBreedingPairSortDate(a)));
    const clutches = window.SnakeData.readStorageArray("clutches", [])
        .filter(clutch => clutch && recordIncludesSnake(clutch, snake.id))
        .sort((a, b) => getClutchSortDate(b).localeCompare(getClutchSortDate(a)));

    summary.innerHTML = `
        <span class="history-count">
            ${pairs.length} pair record${pairs.length === 1 ? "" : "s"} \u00b7
            ${clutches.length} clutch${clutches.length === 1 ? "" : "es"}
        </span>
        <a class="secondary-button small-action-button" href="breeding.html">Open Breeding</a>
    `;

    if (pairs.length === 0 && clutches.length === 0) {
        list.innerHTML = `
            <p class="empty-message">
                No breeding pairs or clutches are linked to this snake yet. Pairs and
                clutches recorded on the <a href="breeding.html">Breeding page</a> will
                appear here.
            </p>
        `;
        return;
    }

    const pairsHtml = pairs.length > 0
        ? pairs.map(pair => breedingHistoryPairCard(pair, snake.id)).join("")
        : `<p class="empty-message">No pair records on file for this snake.</p>`;
    const clutchesHtml = clutches.length > 0
        ? clutches.map(clutch => breedingHistoryClutchCard(clutch, snake.id)).join("")
        : `<p class="empty-message">No clutches on file for this snake.</p>`;

    list.innerHTML = `
        <div class="breeding-history-group">
            <h4 class="breeding-history-group-title">Pairs</h4>
            ${pairsHtml}
        </div>
        <div class="breeding-history-group">
            <h4 class="breeding-history-group-title">Clutches</h4>
            ${clutchesHtml}
        </div>
    `;
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

function getCurrentHealthHistory() {
    return Array.isArray(currentHealthHistory) ? currentHealthHistory : [];
}

function getQuarantineFormValues() {
    const released = Boolean(document.getElementById("quarantineReleasedInput")?.checked);
    const releasedDateInput = document.getElementById("quarantineReleasedDateInput");

    return {
        quarantineStart: document.getElementById("quarantineStartInput")?.value || "",
        quarantineEnd: document.getElementById("quarantineEndInput")?.value || "",
        quarantineReason: document.getElementById("quarantineReasonInput")?.value.trim() || "",
        quarantineNotes: document.getElementById("quarantineNotesInput")?.value.trim() || "",
        quarantineReleased: released,
        quarantineReleasedDate: released
            ? releasedDateInput?.value || window.SnakeHealth.todayText()
            : ""
    };
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
    snakes[editingIndex].healthHistory = [...getCurrentHealthHistory()];
    Object.assign(snakes[editingIndex], getQuarantineFormValues());

    if (pendingFeedingHold) {
        snakes[editingIndex].feedingHold = { ...pendingFeedingHold };
        pendingFeedingHold = null;
    }

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

function setupFeedingReasonOptions() {
    const select = document.getElementById("feedingReasonInput");

    if (!select) {
        return;
    }

    const reasons = window.FEEDING_REFUSAL_REASONS || [];

    select.innerHTML = `<option value="">Select reason</option>` +
        reasons.map(reason => `<option value="${reason}">${reason}</option>`).join("");
}

function updateFeedingReasonVisibility(value) {
    const field = document.getElementById("feedingReasonField");
    const select = document.getElementById("feedingReasonInput");

    if (field) {
        field.style.display = value === "Refused" ? "" : "none";
    }

    if (select && value !== "Refused") {
        select.value = "";
    }
}

function renderFeedingHoldNotice() {
    const row = document.getElementById("feedingHoldRow");
    const text = document.getElementById("feedingHoldText");

    if (!row || !text) {
        return;
    }

    const snake = editingIndex !== null && snakes[editingIndex] ? snakes[editingIndex] : null;
    const hold = pendingFeedingHold || (snake && snake.feedingHold) || null;

    if (!hold) {
        row.style.display = "none";
        text.textContent = "";
        return;
    }

    row.style.display = "";
    text.textContent = `Feeding hold: ${hold.reason} since ${hold.since || "unknown date"} \u2014 not on the feeding due list.`;
}

function endFeedingHoldFromForm() {
    pendingFeedingHold = null;

    if (editingIndex !== null && snakes[editingIndex]) {
        delete snakes[editingIndex].feedingHold;
        saveSnakes();
    }

    renderFeedingHoldNotice();
    alert("Feeding hold ended. The snake is back on the normal feeding schedule.");
}

function addFeedingHistoryEntry() {
    const fedDate = document.getElementById("lastFedInput").value;
    const feederSize = document.getElementById("feederSizeInput").value.trim();
    const resultInput = document.getElementById("feedingResultInput");
    const result = resultInput ? resultInput.value : "";
    const reasonInput = document.getElementById("feedingReasonInput");
    const reason = result === "Refused" && reasonInput ? reasonInput.value : "";

    if (!fedDate) {
        alert("Enter a feeding date before adding a record.");
        return;
    }

    const entry = {
        date: fedDate,
        feederSize: feederSize,
        result: result
    };

    if (reason) {
        entry.reason = reason;
    }

    currentFeedingHistory.push(entry);
    currentFeedingHistory.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (result === "Refused") {
        // A refusal is not a meal, so this must not move the last fed date.
        const lastMeal = editingIndex !== null && snakes[editingIndex]
            ? snakes[editingIndex].lastFed || ""
            : "";

        document.getElementById("lastFedInput").value = lastMeal;

        if (reason === "Ovulation") {
            pendingFeedingHold = { reason, since: fedDate };
        }
    }

    renderFeedingHistory({ feedingHistory: getCurrentFeedingHistory() });
    persistCurrentHistories();
    renderFeedingHoldNotice();
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

function setupHealthOptions() {
    const typeSelect = document.getElementById("healthTypeInput");
    const severitySelect = document.getElementById("healthSeverityInput");

    if (typeSelect && window.SnakeHealth) {
        typeSelect.innerHTML = window.SnakeHealth.HEALTH_EVENT_TYPES
            .map(type => `<option value="${type}">${type}</option>`)
            .join("");
    }

    if (severitySelect && window.SnakeHealth) {
        severitySelect.innerHTML = window.SnakeHealth.HEALTH_SEVERITIES
            .map(severity => `<option value="${severity}">${severity}</option>`)
            .join("");
    }
}

function updateQuarantineReleaseFields() {
    const released = Boolean(document.getElementById("quarantineReleasedInput")?.checked);
    const dateInput = document.getElementById("quarantineReleasedDateInput");

    if (dateInput && released && !dateInput.value && window.SnakeHealth) {
        dateInput.value = window.SnakeHealth.todayText();
    }

    if (dateInput && !released) {
        dateInput.value = "";
    }

    renderQuarantineStatus();
}

function renderQuarantineStatus() {
    const target = document.getElementById("quarantineStatus");

    if (!target || !window.SnakeHealth) {
        return;
    }

    const values = getQuarantineFormValues();
    const status = window.SnakeHealth.getQuarantineStatus(values);
    const active = status.active;

    target.className = `health-status-line${active ? " is-active" : ""}`;
    target.textContent = active
        ? `Quarantine: ${status.label}${status.end ? ` (expected release ${status.end})` : ""}`
        : status.state === "released"
            ? `Quarantine released${status.releasedDate ? ` on ${status.releasedDate}` : ""}.`
            : "No active quarantine.";
}

function renderHealthHistory(snake) {
    const list = document.getElementById("healthHistoryList");

    if (!list) {
        return;
    }

    const history = Array.isArray(snake.healthHistory) ? snake.healthHistory : getCurrentHealthHistory();

    if (history.length === 0) {
        list.innerHTML = `<p class="empty-message">No health records yet.</p>`;
        return;
    }

    list.innerHTML = history
        .map((entry, index) => ({ entry, index }))
        .sort((left, right) => String(right.entry.date || "").localeCompare(String(left.entry.date || "")))
        .map(({ entry, index }) => {
            const status = window.SnakeHealth
                ? window.SnakeHealth.getFollowUpStatus(entry)
                : { label: entry.resolvedDate ? `Resolved ${entry.resolvedDate}` : "Open" };
            const statusLabel = entry.resolvedDate
                ? `Resolved ${entry.resolvedDate}`
                : entry.followUpDate
                    ? status.label || "Follow-up"
                    : "No follow-up";
            const details = [entry.description, entry.treatment].filter(Boolean).join(" · ");
            const severity = entry.severity || "Mild";

            return `
                <div class="health-list-item">
                    <div class="health-list-main">
                        <strong>${escapeMoneyText(entry.date || "No date")} · ${escapeMoneyText(entry.type || "Health event")}</strong>
                        <span class="health-severity health-severity-${severity.toLowerCase().replace(/[^a-z]+/g, "-")}">${escapeMoneyText(severity)}</span>
                        ${details ? `<p>${escapeMoneyText(details)}</p>` : ""}
                        <span class="health-follow-up${status.state === "overdue" ? " is-overdue" : ""}">${escapeMoneyText(statusLabel)}</span>
                    </div>
                    <div class="health-list-actions">
                        ${entry.resolvedDate ? "" : `<button type="button" class="gene-action-button" onclick="resolveHealthFollowUp(${index})">Resolve</button>`}
                        <button type="button" class="gene-action-button" onclick="removeHealthHistoryEntry(${index})">Remove</button>
                    </div>
                </div>
            `;
        })
        .join("");
}

function addHealthHistoryEntry() {
    const date = document.getElementById("healthDateInput").value;
    const type = document.getElementById("healthTypeInput").value;
    const severity = document.getElementById("healthSeverityInput").value;
    const description = document.getElementById("healthDescriptionInput").value.trim();
    const treatment = document.getElementById("healthTreatmentInput").value.trim();
    const followUpDate = document.getElementById("healthFollowUpInput").value;

    if (!date) {
        alert("Enter a date before adding a health record.");
        return;
    }

    if (!description) {
        alert("Describe the health event before adding it.");
        return;
    }

    currentHealthHistory.push({
        id: `health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        type,
        severity,
        description,
        ...(treatment ? { treatment } : {}),
        ...(followUpDate ? { followUpDate } : {})
    });
    currentHealthHistory.sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")));

    renderHealthHistory({ healthHistory: getCurrentHealthHistory() });
    document.getElementById("healthDescriptionInput").value = "";
    document.getElementById("healthTreatmentInput").value = "";
    document.getElementById("healthFollowUpInput").value = "";
    persistCurrentHistories();
}

function removeHealthHistoryEntry(index) {
    const history = getCurrentHealthHistory();

    if (index < 0 || index >= history.length) {
        return;
    }

    history.splice(index, 1);
    renderHealthHistory({ healthHistory: history });
    persistCurrentHistories();
}

function resolveHealthFollowUp(index) {
    const history = getCurrentHealthHistory();
    const entry = history[index];

    if (!entry) {
        return;
    }

    entry.resolvedDate = window.SnakeHealth.todayText();
    renderHealthHistory({ healthHistory: history });
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

// ---- History preview and filters -----------------------------------------
//
// Each history shows its three newest entries. "Show all" opens the full list
// with a filter, and every remove button keeps pointing at the original entry
// because the display order is newest-first.

const HISTORY_PREVIEW_COUNT = 3;

const historyViewState = {
    weight: { expanded: false, filter: "" },
    feeding: { expanded: false, filter: "" },
    shed: { expanded: false, filter: "" }
};

const WEIGHT_PERIOD_FILTERS = [
    { value: "", label: "All entries" },
    { value: "30", label: "Last 30 days" },
    { value: "90", label: "Last 90 days" },
    { value: "year", label: "This year" }
];

function historyDateValue(date) {
    if (!date) {
        return -Infinity;
    }

    const time = new Date(date).getTime();
    return Number.isNaN(time) ? -Infinity : time;
}

function sortHistoryNewestFirst(entries) {
    return entries.slice().sort((a, b) => {
        const timeA = historyDateValue(a.date);
        const timeB = historyDateValue(b.date);

        if (timeA !== timeB) {
            return timeB - timeA;
        }

        return b.index - a.index;
    });
}

function prepareHistoryView(kind, entries, matchesFilter) {
    const view = historyViewState[kind] || { expanded: false, filter: "" };
    const sorted = sortHistoryNewestFirst(entries);
    const hasMoreThanPreview = entries.length > HISTORY_PREVIEW_COUNT;

    // With three or fewer entries there is nothing to reveal or filter, so drop
    // any stale full-list state rather than springing it open on the next add.
    if (!hasMoreThanPreview) {
        view.expanded = false;
        view.filter = "";
    }
    const filtered = hasMoreThanPreview && view.expanded && view.filter
        ? sorted.filter(item => matchesFilter(item, view.filter))
        : sorted;
    const visible = hasMoreThanPreview && view.expanded
        ? filtered
        : sorted.slice(0, HISTORY_PREVIEW_COUNT);

    return {
        entries: visible,
        total: entries.length,
        shown: visible.length,
        expanded: view.expanded,
        filter: view.filter
    };
}

function buildHistoryFilterOptions(values, allLabel, selected) {
    const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

    return `<option value="">${escapeMoneyText(allLabel)}</option>` + unique
        .map(value => `<option value="${escapeMoneyText(value)}"${value === selected ? " selected" : ""}>${escapeMoneyText(value)}</option>`)
        .join("");
}

function buildWeightFilterOptions(selected) {
    return WEIGHT_PERIOD_FILTERS
        .map(item => `<option value="${item.value}"${item.value === selected ? " selected" : ""}>${escapeMoneyText(item.label)}</option>`)
        .join("");
}

function buildHistoryFooter(kind, meta, filterOptionsHtml) {
    if (meta.total <= HISTORY_PREVIEW_COUNT) {
        return "";
    }

    const filterControl = meta.expanded
        ? `<label class="history-filter"><span>Filter</span><select onchange="setHistoryFilter('${kind}', this.value)">${filterOptionsHtml}</select></label>`
        : "";

    return `
        <div class="history-controls">
            <span class="history-count">
                Showing ${meta.shown} of ${meta.total}${meta.expanded && meta.filter ? " matching" : ""}
            </span>
            <button type="button" class="small-link-button history-toggle" onclick="toggleHistoryView('${kind}')">
                ${meta.expanded ? "Show last 3" : `Show all ${meta.total}`}
            </button>
            ${filterControl}
        </div>
    `;
}

function weightMatchesHistoryFilter(item, filter) {
    if (!filter) {
        return true;
    }

    const time = historyDateValue(item.date);

    if (time === -Infinity) {
        return false;
    }

    if (filter === "30") {
        return time >= Date.now() - 30 * 24 * 60 * 60 * 1000;
    }

    if (filter === "90") {
        return time >= Date.now() - 90 * 24 * 60 * 60 * 1000;
    }

    if (filter === "year") {
        return new Date(time).getFullYear() === new Date().getFullYear();
    }

    return true;
}

function rerenderHistory(kind) {
    if (kind === "weight") {
        renderWeightHistory({
            weight: document.getElementById("weightInput")?.value || "",
            weightHistory: getCurrentWeightHistory()
        });
        return;
    }

    if (kind === "feeding") {
        renderFeedingHistory({ feedingHistory: getCurrentFeedingHistory() });
        return;
    }

    if (kind === "shed") {
        renderShedHistory({ shedHistory: getCurrentShedHistory() });
    }
}

window.toggleHistoryView = function (kind) {
    const view = historyViewState[kind];

    if (!view) {
        return;
    }

    view.expanded = !view.expanded;
    rerenderHistory(kind);
};

window.setHistoryFilter = function (kind, value) {
    const view = historyViewState[kind];

    if (!view) {
        return;
    }

    view.filter = value || "";
    rerenderHistory(kind);
};

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

    const entries = history.map((entry, index) => ({
        entry,
        index,
        date: entry.date || entry.day || entry.label || "",
        weight: entry.weight || entry.value || entry.result || entry
    }));
    const meta = prepareHistoryView("weight", entries, weightMatchesHistoryFilter);

    const rows = meta.entries.map(item => `
        <div class="dashboard-list-item">
            <span>${item.date}</span>
            <span>${item.weight} g</span>
            <button type="button" class="gene-action-button"
            onclick="removeWeightHistoryEntry(${item.index})">
                Remove
            </button>
        </div>
    `).join("");

    const emptyLine = rows ? "" : `<p class="empty-message">No weight entries match this filter.</p>`;

    list.innerHTML = rows + emptyLine +
        buildHistoryFooter("weight", meta, buildWeightFilterOptions(meta.filter));

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

    const entries = history.map((entry, index) => ({
        entry,
        index,
        date: entry.date || entry.day || entry.label || ""
    }));
    const meta = prepareHistoryView("feeding", entries, (item, filter) => (item.entry.result || "") === filter);

    const rows = meta.entries.map(item => {
        const entry = item.entry;
        const feederSize = entry.feederSize || entry.feeder || "";
        const result = entry.result || "";
        const reason = entry.reason || "";
        const details = [feederSize, result, reason].filter(Boolean).join(" - ");

        return `
            <div class="feeding-list-item">
                <span>${item.date}</span>
                <span>${details || "Fed"}</span>
                <button type="button" class="gene-action-button"
                    onclick="removeFeedingHistoryEntry(${item.index})">
                    Remove
                </button>
            </div>
        `;
    }).join("");

    const emptyLine = rows ? "" : `<p class="empty-message">No feeding entries match this filter.</p>`;
    const filterOptions = buildHistoryFilterOptions(
        [...history.map(entry => entry.result || ""), "Accepted", "Refused", "Regurgitated"],
        "All results",
        meta.filter
    );

    list.innerHTML = rows + emptyLine + buildHistoryFooter("feeding", meta, filterOptions);
}

function renderShedHistory(snake) {
    const list = document.getElementById("shedHistoryList");
    if (!list) return;

    const history = Array.isArray(snake.shedHistory) ? snake.shedHistory : getCurrentShedHistory();

    if (history.length === 0) {
        list.innerHTML = `<p class="empty-message">No shed history yet.</p>`;
        return;
    }

    const entries = history.map((entry, index) => ({
        entry,
        index,
        date: entry.date || ""
    }));
    const meta = prepareHistoryView("shed", entries, (item, filter) => (item.entry.quality || "Shed") === filter);

    const rows = meta.entries.map(item => {
        const entry = item.entry;
        const quality = entry.quality || "Shed";
        const notes = entry.notes || "";
        const details = [quality, notes].filter(Boolean).join(" - ");

        return `
            <div class="feeding-list-item">
                <span>${item.date}</span>
                <span>${details}</span>
                <button type="button" class="gene-action-button"
                    onclick="removeShedHistoryEntry(${item.index})">
                    Remove
                </button>
            </div>
        `;
    }).join("");

    const emptyLine = rows ? "" : `<p class="empty-message">No shed entries match this filter.</p>`;
    const filterOptions = buildHistoryFilterOptions(
        [...history.map(entry => entry.quality || "Shed"), "Complete", "Partial", "Retained Eye Caps", "Retained Tail Tip"],
        "All qualities",
        meta.filter
    );

    list.innerHTML = rows + emptyLine + buildHistoryFooter("shed", meta, filterOptions);
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

// ---- Acquisition & sale ---------------------------------------------------
//
// The money fields are deliberately simple: what it cost, who it came from,
// what it sold for, and where. The Finances page totals these same fields, so
// nothing is typed twice. Produced snakes show parentage instead of a purchase
// price, and a produced snake is never counted as a purchase.

function escapeMoneyText(value) {
    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function moneyOrBlank(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
        return "";
    }

    return Math.round(number * 100) / 100;
}

function formatSnakeMoney(value) {
    if (window.SnakeFinance) {
        return window.SnakeFinance.formatMoney(value);
    }

    return `$${Number(value || 0).toFixed(2)}`;
}

function normalizeParentLabel(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findSnakeIdByParentLabel(label) {
    const target = normalizeParentLabel(label);

    if (!target) {
        return "";
    }

    const currentId = editingIndex !== null && snakes[editingIndex] ? snakes[editingIndex].id : "";
    const match = snakes.find(snake => {
        if (!snake || snake.id === currentId) {
            return false;
        }

        const candidates = [
            snake.name,
            snake.ID,
            snake.morph,
            `${snake.name || ""} - ${snake.ID || snake.morph || ""}`,
            `${snake.name || ""} — ${snake.ID || snake.morph || ""}`
        ];

        return candidates.some(candidate => normalizeParentLabel(candidate) === target);
    });

    return match ? match.id : "";
}

function getParentOptionLabel(snake) {
    const identity = snake.ID || snake.morph || "";
    const sex = snake.sex ? ` (${snake.sex})` : "";

    return identity ? `${snake.name || "Unnamed"} — ${identity}${sex}` : `${snake.name || "Unnamed"}${sex}`;
}

function fillParentSelect(selectId, selectedId, fallbackLabel, emptyLabel) {
    const select = document.getElementById(selectId);

    if (!select) {
        return;
    }

    const currentId = editingIndex !== null && snakes[editingIndex] ? snakes[editingIndex].id : "";
    const options = [`<option value="">${escapeMoneyText(emptyLabel)}</option>`];

    snakes.forEach(snake => {
        if (!snake || snake.id === currentId) {
            return;
        }

        options.push(`<option value="${escapeMoneyText(snake.id)}">${escapeMoneyText(getParentOptionLabel(snake))}</option>`);
    });

    // A parent that was sold on or deleted should not silently become "blank"
    // the next time this record is saved. Keep the id and label the gap.
    if (selectedId && !snakes.some(snake => snake.id === selectedId)) {
        const missingLabel = fallbackLabel
            ? `${fallbackLabel} (no longer in the collection)`
            : "Parent no longer in the collection";

        options.push(`<option value="${escapeMoneyText(selectedId)}">${escapeMoneyText(missingLabel)}</option>`);
    }

    select.innerHTML = options.join("");
    select.value = selectedId || findSnakeIdByParentLabel(fallbackLabel) || "";
}

function fillClutchSelect(selectedId) {
    const select = document.getElementById("clutchInput");

    if (!select) {
        return;
    }

    const clutches = window.SnakeData.readStorageArray("clutches", []);
    const options = [`<option value="">Not linked</option>`];
    let hasSelected = false;

    clutches.forEach(clutch => {
        if (!clutch || !clutch.id) {
            return;
        }

        if (clutch.id === selectedId) {
            hasSelected = true;
        }

        const dateLine = clutch.laidDate ? ` · laid ${clutch.laidDate}` : "";
        options.push(`<option value="${escapeMoneyText(clutch.id)}">${escapeMoneyText(clutch.id + dateLine)}</option>`);
    });

    if (selectedId && !hasSelected) {
        options.push(`<option value="${escapeMoneyText(selectedId)}">${escapeMoneyText(selectedId)}</option>`);
    }

    select.innerHTML = options.join("");
    select.value = selectedId || "";

    const note = document.getElementById("parentageNote");

    if (note) {
        if (clutches.length === 0) {
            note.textContent = "No clutches on file yet. The Outcomes page creates clutch records when eggs hatch; you can still pick the parents here.";
        } else {
            note.textContent = "Leave a parent blank if it is not known. Picking parents keeps this animal's line searchable in breeding plans.";
        }
    }
}

function fillSaleExpoSelect(selectedId) {
    const select = document.getElementById("saleExpoInput");

    if (!select) {
        return;
    }

    const expos = window.SnakeFinance ? window.SnakeFinance.getExpos() : [];
    const options = [`<option value="">Not at a show</option>`];
    let hasSelected = false;

    expos
        .slice()
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
        .forEach(expo => {
            if (expo.id === selectedId) {
                hasSelected = true;
            }

            const dateLine = expo.date ? ` · ${expo.date}` : "";
            options.push(`<option value="${escapeMoneyText(expo.id)}">${escapeMoneyText(expo.name + dateLine)}</option>`);
        });

    if (selectedId && !hasSelected) {
        options.push(`<option value="${escapeMoneyText(selectedId)}">Show no longer on file</option>`);
    }

    select.innerHTML = options.join("");
    select.value = selectedId || "";
}

function fillMoneyDatalists() {
    const sellers = new Set();
    const buyers = new Set();

    snakes.forEach(snake => {
        if (snake && snake.purchasedFrom) {
            sellers.add(snake.purchasedFrom);
        }

        if (snake && snake.soldTo) {
            buyers.add(snake.soldTo);
        }
    });

    const renderList = (id, values) => {
        const list = document.getElementById(id);

        if (!list) {
            return;
        }

        list.innerHTML = [...values]
            .sort((a, b) => a.localeCompare(b))
            .map(value => `<option value="${escapeMoneyText(value)}"></option>`)
            .join("");
    };

    renderList("sellerOptions", sellers);
    renderList("buyerOptions", buyers);
}

function updateAcquisitionFields() {
    const sourceInput = document.getElementById("acquisitionSourceInput");

    if (!sourceInput) {
        return;
    }

    const source = sourceInput.value;
    const showingParentage = source === "produced";

    document.querySelectorAll(".money-purchase-field").forEach(field => {
        field.style.display = showingParentage ? "none" : "";
    });

    const parentage = document.getElementById("parentageFields");

    if (parentage) {
        parentage.style.display = showingParentage ? "" : "none";
    }

    updateMoneySummary();
}

function updateMoneySummary() {
    const summary = document.getElementById("acquisitionSummary");

    if (!summary) {
        return;
    }

    const source = document.getElementById("acquisitionSourceInput").value;
    const purchase = source === "produced" ? 0 : Number(document.getElementById("purchasePriceInput").value) || 0;
    const sale = Number(document.getElementById("salePriceInput").value) || 0;
    const parts = [];

    if (source === "produced") {
        parts.push('<span class="money-summary-item">Produced here — no purchase price counted.</span>');
    } else if (purchase > 0) {
        parts.push(`<span class="money-summary-item">Cost <strong>${formatSnakeMoney(purchase)}</strong></span>`);
    }

    if (sale > 0) {
        parts.push(`<span class="money-summary-item">Sold for <strong>${formatSnakeMoney(sale)}</strong></span>`);
    }

    if (sale > 0) {
        const difference = sale - purchase;
        const label = difference >= 0 ? "Profit" : "Loss";
        const className = difference >= 0 ? "money-profit" : "money-loss";

        parts.push(`<span class="money-summary-item ${className}">${label} <strong>${formatSnakeMoney(Math.abs(difference))}</strong></span>`);
    } else if (purchase > 0) {
        parts.push('<span class="money-summary-item">Not sold yet — profit appears once a sale price is recorded.</span>');
    }

    summary.innerHTML = parts.length > 0
        ? parts.join("")
        : '<span class="money-summary-item">No money recorded for this snake yet.</span>';
}

function initMoneySection() {
    const sourceInput = document.getElementById("acquisitionSourceInput");

    if (!sourceInput) {
        return;
    }

    const snake = editingIndex !== null && snakes[editingIndex] ? snakes[editingIndex] : null;
    const derivedSource = snake
        ? (snake.acquisitionSource || (snake.clutchId || snake.dam || snake.sire ? "produced" : ""))
        : "";

    sourceInput.value = derivedSource;
    document.getElementById("purchasedFromInput").value = snake ? snake.purchasedFrom || "" : "";
    document.getElementById("purchasePriceInput").value = snake && snake.purchasePrice ? snake.purchasePrice : "";
    document.getElementById("purchaseDateInput").value = snake ? snake.purchaseDate || snake.acquiredDate || "" : "";
    document.getElementById("soldToInput").value = snake ? snake.soldTo || "" : "";
    document.getElementById("salePriceInput").value = snake && snake.salePrice ? snake.salePrice : "";
    document.getElementById("saleDateInput").value = snake ? snake.saleDate || "" : "";

    fillParentSelect("sireInput", snake ? snake.sireId || "" : "", snake ? snake.sire || "" : "", "Not recorded");
    fillParentSelect("damInput", snake ? snake.damId || "" : "", snake ? snake.dam || "" : "", "Not recorded");
    fillClutchSelect(snake ? snake.clutchId || "" : "");
    fillSaleExpoSelect(snake ? snake.saleExpoId || "" : "");
    fillMoneyDatalists();
    updateAcquisitionFields();

    const statusInput = document.getElementById("statusInput");

    if (statusInput) {
        statusInput.addEventListener("change", () => {
            const saleDate = document.getElementById("saleDateInput");

            if (statusInput.value === "Sold" && saleDate && !saleDate.value) {
                const today = new Date();
                const month = String(today.getMonth() + 1).padStart(2, "0");
                const day = String(today.getDate()).padStart(2, "0");

                saleDate.value = `${today.getFullYear()}-${month}-${day}`;
            }

            updateRetirementFields(true);
            updateMoneySummary();
        });
    }

    updateRetirementFields(false);
}

function saveSnakeFromPage() {
    const name = document.getElementById("nameInput").value.trim();
    const morph = document.getElementById("snakeIDInput").value.trim();

    if (name === "" || morph === "") {
        expandSectionContaining(document.getElementById("nameInput"));
        alert("Please enter at least a name and ID.");
        return;
    }

    const imageValue = document.getElementById("imageInput").value.trim();

    if (imageValue.startsWith("blob:")) {
        expandSectionContaining(document.getElementById("imageInput"));
        alert("The photo is still uploading. Try saving again in a moment.");
        return;
    }

    const existingSnake = editingIndex !== null && snakes[editingIndex]
        ? snakes[editingIndex]
        : {};
    const status = document.getElementById("statusInput").value;
    const isRetired = window.SnakeData.isRetiredStatus(status);

    const source = document.getElementById("acquisitionSourceInput").value;
    const sireId = document.getElementById("sireInput").value;
    const damId = document.getElementById("damInput").value;
    const sireSnake = snakes.find(candidate => candidate.id === sireId) || null;
    const damSnake = snakes.find(candidate => candidate.id === damId) || null;

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
        healthHistory: [...getCurrentHealthHistory()],
        ...getQuarantineFormValues(),
        hatchDate: document.getElementById("hatchDateInput").value,
        acquiredDate: document.getElementById("acquiredDateInput").value,
        status,
        retiredDate: isRetired ? document.getElementById("retiredDateInput").value : "",
        retiredReason: isRetired ? document.getElementById("retiredReasonInput").value.trim() : "",
        retiredNote: isRetired ? document.getElementById("retiredNoteInput").value.trim() : "",
        retiredFromStatus: isRetired
            ? (existingSnake.retiredFromStatus
                || (existingSnake.status && existingSnake.status !== status ? existingSnake.status : ""))
            : "",
        genes: currentGenes,
        acquisitionSource: source,
        purchasedFrom: source === "produced"
            ? ""
            : document.getElementById("purchasedFromInput").value.trim(),
        purchasePrice: source === "produced"
            ? ""
            : moneyOrBlank(document.getElementById("purchasePriceInput").value),
        purchaseDate: source === "produced"
            ? ""
            : document.getElementById("purchaseDateInput").value,
        sireId,
        damId,
        sire: sireSnake
            ? window.SnakeData.getSnakeLabelByReference(snakes, sireSnake.id)
            : (sireId ? existingSnake.sire || "" : (existingSnake.sireId ? "" : existingSnake.sire || "")),
        dam: damSnake
            ? window.SnakeData.getSnakeLabelByReference(snakes, damSnake.id)
            : (damId ? existingSnake.dam || "" : (existingSnake.damId ? "" : existingSnake.dam || "")),
        clutchId: document.getElementById("clutchInput").value,
        soldTo: document.getElementById("soldToInput").value.trim(),
        salePrice: moneyOrBlank(document.getElementById("salePriceInput").value),
        saleDate: document.getElementById("saleDateInput").value,
        saleExpoId: document.getElementById("saleExpoInput").value
    };

    // The Main Photo URL field is authoritative for the main photo; the
    // gallery array rides along so every photo syncs with the snapshot.
    let savedPhotos = [...currentPhotos];

    if (savedPhotos.length === 0) {
        savedPhotos = imageValue ? [{ url: imageValue, addedAt: null }] : [];
    } else if (imageValue && imageValue !== savedPhotos[0].url) {
        savedPhotos[0] = { url: imageValue, addedAt: savedPhotos[0].addedAt || null };
    }

    snake.photos = savedPhotos;
    snake.image = savedPhotos.length > 0 ? savedPhotos[0].url : "Images/TheSnakeRoom.jpg";

    if (pendingFeedingHold) {
        snake.feedingHold = { ...pendingFeedingHold };
    }

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
window.updateAcquisitionFields = updateAcquisitionFields;
window.updateMoneySummary = updateMoneySummary;
window.updateRetirementFields = updateRetirementFields;
window.addWeightHistoryEntry = addWeightHistoryEntry;
window.addFeedingHistoryEntry = addFeedingHistoryEntry;
window.updateFeedingReasonVisibility = updateFeedingReasonVisibility;
window.endFeedingHoldFromForm = endFeedingHoldFromForm;
window.addShedHistoryEntry = addShedHistoryEntry;
window.addHealthHistoryEntry = addHealthHistoryEntry;
window.removeHealthHistoryEntry = removeHealthHistoryEntry;
window.resolveHealthFollowUp = resolveHealthFollowUp;
window.updateQuarantineReleaseFields = updateQuarantineReleaseFields;
window.removeWeightHistoryEntry = removeWeightHistoryEntry;
window.removeFeedingHistoryEntry = removeFeedingHistoryEntry;
window.removeShedHistoryEntry = removeShedHistoryEntry;
window.removePhoto = removePhoto;
window.makePhotoMain = makePhotoMain;
window.saveSnakeFromPage = saveSnakeFromPage;

setupCollapsibleSections();
setupGeneOptions();
setupFeedingReasonOptions();
setupHealthOptions();
fillFormForEdit();
initMoneySection();
expandSnakeSectionFromHash();
window.addEventListener("hashchange", expandSnakeSectionFromHash);

["quarantineStartInput", "quarantineEndInput", "quarantineReasonInput", "quarantineNotesInput"]
    .forEach(id => {
        const input = document.getElementById(id);
        if (input) input.addEventListener("change", renderQuarantineStatus);
    });

const photoFileInput = document.getElementById("photoFileInput");
const cameraFileInput = document.getElementById("cameraFileInput");
const cameraPhotoButton = document.getElementById("cameraPhotoButton");

if (photoFileInput) {
    photoFileInput.addEventListener("change", handlePhotoFileChange);
}

if (cameraFileInput) {
    cameraFileInput.addEventListener("change", handlePhotoFileChange);
}

if (cameraPhotoButton && cameraFileInput) {
    cameraPhotoButton.addEventListener("click", () => cameraFileInput.click());
}

// The floating Save pill shows whenever the normal save row is scrolled out
// of view, so long forms can be saved without scrolling to the bottom.
const saveActionsRow = document.getElementById("saveActionsRow");
const floatingSaveBar = document.getElementById("floatingSaveBar");

if (saveActionsRow && floatingSaveBar && "IntersectionObserver" in window) {
    const saveRowObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            floatingSaveBar.classList.toggle("hidden", entry.isIntersecting);
        });
    });

    saveRowObserver.observe(saveActionsRow);
}
