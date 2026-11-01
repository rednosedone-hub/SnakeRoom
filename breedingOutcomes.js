// Breeding Outcomes: turn hatched clutches into real hatchling records.
//
// A clutch is marked hatched when the hatchling records are created here. The
// hatchlings get names, bins, sexes and statuses right away; genes, photos and
// weights get filled in on their profile pages later. The clutch record itself
// stays as history and is listed under Hatched Clutches.

const snakes = window.SnakeData.loadSnakesWithIds([]);
let clutches = window.SnakeData.readStorageArray("clutches", []);

const OUTCOMES_DEFAULT_STATUS = "Hatchling";
const hatchlingPreparation = {};

function saveSnakes() {
    window.SnakeData.saveStorageArray("snakes", snakes);
}

function saveClutches() {
    window.SnakeData.saveStorageArray("clutches", clutches);
}

function getTodayText() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

// ---- Incubation ---------------------------------------------------------
// The due date, candling and hatch maths live in incubation-helpers.js so the
// calendar can ask the same question and get the same answer.

function incubationTool() {
    return window.Incubation || null;
}

// Plain text, because this line is also refreshed with textContent after a
// field changes. The one place it enters HTML escapes it.
function incubationStatusText(clutch) {
    const incubation = incubationTool();

    if (!incubation) {
        return "";
    }

    const info = incubation.status(clutch, getTodayText());
    const days = incubation.incubationDays(clutch);

    if (info.stage === "unlaid") {
        return "No laid date yet — record it on the pair to start the countdown.";
    }

    if (info.stage === "hatched") {
        const incubated = incubation.incubatedDays(clutch);

        return `Hatched ${clutch.hatchedDate || ""}${incubated === null ? "" : ` after ${incubated} days`}.`;
    }

    if (info.stage === "pipped") {
        return `Pipped ${info.pipDate} · due ${info.dueDate} · hatch within a day or two.`;
    }

    if (info.stage === "overdue") {
        const late = Math.abs(info.daysToHatch);

        return `Day ${info.day} of ${days} · due ${info.dueDate} · ${late} day${late === 1 ? "" : "s"} overdue — open the incubator and check for pips.`;
    }

    if (info.stage === "due") {
        return `Day ${info.day} of ${days} · due today.`;
    }

    return `Day ${info.day} of ${days} · due ${info.dueDate} · ${info.daysToHatch} day${info.daysToHatch === 1 ? "" : "s"} to go.`;
}

function isIncubationOverdue(clutch) {
    const incubation = incubationTool();

    return Boolean(incubation && incubation.status(clutch, getTodayText()).stage === "overdue");
}

function describeCandleEntry(entry) {
    const parts = [];

    if (entry.fertile !== "") {
        parts.push(`${entry.fertile} fertile`);
    }

    if (entry.slugs !== "") {
        parts.push(`${entry.slugs} slug${entry.slugs === 1 ? "" : "s"}`);
    }

    if (entry.note) {
        parts.push(entry.note);
    }

    return parts.join(" · ");
}

function candlingSummaryText(clutch) {
    const incubation = incubationTool();

    if (!incubation) {
        return "";
    }

    const summary = incubation.candlingSummary(clutch);

    if (!summary.date) {
        const due = incubation.candleDueDate(clutch);

        return due
            ? `Not candled yet · a first look around ${due} shows which eggs have veins.`
            : "Not candled yet.";
    }

    const counts = describeCandleEntry({
        fertile: summary.fertile === null ? "" : summary.fertile,
        slugs: summary.slugs === null ? "" : summary.slugs,
        note: ""
    });
    const eggNote = summary.candled !== null && summary.eggs > 0 && summary.candled > summary.eggs
        ? ` · more than the ${summary.eggs} egg${summary.eggs === 1 ? "" : "s"} on record`
        : "";

    return `Candled ${summary.date}${counts ? ` · ${counts}` : ""}${eggNote}`;
}

function renderCandlingRows(clutch) {
    const incubation = incubationTool();
    const raw = Array.isArray(clutch.candleLog) ? clutch.candleLog : [];

    if (!incubation) {
        return "";
    }

    const rows = raw
        .map((entry, index) => ({ entry: incubation.candleEntry(entry), index }))
        .filter(item => item.entry)
        .sort((left, right) => right.entry.date.localeCompare(left.entry.date) || right.index - left.index);

    if (rows.length === 0) {
        return `<p class="empty-message">No candling records yet.</p>`;
    }

    return rows.map(({ entry, index }) => `
        <div class="candling-row">
            <span class="candling-text">
                <strong>${escapeHtml(entry.date)}</strong>
                <small>${escapeHtml(describeCandleEntry(entry))}</small>
            </span>
            <button type="button" class="gene-remove-button"
                onclick="removeCandling('${clutch.clutchToken}', ${index})"
                title="Remove this candling record">✕</button>
        </div>
    `).join("");
}

function renderIncubationPanel(clutch) {
    const incubation = incubationTool();

    if (!incubation) {
        return "";
    }

    const token = clutch.clutchToken;
    const today = getTodayText();

    return `
        <div class="incubation-panel">
            <div class="incubation-head">
                <h4>Incubation</h4>
                <p class="incubation-status${isIncubationOverdue(clutch) ? " is-overdue" : ""}"
                    id="incubationStatus-${token}">${escapeHtml(incubationStatusText(clutch))}</p>
            </div>

            <div class="form-grid incubation-grid">
                <label class="form-field">
                    <span>Incubator</span>
                    <input type="text" id="incubator-${token}" maxlength="60"
                        placeholder="e.g. Mini fridge"
                        value="${escapeHtml(clutch.incubator || "")}"
                        onchange="updateClutchField('${token}', 'incubator', this.value)">
                </label>

                <label class="form-field">
                    <span>Days to hatch</span>
                    <input type="number" id="incubationDays-${token}" min="${incubation.MIN_DAYS}"
                        max="${incubation.MAX_DAYS}" step="1"
                        value="${incubation.incubationDays(clutch)}"
                        onchange="updateClutchField('${token}', 'incubationDays', this.value)">
                </label>

                <label class="form-field">
                    <span>Pipped</span>
                    <input type="date" id="pipDate-${token}"
                        value="${escapeHtml(clutch.pipDate || "")}"
                        onchange="updateClutchField('${token}', 'pipDate', this.value)">
                </label>
            </div>

            <div class="candling-block">
                <div class="section-heading-row">
                    <h4>Candling</h4>
                    <span class="empty-message candling-summary" id="candleSummary-${token}">${candlingSummaryText(clutch)}</span>
                </div>

                <div class="candling-form">
                    <label class="form-field">
                        <span>Date</span>
                        <input type="date" id="candleDate-${token}" value="${today}">
                    </label>

                    <label class="form-field">
                        <span>Fertile</span>
                        <input type="number" id="candleFertile-${token}" min="0" step="1" placeholder="Count">
                    </label>

                    <label class="form-field">
                        <span>Slugs</span>
                        <input type="number" id="candleSlugs-${token}" min="0" step="1" placeholder="Count">
                    </label>

                    <label class="form-field candling-note-field">
                        <span>Note</span>
                        <input type="text" id="candleNote-${token}" maxlength="200" placeholder="Veins, mould, moved to...">
                    </label>

                    <button type="button" class="gene-action-button"
                        onclick="addCandling('${token}')">Add Candling</button>
                </div>

                <div class="candling-log" id="candleLog-${token}">
                    ${renderCandlingRows(clutch)}
                </div>
            </div>
        </div>
    `;
}

// Editing the panel must not rebuild the page: typed hatchling names live only
// in the DOM until they are saved, so the status line is refreshed in place.
function refreshIncubationStatus(clutch) {
    const status = document.getElementById(`incubationStatus-${clutch.clutchToken}`);

    if (!status || !incubationTool()) {
        return;
    }

    status.textContent = incubationStatusText(clutch);
    status.classList.toggle("is-overdue", isIncubationOverdue(clutch));
}

function updateClutchField(token, field, value) {
    const clutch = clutches.find(item => item.clutchToken === token);
    const allowed = ["incubator", "incubationDays", "pipDate"];

    if (!clutch || !allowed.includes(field)) {
        return;
    }

    if (field === "incubator") {
        clutch.incubator = String(value || "").trim().slice(0, 60);
    }

    if (field === "incubationDays") {
        const days = Math.round(Number(value));
        const incubation = incubationTool();
        const min = incubation ? incubation.MIN_DAYS : 40;
        const max = incubation ? incubation.MAX_DAYS : 100;

        // An impossible number falls back to the normal term rather than
        // producing a due date in 2094.
        clutch.incubationDays = Number.isFinite(days) && days >= min && days <= max ? days : "";

        const input = document.getElementById(`incubationDays-${token}`);

        if (input) {
            input.value = incubation ? incubation.incubationDays(clutch) : 55;
        }
    }

    if (field === "pipDate") {
        const incubation = incubationTool();
        const clean = String(value || "").slice(0, 10);

        clutch.pipDate = incubation && incubation.parseDate(clean) ? clean : "";
    }

    saveClutches();
    refreshIncubationStatus(clutch);
}

function addCandling(token) {
    const clutch = clutches.find(item => item.clutchToken === token);
    const incubation = incubationTool();

    if (!clutch || !incubation) {
        return;
    }

    const entry = incubation.candleEntry({
        date: document.getElementById(`candleDate-${token}`)?.value || "",
        fertile: document.getElementById(`candleFertile-${token}`)?.value || "",
        slugs: document.getElementById(`candleSlugs-${token}`)?.value || "",
        note: document.getElementById(`candleNote-${token}`)?.value || ""
    });

    if (!entry) {
        alert("Add a date and at least one count or a note.");
        return;
    }

    clutch.candleLog = Array.isArray(clutch.candleLog) ? clutch.candleLog : [];
    clutch.candleLog.push(entry);
    saveClutches();

    const log = document.getElementById(`candleLog-${token}`);
    const summary = document.getElementById(`candleSummary-${token}`);

    if (log) {
        log.innerHTML = renderCandlingRows(clutch);
    }

    if (summary) {
        summary.textContent = candlingSummaryText(clutch);
    }

    ["candleFertile", "candleSlugs", "candleNote"].forEach(id => {
        const input = document.getElementById(`${id}-${token}`);

        if (input) {
            input.value = "";
        }
    });
}

function removeCandling(token, index) {
    const clutch = clutches.find(item => item.clutchToken === token);
    const raw = clutch && Array.isArray(clutch.candleLog) ? clutch.candleLog : [];

    if (!clutch || index < 0 || index >= raw.length) {
        return;
    }

    raw.splice(index, 1);
    saveClutches();

    const log = document.getElementById(`candleLog-${token}`);
    const summary = document.getElementById(`candleSummary-${token}`);

    if (log) {
        log.innerHTML = renderCandlingRows(clutch);
    }

    if (summary) {
        summary.textContent = candlingSummaryText(clutch);
    }
}

function getSnakeLabelByRef(reference) {
    return window.SnakeData.getSnakeLabelByReference(snakes, reference);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function slugify(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function formatCount(clutch) {
    return `Eggs: ${clutch.eggCount || 0}`;
}

function isBreedingOutcomeClutch(clutch) {
    return Boolean(clutch.femaleSnakeId || clutch.maleSnakeId || clutch.laidDate);
}

function getBreedingOutcomes() {
    return clutches.filter(isBreedingOutcomeClutch);
}

// Clutch ids used to be year counters like "2025-01" that could repeat after a
// restore, so each clutch gets a stable random token. Hatchling links are a
// random token too, which lets the same clutch be re-linked after restore.
function migrateClutchTokens() {
    let changed = false;

    clutches.forEach(clutch => {
        if (!clutch.clutchToken) {
            clutch.clutchToken = `tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
            changed = true;
        }
    });

    clutches.forEach(clutch => {
        snakes.forEach(snake => {
            if (snake.clutchId === clutch.id && !snake.clutchToken) {
                snake.clutchToken = clutch.clutchToken;
                snake.hatchlingToken = snake.hatchlingToken || `th-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
                changed = true;
            }
        });
    });

    if (changed) {
        saveSnakes();
        saveClutches();
    }
}

function buildHatchlingDefaults(clutch, index) {
    return {
        name: `${clutch.id}-${String(index).padStart(2, "0")}`,
        binNumber: "",
        sex: "Unknown",
        status: OUTCOMES_DEFAULT_STATUS
    };
}

function prepareHatchlings(clutch) {
    if (!hatchlingPreparation[clutch.clutchToken]) {
        // If the eggs were candled, the fertile count is the honest number of
        // hatchlings to expect: slugs are eggs that never had a snake in them.
        const incubation = incubationTool();
        const summary = incubation ? incubation.candlingSummary(clutch) : null;
        const count = summary && summary.fertile !== null && summary.fertile > 0
            ? summary.fertile
            : Number(clutch.eggCount) || 0;

        hatchlingPreparation[clutch.clutchToken] = Array.from({ length: count }, (_, offset) => {
            const index = offset + 1;

            return { index, ...buildHatchlingDefaults(clutch, index) };
        });
    }

    return hatchlingPreparation[clutch.clutchToken];
}

function getHatchlingSnake(clutch, token) {
    return snakes.find(snake =>
        snake.clutchId === clutch.id &&
        snake.clutchToken === clutch.clutchToken &&
        snake.hatchlingToken === token
    );
}

function getSnakeByName(name) {
    const searchName = name.toLowerCase();

    return snakes.find(snake => String(snake.name || "").trim().toLowerCase() === searchName);
}

// The pairing's possible outcomes, so a hatchling can be labelled with the one
// it actually hatched as instead of having its genes typed in again later. The
// list is the same one the Morph Calculator shows for these two parents.
const clutchOutcomeCache = {};

function getClutchOutcomes(clutch) {
    if (!clutch || !window.MorphCalculator) {
        return [];
    }

    const token = clutch.clutchToken;

    if (clutchOutcomeCache[token]) {
        return clutchOutcomeCache[token];
    }

    const dam = window.SnakeData.getSnakeByReference(snakes, clutch.femaleSnakeId);
    const sire = window.SnakeData.getSnakeByReference(snakes, clutch.maleSnakeId);
    const outcomes = window.MorphCalculator.calculatePairing(
        (dam && dam.genes) || [],
        (sire && sire.genes) || []
    );

    clutchOutcomeCache[token] = outcomes;

    return outcomes;
}

function storeOutcomeGenes(outcome) {
    if (!outcome) {
        return [];
    }

    if (window.MorphGallery && typeof window.MorphGallery.descriptionToStorage === "function") {
        return window.MorphGallery.descriptionToStorage(outcome.geneDetails);
    }

    return outcome.geneDetails.map(gene => ({
        name: gene.name,
        copies: gene.copies,
        ...(gene.hetOdds === undefined || gene.hetOdds === null ? {} : { hetOdds: gene.hetOdds })
    }));
}

// Selecting an outcome records the genotype on the prepared row immediately, so
// a later re-render (adding or removing a hatchling) does not lose the choice.
function applyMorphChoice(clutchToken, row, value) {
    const clutch = clutches.find(item => item.clutchToken === clutchToken);
    const outcomes = clutch ? getClutchOutcomes(clutch) : [];

    // "Not recorded" is an empty string, which Number() would read as outcome 0.
    const index = value === "" || value === null || value === undefined ? -1 : Number(value);
    const outcome = Number.isInteger(index) && index >= 0 && outcomes[index] ? outcomes[index] : null;

    row.morphChoice = outcome ? String(index) : "";
    row.genes = storeOutcomeGenes(outcome);
    row.morphName = outcome ? outcome.morphName : "";

    return outcome;
}

function rememberHatchlingChoices() {
    Object.entries(hatchlingPreparation).forEach(([token, rows]) => {
        rows.forEach(row => {
            const select = document.getElementById(`hatchMorph-${token}-${row.index}`);

            if (select) {
                applyMorphChoice(token, row, select.value);
            }
        });
    });
}

// Shows the chosen morph's tag and, when another keeper has published one, a
// real photo of it next to the select.
async function previewHatchlingMorph(clutchToken, index) {
    const row = (hatchlingPreparation[clutchToken] || []).find(item => item.index === Number(index));
    const select = document.getElementById(`hatchMorph-${clutchToken}-${index}`);
    const target = document.getElementById(`hatchMorphExample-${clutchToken}-${index}`);

    if (!row || !select || !target) {
        return;
    }

    const outcome = applyMorphChoice(clutchToken, row, select.value);
    target.innerHTML = "";

    if (!outcome) {
        return;
    }

    target.innerHTML = `<span class="gene-pill">${escapeHtml(outcome.morphName)}</span>`;

    if (!window.MorphGallery || typeof window.MorphGallery.fetchExamples !== "function") {
        return;
    }

    const key = window.MorphGallery.morphKeyFromGenes(row.genes);

    try {
        const examples = await window.MorphGallery.fetchExamples([key]);
        const photo = (examples.get(key) || [])[0];

        if (photo && target.isConnected) {
            target.innerHTML += `
                <a href="morphGallery.html?q=${encodeURIComponent(outcome.morphName)}" class="hatchling-morph-photo-link">
                    <img class="hatchling-morph-photo" src="${escapeHtml(photo.photoUrl)}"
                        alt="${escapeHtml(outcome.morphName)}" loading="lazy">
                </a>
            `;
        }
    } catch (error) {
        // No photo is a fine answer; the morph name still shows.
    }
}

function readHatchlingRow(clutch, row) {
    const token = `${clutch.clutchToken}-${row.index}`;
    const morphSelect = document.getElementById(`hatchMorph-${token}`);
    const outcome = morphSelect ? applyMorphChoice(clutch.clutchToken, row, morphSelect.value) : null;

    return {
        name: String(document.getElementById(`hatchName-${token}`).value || "").trim(),
        binNumber: String(document.getElementById(`hatchBin-${token}`).value || "").trim(),
        sex: document.getElementById(`hatchSex-${token}`).value || "Unknown",
        status: document.getElementById(`hatchStatus-${token}`).value || OUTCOMES_DEFAULT_STATUS,
        genes: Array.isArray(row.genes) ? row.genes : [],
        morphName: outcome ? outcome.morphName : ""
    };
}

function createHatchlingRecord(clutch, row, hatchDate) {
    const stamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    const hatchlingId = `snake-hatch-${stamp}-${random}`;

    return {
        id: hatchlingId,
        name: row.name,
        // The owner-assigned ID stays the hatchling's name; the morph field only
        // takes over once the predicted morph was picked for this animal.
        ID: row.name,
        morph: row.morphName || row.name,
        sex: row.sex,
        weight: "",
        binNumber: row.binNumber,
        hatchDate: hatchDate || "",
        acquiredDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: row.status,
        genes: Array.isArray(row.genes) ? row.genes : [],
        feedingHistory: [],
        weightHistory: [],
        shedHistory: [],
        image: "Images/TheSnakeRoom.jpg",
        photos: [],
        clutchId: clutch.id,
        clutchToken: clutch.clutchToken,
        hatchlingToken: `th-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        dam: getSnakeLabelByRef(clutch.femaleSnakeId),
        sire: getSnakeLabelByRef(clutch.maleSnakeId),
        laidDate: clutch.laidDate || "",
        hatchedDate: hatchDate || ""
    };
}

function extractExistingHatchlingIds(clutch) {
    return snakes
        .filter(snake => snake.clutchId === clutch.id)
        .map(snake => String(snake.name || ""))
        .filter(Boolean);
}

function saveHatchlings(token) {
    const clutch = clutches.find(item => item.clutchToken === token);

    if (!clutch) {
        return;
    }

    const hatchDateInput = document.getElementById(`hatchDate-${token}`);
    const hatchDate = hatchDateInput ? hatchDateInput.value : getTodayText();
    const rows = (hatchlingPreparation[token] || []).map(row => readHatchlingRow(clutch, row));

    if (rows.length === 0) {
        alert("Add at least one hatchling first.");
        return;
    }

    for (let index = 0; index < rows.length; index += 1) {
        if (!rows[index].name) {
            alert(`Name hatchling ${index + 1} before saving.`);
            return;
        }
    }

    const existingHatchlings = extractExistingHatchlingIds(clutch);
    if (existingHatchlings.length > 0) {
        const willBeAdded = rows.filter(row => !existingHatchlings.includes(row.name)).length;
        const ok = confirm(
            `${existingHatchlings.length} hatchling(s) already exist for this clutch:\n` +
            existingHatchlings.join(", ") +
            `\nAdding ${willBeAdded} more.\nContinue?`
        );
        if (!ok) {
            return;
        }
    }

    let addMiddleSafeguard = false;
    const names = rows.map(row => row.name);
    if (rows.length > 1) {
        // Allow middle inserts, but tell the user when they are using defaults.
        addMiddleSafeguard = rows.some(row => row.name === `${clutch.id}-${String(row.index).padStart(2, "0")}`);
        if (addMiddleSafeguard) {
            const ok = confirm("Some hatchlings still use default names. Add them anyway?");
            if (!ok) {
                return;
            }
        }
    }

    const midNames = [];
    for (let index = 0; index < rows.length; index += 1) {
        let nextName = rows[index].name;

        if (getSnakeByName(nextName)) {
            if (!addMiddleSafeguard) {
                continue;
            }
            nextName = `${nextName}-mid-${index + 1}`;
            midNames.push(nextName);
        }

        snakes.push(createHatchlingRecord(clutch, { ...rows[index], name: nextName }, hatchDate));
    }

    clutch.hatchedDate = clutch.hatchedDate || hatchDate || getTodayText();
    clutch.hatchlingCount = Math.max(clutch.hatchlingCount || 0, existingHatchlings.length + rows.length);
    clutch.convertedToSnakes = true;

    delete hatchlingPreparation[token];

    saveSnakes();
    saveClutches();

    if (midNames.length > 0) {
        alert(`Some names were already taken, so they were saved as: ${midNames.join(", ")}.`);
        return;
    }

    renderBreedingOutcomes();
}

function addHatchling(clutchId) {
    const clutch = clutches.find(item => item.id === clutchId);

    if (!clutch) {
        return;
    }

    if (!hatchlingPreparation[clutch.clutchToken]) {
        hatchlingPreparation[clutch.clutchToken] = [
            { index: (clutch.hatchlingCount || 0) + 1, ...buildHatchlingDefaults(clutch, (clutch.hatchlingCount || 0) + 1) }
        ];
    }

    renderBreedingOutcomes();

    const editor = document.getElementById(`editContainer-${clutch.clutchToken}`);
    if (editor) {
        editor.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function removePreparedHatchling(token, index) {
    const rows = hatchlingPreparation[token];

    if (!rows) {
        return;
    }

    const row = rows.find(item => item.index === index);
    if (row) {
        rows.splice(rows.indexOf(row), 1);
    }

    rows.forEach((updated, offset) => {
        updated.index = offset + 1;
    });

    if (rows.length === 0) {
        delete hatchlingPreparation[token];
    }

    renderBreedingOutcomes();
}

function updateOutcomesStatus() {
    const status = document.getElementById("outcomesStatus");
    const activeCount = getBreedingOutcomes().filter(clutch => !clutch.convertedToSnakes).length;

    status.textContent = activeCount === 0
        ? "No clutches waiting to hatch."
        : `${activeCount} clutch${activeCount === 1 ? "" : "es"} waiting to hatch.`;
}

function renderOutcomeCard(clutch) {
    const token = clutch.clutchToken;
    const rows = prepareHatchlings(clutch);

    return `
        <div class="breeding-card outcome-card" id="outcomeCard-${token}">
            <div>
                <h4>Clutch ${escapeHtml(clutch.id)}</h4>
                <p>${escapeHtml(getSnakeLabelByRef(clutch.femaleSnakeId))} x ${escapeHtml(getSnakeLabelByRef(clutch.maleSnakeId))}</p>
                <p>Laid: ${escapeHtml(clutch.laidDate || "Not recorded")} / ${escapeHtml(formatCount(clutch))}</p>
            </div>

            ${renderIncubationPanel(clutch)}

            <div class="form-grid hatchling-editor-grid">
                <label class="form-field hatch-date-field">
                    <span>Hatch Date</span>
                    <input type="date" id="hatchDate-${token}" value="${escapeHtml(clutch.hatchedDate || getTodayText())}">
                </label>

                ${rows.map(row => renderHatchlingEditorRow(clutch, row)).join("")}
            </div>

            <div class="card-buttons">
                <button type="button" class="edit-button" onclick="saveHatchlings('${token}')">
                    Create ${rows.length} Hatchling${rows.length === 1 ? "" : "s"}
                </button>
            </div>
        </div>
    `;
}

function renderHatchlingEditorRow(clutch, row) {
    const token = `${clutch.clutchToken}-${row.index}`;
    const outcomes = getClutchOutcomes(clutch);

    return `
        <div class="hatchling-editor-row">
            <div class="hatchling-editor-heading">
                Hatchling ${row.index}
                <button type="button" class="gene-remove-button"
                    onclick="removePreparedHatchling('${clutch.clutchToken}', ${row.index})"
                    title="Remove this hatchling">
                    ✕
                </button>
            </div>

            <label class="form-field">
                <span>Name</span>
                <input type="text" id="hatchName-${token}"
                    placeholder="Leave blank to use ${escapeHtml(clutch.id)}-${String(row.index).padStart(2, "0")}"
                    value="${escapeHtml(row.name)}">
            </label>

            <label class="form-field">
                <span>Bin</span>
                <input type="text" id="hatchBin-${token}" placeholder="Bin"
                    value="${escapeHtml(row.binNumber)}">
            </label>

            <label class="form-field">
                <span>Sex</span>
                <select id="hatchSex-${token}">
                    ${["Unknown", "Female", "Male"]
                        .map(sex => `<option value="${sex}" ${sex === row.sex ? "selected" : ""}>${sex}</option>`)
                        .join("")}
                </select>
            </label>

            <label class="form-field">
                <span>Status</span>
                <select id="hatchStatus-${token}">
                    ${["Hatchling", "Holdback", "Breeder", "Available", "On Hold", "Sold", "Archived", "Deceased"]
                        .map(status => `<option value="${status}" ${status === row.status ? "selected" : ""}>${status}</option>`)
                        .join("")}
                </select>
            </label>

            <label class="form-field hatchling-morph-field">
                <span>Predicted morph</span>
                <select id="hatchMorph-${token}"
                    onchange="previewHatchlingMorph('${clutch.clutchToken}', ${row.index})">
                    <option value="">Not recorded</option>
                    ${outcomes.map((outcome, index) => `
                        <option value="${index}" ${String(row.morphChoice) === String(index) ? "selected" : ""}>
                            ${escapeHtml(outcome.morphName)} — ${Math.round(outcome.probability * 1000) / 10}%
                        </option>
                    `).join("")}
                </select>
                <span class="hatchling-morph-example" id="hatchMorphExample-${token}">
                    ${row.morphName ? `<span class="gene-pill">${escapeHtml(row.morphName)}</span>` : ""}
                </span>
                ${outcomes.length === 0
                    ? `<small class="empty-message">Add genes to both parents to list this clutch's morphs.</small>`
                    : ""}
            </label>
        </div>
    `;
}

function renderHatchedIncubationLine(clutch) {
    const incubation = incubationTool();

    if (!incubation || !clutch.laidDate) {
        return "";
    }

    const incubated = incubation.incubatedDays(clutch);
    const stats = incubation.hatchStats(clutch);
    const parts = [
        incubated === null ? "" : `Incubated ${incubated} days`,
        clutch.pipDate ? `pipped ${escapeHtml(clutch.pipDate)}` : "",
        stats.eggs > 0
            ? `${stats.hatched} of ${stats.eggs} egg${stats.eggs === 1 ? "" : "s"} hatched${stats.percent === null ? "" : ` (${stats.percent}%)`}`
            : ""
    ].filter(Boolean);

    if (parts.length === 0) {
        return "";
    }

    return `<p class="empty-message incubation-hatched-line">${parts.join(" · ")}</p>`;
}

function renderHatchedCard(clutch) {
    const relatedCount = snakes.filter(snake => snake.clutchId === clutch.id).length;
    const rows = hatchlingPreparation[clutch.clutchToken];

    return `
        <div class="breeding-card outcome-card hatched-card" id="hatchedCard-${clutch.clutchToken}">
            <div>
                <h4>Clutch ${escapeHtml(clutch.id)}</h4>
                <p>${escapeHtml(getSnakeLabelByRef(clutch.femaleSnakeId))} x ${escapeHtml(getSnakeLabelByRef(clutch.maleSnakeId))}</p>
                <p>Laid: ${escapeHtml(clutch.laidDate || "Not recorded")} / ${escapeHtml(formatCount(clutch))}</p>
                <p>Hatched: ${escapeHtml(clutch.hatchedDate || "Not recorded")}
                    / Hatchlings: ${clutch.hatchlingCount || 0} (${relatedCount} in collection)</p>
                ${renderHatchedIncubationLine(clutch)}
            </div>

            ${rows ? `
                <div class="form-grid hatchling-editor-grid">
                    ${rows.map(row => renderHatchlingEditorRow(clutch, row)).join("")}
                </div>

                <div class="card-buttons">
                    <button type="button" class="edit-button" onclick="saveHatchlings('${clutch.clutchToken}')">
                        Add Hatchling
                    </button>
                </div>
            ` : `
                <div class="card-buttons">
                    <button type="button" class="gene-action-button" onclick="addHatchling('${clutch.id}')">
                        Add Hatchling
                    </button>
                </div>
            `}
        </div>
    `;
}

function renderBreedingOutcomes() {
    const outcomesList = document.getElementById("outcomesList");
    const hatchedList = document.getElementById("hatchedList");

    // Keep whatever morph each hatchling was labelled with before the lists are
    // rebuilt; the selects are about to be thrown away.
    rememberHatchlingChoices();

    const outcomes = getBreedingOutcomes();
    const active = outcomes.filter(clutch => !clutch.convertedToSnakes);
    const hatched = outcomes.filter(clutch => clutch.convertedToSnakes);

    outcomesList.innerHTML = active.length
        ? active.map(renderOutcomeCard).join("")
        : `<p class="empty-message">No clutches waiting to hatch.</p>`;

    hatchedList.innerHTML = hatched.length
        ? hatched.map(renderHatchedCard).join("")
        : `<p class="empty-message">No hatched clutches yet.</p>`;

    updateOutcomesStatus();
}

const hashClutchId = decodeURIComponent((window.location.hash.match(/^#clutch-(.+)$/i) || [])[1] || "");

window.saveHatchlings = saveHatchlings;
window.addHatchling = addHatchling;
window.removePreparedHatchling = removePreparedHatchling;
window.previewHatchlingMorph = previewHatchlingMorph;
window.updateClutchField = updateClutchField;
window.addCandling = addCandling;
window.removeCandling = removeCandling;

migrateClutchTokens();
renderBreedingOutcomes();

if (hashClutchId) {
    const targetClutch = clutches.find(item => item.id === hashClutchId);

    if (targetClutch) {
        const card = document.getElementById(`outcomeCard-${targetClutch.clutchToken}`)
            || document.getElementById(`hatchedCard-${targetClutch.clutchToken}`);

        if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }
}
