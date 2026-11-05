// Breeding Outcomes: turn hatched clutches into real hatchling records.
//
// A clutch is marked hatched when the hatchling records are created here. The
// hatchlings get names, bins, sexes and statuses right away; genes, photos and
// weights get filled in on their profile pages later. The clutch record itself
// stays as history and is listed under Hatched Clutches.

const snakes = window.SnakeData.loadSnakesWithIds([]);
let clutches = window.SnakeData.readStorageArray("clutches", []);
// Deleting a clutch frees its pair again, so the pairs are read here too.
let breedingPairs = window.SnakeData.readStorageArray("breedingPairs", []);

const OUTCOMES_DEFAULT_STATUS = "Hatchling";
const hatchlingPreparation = {};

// New hatchlings get one ID per animal, built from the keeper's prefix and the
// clutch: SS-C26-1-01 for the first hatchling of clutch 2026-01. The prefix is
// remembered on this device; the clutch part is what groups them in ID sort.
// The format itself lives in hatchling-id-helpers.js so it can be tested.
const HATCHLING_ID_PREFIX_KEY = "hatchlingIdPrefix";
const DEFAULT_HATCHLING_ID_PREFIX = "SS";

function hatchlingIds() {
    if (!window.HatchlingIds) {
        throw new Error("hatchling-id-helpers.js is not loaded.");
    }

    return window.HatchlingIds;
}

function getHatchlingIdPrefix() {
    return hatchlingIds().normalizePrefix(localStorage.getItem(HATCHLING_ID_PREFIX_KEY));
}

function setHatchlingIdPrefix(value) {
    const prefix = hatchlingIds().normalizePrefix(value);
    const typed = readPastClutchForm();

    localStorage.setItem(HATCHLING_ID_PREFIX_KEY, prefix);

    const input = document.getElementById("hatchlingIdPrefixInput");

    if (input) {
        input.value = prefix;
    }

    // The next-ID hints on the clutch cards follow the prefix, so re-render
    // them; the past clutch form keeps whatever was already typed.
    renderBreedingOutcomes();
    populatePastClutchSelects(typed);
}

// 2026-01 -> SS-C26-1. A clutch with an imported custom id keeps it readable
// instead of inventing a number.
function getHatchlingIdBase(clutch) {
    return hatchlingIds().baseFor(clutch && clutch.id, getHatchlingIdPrefix());
}

// Continue after the highest suffix already linked to this clutch, so adding a
// late hatchling never reuses SS-C26-1-03.
function getNextHatchlingNumber(clutch) {
    return hatchlingIds().nextNumber(clutch, getHatchlingIdPrefix(), snakes);
}

// ---- Recording a clutch that hatched before it was logged ---------------
// A clutch from before the app, or one whose female has since passed, may only
// be known by its parents and hatch date. That is enough: the laid date and egg
// count are optional, and any hatchling already in the collection whose ID
// carries this clutch's code (SS-C25-1-01 and so on) is linked to it, so lineage,
// the scorecard and Season Review see the family.

function getNextClutchIdForYear(yearText) {
    const year = String(yearText || getTodayText()).slice(0, 4);
    const usedIds = new Set([
        ...clutches.map(clutch => String(clutch.id || "")),
        ...breedingPairs.map(pair => String(pair.clutchId || ""))
    ]);
    let clutchNumber = 1;

    while (usedIds.has(`${year}-${String(clutchNumber).padStart(2, "0")}`)) {
        clutchNumber += 1;
    }

    return `${year}-${String(clutchNumber).padStart(2, "0")}`;
}

function readPastClutchForm() {
    const read = id => {
        const input = document.getElementById(id);

        return input ? input.value : "";
    };

    return {
        femaleSnakeId: read("pastClutchFemaleSelect"),
        maleSnakeId: read("pastClutchMaleSelect"),
        hatchedDate: read("pastClutchHatchDate"),
        laidDate: read("pastClutchLaidDate"),
        eggCount: read("pastClutchEggCount")
    };
}

function populatePastClutchSelects(prefill = {}) {
    const fields = [
        ["pastClutchFemaleSelect", "Female", prefill.femaleSnakeId],
        ["pastClutchMaleSelect", "Male", prefill.maleSnakeId]
    ];

    fields.forEach(([selectId, label, selected]) => {
        const select = document.getElementById(selectId);

        if (!select) {
            return;
        }

        // Deceased and archived parents still belong on a past clutch, so this
        // list is every animal on record rather than only the active ones. An
        // animal with no sex recorded stays selectable for either side.
        const options = [...snakes]
            .filter(snake => !snake.sex || snake.sex === label || snake.sex === "Unknown")
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
            .map(snake => {
                const status = window.SnakeData.isInactiveSnake(snake) && snake.status
                    ? ` (${snake.status})`
                    : "";

                return `<option value="${escapeHtml(snake.id)}">${escapeHtml(`${getSnakeLabelByRef(snake.id)}${status}`)}</option>`;
            })
            .join("");

        select.innerHTML = `<option value="">-- Select ${label} --</option>${options}`;

        if (selected && select.querySelector(`option[value="${CSS.escape(selected)}"]`)) {
            select.value = selected;
        }
    });

    const hatchDate = document.getElementById("pastClutchHatchDate");
    const laidDate = document.getElementById("pastClutchLaidDate");
    const eggCount = document.getElementById("pastClutchEggCount");
    const prefixInput = document.getElementById("hatchlingIdPrefixInput");

    if (hatchDate && prefill.hatchedDate) {
        hatchDate.value = prefill.hatchedDate;
    }

    if (laidDate && prefill.laidDate) {
        laidDate.value = prefill.laidDate;
    }

    if (eggCount && prefill.eggCount) {
        eggCount.value = prefill.eggCount;
    }

    if (prefixInput) {
        prefixInput.value = getHatchlingIdPrefix();
    }
}

function setPastClutchStatus(message) {
    const status = document.getElementById("pastClutchStatus");

    if (status) {
        status.textContent = message;
    }
}

function getLinkableHatchlings(clutch) {
    return hatchlingIds().unlinkedCandidates(
        clutch.id,
        getHatchlingIdPrefix(),
        snakes,
        clutches.map(item => item.id)
    );
}

// Sets the clutch link on every ungrouped animal carrying the clutch code and
// fills in the details it can know from the clutch. Returns the names linked.
function linkHatchlingsToClutch(clutchId) {
    const clutch = clutches.find(item => item.id === clutchId);

    if (!clutch) {
        return [];
    }

    const candidates = getLinkableHatchlings(clutch);

    candidates.forEach(snake => {
        snake.clutchId = clutch.id;
        snake.clutchToken = clutch.clutchToken;
        snake.hatchlingToken = snake.hatchlingToken
            || `th-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

        // Old records sometimes kept the code only in morph; the collection
        // sorts on ID, so put it there too.
        if (!String(snake.ID || "").trim()) {
            snake.ID = String(snake.morph || "").trim();
        }

        if (!snake.hatchedDate && clutch.hatchedDate) {
            snake.hatchedDate = clutch.hatchedDate;
        }

        if (!snake.laidDate && clutch.laidDate) {
            snake.laidDate = clutch.laidDate;
        }

        if (!snake.dam) {
            snake.dam = getSnakeLabelByRef(clutch.femaleSnakeId);
        }

        if (!snake.sire) {
            snake.sire = getSnakeLabelByRef(clutch.maleSnakeId);
        }
    });

    if (candidates.length > 0) {
        clutch.hatchlingCount = Math.max(
            Number(clutch.hatchlingCount) || 0,
            snakes.filter(snake => snake.clutchId === clutch.id).length
        );
        saveSnakes();
        saveClutches();
    }

    return candidates.map(snake => snake.name || `Unnamed ${snake.ID || ""}`.trim());
}

function linkHatchlingsFromCard(token) {
    const clutch = clutches.find(item => item.clutchToken === token);

    if (!clutch) {
        return;
    }

    const candidates = getLinkableHatchlings(clutch);

    if (candidates.length === 0) {
        alert(`No ungrouped animals carry the ${getHatchlingIdBase(clutch)} code.`);
        return;
    }

    const ok = confirm(
        `Link ${candidates.length} animal${candidates.length === 1 ? "" : "s"} to clutch ${clutch.id}?\n\n` +
        candidates.map(snake => `- ${getSnakeLabelByRef(snake.id)}`).join("\n")
    );

    if (!ok) {
        return;
    }

    const names = linkHatchlingsToClutch(clutch.id);

    renderBreedingOutcomes();
    alert(`Linked ${names.length}: ${names.join(", ")}.`);
}

function createPastClutch() {
    const form = readPastClutchForm();

    if (!form.femaleSnakeId || !form.maleSnakeId) {
        alert("Choose both parents for the clutch.");
        return;
    }

    if (form.femaleSnakeId === form.maleSnakeId) {
        alert("A clutch needs two different parents.");
        return;
    }

    if (!form.hatchedDate) {
        alert("Enter the date the eggs hatched.");
        return;
    }

    if (form.laidDate && form.laidDate > form.hatchedDate) {
        alert("The hatch date cannot be before the eggs were laid.");
        return;
    }

    const year = (form.laidDate || form.hatchedDate).slice(0, 4);
    const clutchId = getNextClutchIdForYear(year);
    const clutch = {
        id: clutchId,
        clutchToken: `tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        year,
        femaleSnakeId: form.femaleSnakeId,
        maleSnakeId: form.maleSnakeId,
        pairingDate: "",
        pairings: [],
        ovulationObserved: false,
        ovulationDate: "",
        preLayShedDate: "",
        laidDate: form.laidDate,
        eggCount: Number(form.eggCount) || 0,
        hatchedDate: form.hatchedDate,
        hatchlingCount: 0,
        convertedToSnakes: true,
        historical: true
    };

    clutches.push(clutch);

    // Reuse the pair for this couple so the clutch shows up in pair history
    // instead of creating a second record for the same two animals.
    const existingPair = breedingPairs.find(pair =>
        String(pair.femaleSnakeId || "") === form.femaleSnakeId &&
        String(pair.maleSnakeId || "") === form.maleSnakeId &&
        !pair.clutchId
    );

    if (existingPair) {
        existingPair.clutchId = clutchId;
        window.SnakeData.saveStorageArray("breedingPairs", breedingPairs);
    }

    saveClutches();

    const linked = linkHatchlingsToClutch(clutchId);
    const hatched = document.getElementById("pastClutchHatchDate");
    const laid = document.getElementById("pastClutchLaidDate");
    const eggs = document.getElementById("pastClutchEggCount");

    ["pastClutchFemaleSelect", "pastClutchMaleSelect"].forEach(id => {
        const select = document.getElementById(id);

        if (select) {
            select.value = "";
        }
    });

    if (hatched) {
        hatched.value = "";
    }

    if (laid) {
        laid.value = "";
    }

    if (eggs) {
        eggs.value = "";
    }

    renderBreedingOutcomes();

    setPastClutchStatus(linked.length > 0
        ? `Saved clutch ${clutchId}. Linked ${linked.length} hatchling${linked.length === 1 ? "" : "s"}: ${linked.join(", ")}.`
        : `Saved clutch ${clutchId}. No ungrouped animals carry the ${getHatchlingIdBase(clutch)} code yet; use Link Hatchlings on the clutch if you add them later.`);
}

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

// Parent names on the clutch cards open the animal's profile; the selects and
// status lines keep the plain label.
function getSnakeLinkByRef(reference) {
    const snake = window.SnakeData.getSnakeByReference(snakes, reference);
    const label = getSnakeLabelByRef(reference);

    if (!snake) {
        return escapeHtml(label);
    }

    return `<a class="snake-link" href="${escapeHtml(window.SnakeData.getSnakeProfileUrl(snake))}">${escapeHtml(label)}</a>`;
}

// Offspring read better as names alone, sorted by ID so the clutch stays in the
// order the eggs hatched.
function getOffspringLine(hatchlings) {
    const sorted = [...hatchlings].sort((left, right) => String(left.ID || left.name || "")
        .localeCompare(String(right.ID || right.name || "")));

    return sorted.map(snake => {
        const label = escapeHtml(snake.name || snake.ID || "Unnamed");

        return `<a class="snake-link" href="${escapeHtml(window.SnakeData.getSnakeProfileUrl(snake))}">${label}</a>`;
    }).join(", ");
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

function defaultHatchlingName(index) {
    return `Hatchling ${String(index).padStart(2, "0")}`;
}

// The clutch id is carried by the snake's identity fields, not its name. Names
// stay friendly placeholders the keeper can replace; every hatchling from one
// clutch sorts together because its ID is that clutch.
function buildHatchlingDefaults(clutch, index) {
    return {
        name: defaultHatchlingName(index),
        binNumber: "",
        sex: "Unknown",
        status: OUTCOMES_DEFAULT_STATUS,
        defects: []
    };
}

function prepareHatchlings(clutch) {
    if (!hatchlingPreparation[clutch.clutchToken]) {
        // If the eggs were candled, the fertile count is the honest number of
        // hatchlings to expect: slugs are eggs that never had a snake in them.
        const incubation = incubationTool();
        const count = incubation
            ? incubation.expectedHatchlingCount(clutch)
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

// Default names repeat across clutches (every clutch has a "Hatchling 01"), so
// a taken name gets a numbered suffix instead of the hatchling being dropped.
function getAvailableSnakeName(desiredName) {
    if (!getSnakeByName(desiredName)) {
        return desiredName;
    }

    let attempt = 2;

    while (getSnakeByName(`${desiredName} (${attempt})`)) {
        attempt += 1;
    }

    return `${desiredName} (${attempt})`;
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

// A re-render throws the editor away, so whatever was typed — names, bins,
// sexes, statuses and morphs — is copied back onto the rows first. A row that
// has no inputs yet (just added by a count change) keeps its defaults instead
// of being overwritten with blanks.
function rememberHatchlingEdits() {
    Object.entries(hatchlingPreparation).forEach(([token, rows]) => {
        rows.forEach(row => {
            const suffix = `${token}-${row.index}`;
            const morphSelect = document.getElementById(`hatchMorph-${suffix}`);
            const nameInput = document.getElementById(`hatchName-${suffix}`);
            const binInput = document.getElementById(`hatchBin-${suffix}`);
            const sexSelect = document.getElementById(`hatchSex-${suffix}`);
            const statusSelect = document.getElementById(`hatchStatus-${suffix}`);
            const defects = readHatchlingDefects(token, row.index);

            if (defects) {
                row.defects = defects;
            }

            if (morphSelect) {
                applyMorphChoice(token, row, morphSelect.value);
            }

            if (nameInput) {
                row.name = nameInput.value;
            }

            if (binInput) {
                row.binNumber = binInput.value;
            }

            if (sexSelect) {
                row.sex = sexSelect.value;
            }

            if (statusSelect) {
                row.status = statusSelect.value;
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
        index: row.index,
        name: String(document.getElementById(`hatchName-${token}`).value || "").trim()
            || defaultHatchlingName(row.index),
        binNumber: String(document.getElementById(`hatchBin-${token}`).value || "").trim(),
        sex: document.getElementById(`hatchSex-${token}`).value || "Unknown",
        status: document.getElementById(`hatchStatus-${token}`).value || OUTCOMES_DEFAULT_STATUS,
        genes: Array.isArray(row.genes) ? row.genes : [],
        morphName: outcome ? outcome.morphName : "",
        defects: readHatchlingDefects(clutch.clutchToken, row.index)
            || (Array.isArray(row.defects) ? row.defects : [])
    };
}

function createHatchlingRecord(clutch, row, hatchDate) {
    const stamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    const hatchlingId = `snake-hatch-${stamp}-${random}`;
    const animalId = String(row.hatchlingId || clutch.id || "").trim();

    return {
        id: hatchlingId,
        name: row.name,
        // The form stores the ID in both fields. A new hatchling gets its own
        // SS-C26-1-01 code, whose clutch part sorts the siblings together; the
        // actual morph lives in genes.
        ID: animalId,
        morph: animalId,
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
        defects: Array.isArray(row.defects) ? [...row.defects] : [],
        defectNote: "",
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
    // A card with no date field (a past clutch, or a clutch already hatched)
    // keeps the clutch's own hatch date instead of stamping today on a late
    // hatchling.
    const hatchDate = (hatchDateInput && hatchDateInput.value)
        || clutch.hatchedDate
        || getTodayText();
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

    if (rows.length > 1) {
        // Allow middle inserts, but tell the user when they are using defaults.
        const usesDefaultNames = rows.some(row => row.name === defaultHatchlingName(row.index));

        if (usesDefaultNames) {
            const ok = confirm("Some hatchlings still use default names. Add them anyway?");

            if (!ok) {
                return;
            }
        }
    }

    const idBase = getHatchlingIdBase(clutch);
    let nextAnimalNumber = getNextHatchlingNumber(clutch);
    const renamed = [];

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        // An untouched default follows the animal's ID number, so adding a late
        // hatchling to a clutch gives it Hatchling 04 and SS-C26-1-04 together.
        const desiredName = row.name === defaultHatchlingName(row.index)
            ? defaultHatchlingName(nextAnimalNumber)
            : row.name;
        const nextName = getAvailableSnakeName(desiredName);
        const animalId = `${idBase}-${String(nextAnimalNumber).padStart(2, "0")}`;

        if (nextName !== desiredName) {
            renamed.push(`${desiredName} \u2192 ${nextName}`);
        }

        nextAnimalNumber += 1;
        snakes.push(createHatchlingRecord(
            clutch,
            { ...row, name: nextName, hatchlingId: animalId },
            hatchDate
        ));
    }

    clutch.hatchedDate = clutch.hatchedDate || hatchDate || getTodayText();
    clutch.hatchlingCount = Math.max(clutch.hatchlingCount || 0, existingHatchlings.length + rows.length);
    clutch.convertedToSnakes = true;

    delete hatchlingPreparation[token];

    saveSnakes();
    saveClutches();

    if (renamed.length > 0) {
        alert(`Some names were already taken, so they were saved as: ${renamed.join(", ")}.`);
        return;
    }

    renderBreedingOutcomes();
}

function clampHatchlingCount(value) {
    const count = Math.round(Number(value));

    if (!Number.isFinite(count)) {
        return 0;
    }

    const max = incubationTool() ? incubationTool().MAX_HATCHLINGS : 60;

    return Math.min(max, Math.max(0, count));
}

function syncPreparedHatchlings(clutch, count) {
    const rows = hatchlingPreparation[clutch.clutchToken];

    if (!rows) {
        return;
    }

    while (rows.length > count) {
        rows.pop();
    }

    while (rows.length < count) {
        const index = rows.length + 1;

        rows.push({ index, ...buildHatchlingDefaults(clutch, index) });
    }

    rows.forEach((row, offset) => {
        row.index = offset + 1;
    });
}

// How many hatchlings came out is the keeper's call: one egg can produce twins,
// and a failed egg means fewer snakes than eggs.
function setExpectedHatchlings(token, value) {
    const clutch = clutches.find(item => item.clutchToken === token);

    if (!clutch) {
        return;
    }

    const count = clampHatchlingCount(value);

    clutch.expectedHatchlings = count;
    syncPreparedHatchlings(clutch, count);
    saveClutches();
    renderBreedingOutcomes();
}

function setHatchlingCount(token, value) {
    const clutch = clutches.find(item => item.clutchToken === token);

    if (!clutch) {
        return;
    }

    clutch.hatchlingCount = clampHatchlingCount(value);
    saveClutches();
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

function relatedHatchlings(clutch) {
    return snakes.filter(snake =>
        snake.clutchId === clutch.id &&
        (!snake.clutchToken || snake.clutchToken === clutch.clutchToken)
    );
}

// Deleting a clutch removes the evidence of that laying cycle, so the pair goes
// back to being a plain pairing: the eggs laid date is what puts the female on
// the post-lay hold, and leaving it behind would keep the Not ready badge on a
// female who never actually laid.
function clearPairLayingCycle(pair) {
    pair.eggsLaidDate = "";
    pair.eggCount = 0;
    delete pair.expectedHatchlings;
}

// A converted pair points at its clutch; deleting the clutch must hand the pair
// back to the active list rather than leaving it linked to a missing record.
function releasePair(clutch) {
    let changed = false;

    breedingPairs.forEach(pair => {
        if (pair.clutchId && pair.clutchId === clutch.id) {
            pair.clutchId = "";
            clearPairLayingCycle(pair);
            changed = true;
        }
    });

    if (changed) {
        window.SnakeData.saveStorageArray("breedingPairs", breedingPairs);
    }
}

function deleteClutch(token) {
    const clutch = clutches.find(item => item.clutchToken === token);

    if (!clutch) {
        return;
    }

    const hatchlings = relatedHatchlings(clutch);
    const lines = [
        `Delete clutch ${clutch.id}?`,
        "The clutch record is removed and its pair goes back to the active list.",
        "The laying cycle is cleared too, so the female comes off the post-lay hold and can be paired again.",
        "This cannot be undone."
    ];

    if (hatchlings.length > 0) {
        lines.splice(2, 0, `${hatchlings.length} hatchling record${hatchlings.length === 1 ? "" : "s"} came from this clutch.`);
    }

    if (!confirm(lines.join("\n\n"))) {
        return;
    }

    let removeHatchlings = false;

    if (hatchlings.length > 0) {
        removeHatchlings = confirm(
            `Also delete the ${hatchlings.length} hatchling record${hatchlings.length === 1 ? "" : "s"} from your collection?\n\n` +
            "OK deletes them. Cancel keeps them as animals in the collection."
        );
    }

    clutches = clutches.filter(item => item !== clutch);
    releasePair(clutch);

    if (removeHatchlings) {
        for (let index = snakes.length - 1; index >= 0; index -= 1) {
            if (hatchlings.includes(snakes[index])) {
                snakes.splice(index, 1);
            }
        }

        saveSnakes();
    }

    delete hatchlingPreparation[clutch.clutchToken];
    clutchOutcomeCache[clutch.clutchToken] = null;
    saveClutches();
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
    const incubation = incubationTool();
    const expectedCount = incubation
        ? incubation.expectedHatchlingCount(clutch)
        : Number(clutch.eggCount) || 0;
    const maxHatchlings = incubation ? incubation.MAX_HATCHLINGS : 60;
    const nextId = `${getHatchlingIdBase(clutch)}-${String(getNextHatchlingNumber(clutch)).padStart(2, "0")}`;

    return `
        <div class="breeding-card outcome-card" id="outcomeCard-${token}">
            <div>
                <h4>Clutch ${escapeHtml(clutch.id)}</h4>
                <p class="empty-message">Next hatchling ID: ${escapeHtml(nextId)}</p>
                <p>${getSnakeLinkByRef(clutch.femaleSnakeId)} x ${getSnakeLinkByRef(clutch.maleSnakeId)}</p>
                <p>Laid: ${escapeHtml(clutch.laidDate || "Not recorded")} / ${escapeHtml(formatCount(clutch))}</p>
            </div>

            ${renderIncubationPanel(clutch)}

            <div class="form-grid hatchling-editor-grid">
                <label class="form-field hatch-date-field">
                    <span>Hatch Date</span>
                    <input type="date" id="hatchDate-${token}" value="${escapeHtml(clutch.hatchedDate || getTodayText())}">
                </label>

                <label class="form-field">
                    <span>Hatchlings</span>
                    <input type="number" id="expectedHatchlings-${token}" min="0"
                        max="${maxHatchlings}" step="1" value="${expectedCount}"
                        onchange="setExpectedHatchlings('${token}', this.value)">
                    <small class="empty-message">Twins count as two: one egg, two snakes.</small>
                </label>

                ${rows.map(row => renderHatchlingEditorRow(clutch, row)).join("")}
            </div>

            ${rows.length === 0
                ? `<p class="empty-message">No hatchlings expected. Raise the count if eggs are still due.</p>`
                : ""}

            <div class="card-buttons">
                <button type="button" class="edit-button" onclick="saveHatchlings('${token}')"
                    ${rows.length === 0 ? "disabled" : ""}>
                    Create ${rows.length} Hatchling${rows.length === 1 ? "" : "s"}
                </button>

                <button type="button" class="archive-button" onclick="deleteClutch('${token}')">
                    Delete Clutch
                </button>
            </div>
        </div>
    `;
}

// A deformity is visible on the day the egg pips, which is the only moment a
// keeper fills this row in, so the defects sit right on it. They ride along to
// the snake record and the scorecard counts the hatchling as healthy or not.
function hatchlingDefectBoxes(token, index) {
    return [...document.querySelectorAll(`[id^="hatchDefect-${token}-${index}-"]`)];
}

// Returns null when this row has no defect inputs at all, so a re-render that
// happened before the row was painted cannot wipe a recorded defect.
function readHatchlingDefects(token, index) {
    const boxes = hatchlingDefectBoxes(token, index);

    return boxes.length > 0
        ? boxes.filter(box => box.checked).map(box => box.value)
        : null;
}

function renderHatchlingDefects(token, row) {
    if (!window.SnakeDefects) {
        return "";
    }

    const selected = window.SnakeDefects.keys(row);

    return `
        <div class="hatchling-defects">
            <span class="hatchling-defects-label">Defects</span>
            <div class="hatchling-defect-options">
                ${window.SnakeDefects.DEFECTS.map(defect => `
                    <label class="hatchling-defect-chip" title="${escapeHtml(defect.note)}">
                        <input type="checkbox" id="hatchDefect-${token}-${row.index}-${defect.key}"
                            value="${defect.key}" ${selected.includes(defect.key) ? "checked" : ""}>
                        <span>${escapeHtml(defect.label)}</span>
                    </label>
                `).join("")}
            </div>
            <small class="empty-message">Leave every box clear if the hatchling is clean.</small>
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
                    placeholder="Leave blank to use ${escapeHtml(defaultHatchlingName(row.index))}"
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

            ${renderHatchlingDefects(token, row)}
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
    const twins = stats.eggs > 0 && stats.hatched > stats.eggs;
    const parts = [
        incubated === null ? "" : `Incubated ${incubated} days`,
        clutch.pipDate ? `pipped ${escapeHtml(clutch.pipDate)}` : "",
        stats.eggs > 0
            ? twins
                ? `${stats.hatched} hatchlings from ${stats.eggs} eggs — ${stats.hatched - stats.eggs} more than eggs (twins?)`
                : `${stats.hatched} of ${stats.eggs} egg${stats.eggs === 1 ? "" : "s"} hatched${stats.percent === null ? "" : ` (${stats.percent}%)`}`
            : ""
    ].filter(Boolean);

    if (parts.length === 0) {
        return "";
    }

    return `<p class="empty-message incubation-hatched-line">${parts.join(" · ")}</p>`;
}

function renderHatchedCard(clutch) {
    const related = relatedHatchlings(clutch);
    const relatedCount = related.length;
    const rows = hatchlingPreparation[clutch.clutchToken];
    const linkableCount = getLinkableHatchlings(clutch).length;
    const linkButton = linkableCount > 0
        ? `<button type="button" class="gene-action-button" onclick="linkHatchlingsFromCard('${clutch.clutchToken}')">
                Link ${linkableCount} Hatchling${linkableCount === 1 ? "" : "s"}
            </button>`
        : "";

    return `
        <div class="breeding-card outcome-card hatched-card" id="hatchedCard-${clutch.clutchToken}">
            <div>
                <h4>Clutch ${escapeHtml(clutch.id)}</h4>
                <p>${getSnakeLinkByRef(clutch.femaleSnakeId)} x ${getSnakeLinkByRef(clutch.maleSnakeId)}</p>
                <p>Laid: ${escapeHtml(clutch.laidDate || "Not recorded")} / ${escapeHtml(formatCount(clutch))}</p>
                <p>Hatched: ${escapeHtml(clutch.hatchedDate || "Not recorded")}
                    / Hatchlings: ${clutch.hatchlingCount || 0} (${relatedCount} in collection)</p>
                ${related.length > 0
                    ? `<p class="clutch-offspring"><strong>Hatchlings:</strong> ${getOffspringLine(related)}</p>`
                    : ""}
                ${renderHatchedIncubationLine(clutch)}
            </div>

            <div class="form-grid" style="margin-top:12px;">
                <label class="form-field">
                    <span>Hatchlings</span>
                    <input type="number" min="0" max="${incubationTool() ? incubationTool().MAX_HATCHLINGS : 60}" step="1"
                        id="hatchlingCount-${clutch.clutchToken}"
                        value="${clutch.hatchlingCount || 0}"
                        onchange="setHatchlingCount('${clutch.clutchToken}', this.value)">
                    <small class="empty-message">More than the eggs means twins.</small>
                </label>
            </div>

            ${rows ? `
                <div class="form-grid hatchling-editor-grid">
                    ${rows.map(row => renderHatchlingEditorRow(clutch, row)).join("")}
                </div>

                <div class="card-buttons">
                    <button type="button" class="edit-button" onclick="saveHatchlings('${clutch.clutchToken}')">
                        Add Hatchling
                    </button>

                    ${linkButton}

                    <button type="button" class="archive-button" onclick="deleteClutch('${clutch.clutchToken}')">
                        Delete Clutch
                    </button>
                </div>
            ` : `
                <div class="card-buttons">
                    <button type="button" class="gene-action-button" onclick="addHatchling('${clutch.id}')">
                        Add Hatchling
                    </button>

                    ${linkButton}

                    <button type="button" class="archive-button" onclick="deleteClutch('${clutch.clutchToken}')">
                        Delete Clutch
                    </button>
                </div>
            `}
        </div>
    `;
}

function renderBreedingOutcomes() {
    const outcomesList = document.getElementById("outcomesList");
    const hatchedList = document.getElementById("hatchedList");

    // Keep whatever was typed into the hatchling editor before the lists are
    // rebuilt; the inputs are about to be thrown away.
    rememberHatchlingEdits();

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
window.setExpectedHatchlings = setExpectedHatchlings;
window.setHatchlingCount = setHatchlingCount;
window.deleteClutch = deleteClutch;
window.createPastClutch = createPastClutch;
window.linkHatchlingsFromCard = linkHatchlingsFromCard;
window.setHatchlingIdPrefix = setHatchlingIdPrefix;
window.previewHatchlingMorph = previewHatchlingMorph;
window.updateClutchField = updateClutchField;
window.addCandling = addCandling;
window.removeCandling = removeCandling;

migrateClutchTokens();
populatePastClutchSelects();
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
