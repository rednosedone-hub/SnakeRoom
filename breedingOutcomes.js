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

function getExpectedHatchDate(layDate) {
    if (!layDate) {
        return "";
    }

    const date = new Date(layDate);
    date.setDate(date.getDate() + 55);

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
        const count = Number(clutch.eggCount) || 0;
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

function readHatchlingRow(clutch, row) {
    const token = `${clutch.clutchToken}-${row.index}`;

    return {
        name: String(document.getElementById(`hatchName-${token}`).value || "").trim(),
        binNumber: String(document.getElementById(`hatchBin-${token}`).value || "").trim(),
        sex: document.getElementById(`hatchSex-${token}`).value || "Unknown",
        status: document.getElementById(`hatchStatus-${token}`).value || OUTCOMES_DEFAULT_STATUS
    };
}

function createHatchlingRecord(clutch, row, hatchDate) {
    const stamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    const hatchlingId = `snake-hatch-${stamp}-${random}`;

    return {
        id: hatchlingId,
        name: row.name,
        // The morph field doubles as the owner-assigned snake ID, so hatchlings
        // start with their clutch number there instead of pairing text.
        ID: row.name,
        morph: row.name,
        sex: row.sex,
        weight: "",
        binNumber: row.binNumber,
        hatchDate: hatchDate || "",
        acquiredDate: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        status: row.status,
        genes: [],
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
    const expectedDate = getExpectedHatchDate(clutch.laidDate);

    return `
        <div class="breeding-card outcome-card">
            <div>
                <h4>Clutch ${escapeHtml(clutch.id)}</h4>
                <p>${escapeHtml(getSnakeLabelByRef(clutch.femaleSnakeId))} x ${escapeHtml(getSnakeLabelByRef(clutch.maleSnakeId))}</p>
                <p>Laid: ${escapeHtml(clutch.laidDate || "Not recorded")} / ${escapeHtml(formatCount(clutch))}</p>
                <p>Hatching. Expected around ${escapeHtml(expectedDate || "soon")}.</p>
            </div>

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
                    ${["Hatchling", "Holdback", "Breeder", "Available", "On Hold"]
                        .map(status => `<option value="${status}" ${status === row.status ? "selected" : ""}>${status}</option>`)
                        .join("")}
                </select>
            </label>
        </div>
    `;
}

function renderHatchedCard(clutch) {
    const relatedCount = snakes.filter(snake => snake.clutchId === clutch.id).length;
    const rows = hatchlingPreparation[clutch.clutchToken];

    return `
        <div class="breeding-card outcome-card hatched-card">
            <div>
                <h4>Clutch ${escapeHtml(clutch.id)}</h4>
                <p>${escapeHtml(getSnakeLabelByRef(clutch.femaleSnakeId))} x ${escapeHtml(getSnakeLabelByRef(clutch.maleSnakeId))}</p>
                <p>Laid: ${escapeHtml(clutch.laidDate || "Not recorded")} / ${escapeHtml(formatCount(clutch))}</p>
                <p>Hatched: ${escapeHtml(clutch.hatchedDate || "Not recorded")}
                    / Hatchlings: ${clutch.hatchlingCount || 0} (${relatedCount} in collection)</p>
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
