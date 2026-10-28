const snakes = window.SnakeData.loadSnakesWithIds([]);
let breedingPairs = window.SnakeData.readStorageArray("breedingPairs", []);
let clutches = window.SnakeData.readStorageArray("clutches", []);
let pendingClosePairId = "";

function migrateBreedingReferences() {
    let changedPairs = false;
    let changedClutches = false;

    breedingPairs = breedingPairs.map(pair => {
        const femaleSnakeId = pair.femaleSnakeId || snakes[pair.femaleIndex]?.id || "";
        const maleSnakeId = pair.maleSnakeId || snakes[pair.maleIndex]?.id || "";

        if (femaleSnakeId !== pair.femaleSnakeId || maleSnakeId !== pair.maleSnakeId) {
            changedPairs = true;
            return {
                ...pair,
                femaleSnakeId,
                maleSnakeId
            };
        }

        return pair;
    });

    clutches = clutches.map(clutch => {
        const femaleSnakeId = clutch.femaleSnakeId || snakes[clutch.femaleIndex]?.id || "";
        const maleSnakeId = clutch.maleSnakeId || snakes[clutch.maleIndex]?.id || "";

        if (femaleSnakeId !== clutch.femaleSnakeId || maleSnakeId !== clutch.maleSnakeId) {
            changedClutches = true;
            return {
                ...clutch,
                femaleSnakeId,
                maleSnakeId
            };
        }

        return clutch;
    });

    if (changedPairs) {
        saveStorageArray("breedingPairs", breedingPairs);
    }

    if (changedClutches) {
        saveStorageArray("clutches", clutches);
    }
}

function ensureClutchTokens() {
    let changed = false;

    clutches.forEach(clutch => {
        if (!clutch.clutchToken) {
            clutch.clutchToken = `tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
            changed = true;
        }
    });

    if (changed) {
        saveStorageArray("clutches", clutches);
    }
}

function saveStorageArray(key, items) {
    window.SnakeData.saveStorageArray(key, items);
}

function getTodayText() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getSnakeLabel(index) {
    return window.SnakeData.getSnakeLabelByReference(snakes, index);
}

function getExpectedHatchDate(layDate) {
    if (!layDate) {
        return "";
    }

    const date = new Date(layDate);
    date.setDate(date.getDate() + 55);

    return date.toISOString().split("T")[0];
}

function formatDate(dateText) {
    if (!dateText) {
        return "Not recorded";
    }

    return new Date(dateText).toLocaleDateString();
}

function getSnakeOptions(sex, selectId) {
    const select = document.getElementById(selectId);
    const previousValue = select ? select.value : "";
    const options = snakes
        .map((snake, index) => ({ snake, index }))
        .filter(item => window.SnakeData.isActiveSnake(item.snake))
        .filter(item => item.snake.sex === sex || item.snake.sex === "Unknown")
        .map(item => `
            <option value="${item.snake.id}">
                ${getSnakeLabel(item.snake.id)}
            </option>
        `)
        .join("");

    select.innerHTML = `<option value="">-- Select ${sex} --</option>${options}`;

    if (previousValue && select.querySelector(`option[value="${CSS.escape(previousValue)}"]`)) {
        select.value = previousValue;
    }
}

function setupSnakeSelects() {
    getSnakeOptions("Female", "femaleSelect");
    getSnakeOptions("Male", "maleSelect");
    document.getElementById("pairingDateInput").value = getTodayText();
}

function getPairings(pair) {
    if (Array.isArray(pair.pairings)) {
        return pair.pairings;
    }

    if (pair.pairingDate) {
        return [{ date: pair.pairingDate }];
    }

    return [];
}

function getPairStatus(pair) {
    if (pair.clutchId) {
        return `Converted to ${pair.clutchId}`;
    }

    if (pair.eggsLaidDate) {
        return "Eggs laid";
    }

    if (pair.ovulationObserved || pair.ovulationDate) {
        return "Ovulated";
    }

    return "Paired";
}

function escapePairText(value) {
    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getPairParentSnake(reference, fallbackIndex) {
    const directMatch = window.SnakeData.getSnakeByReference(snakes, reference);
    const hasFallback = fallbackIndex !== null
        && fallbackIndex !== undefined
        && fallbackIndex !== ""
        && Number.isInteger(Number(fallbackIndex));

    return directMatch || (hasFallback ? snakes[Number(fallbackIndex)] || null : null);
}

function describeLineageEvent(event) {
    if (!event) {
        return "";
    }

    if (event.type === "proposed") {
        return `${event.female?.name || "Female"} × ${event.male?.name || "Male"} (${event.label.toLowerCase()})`;
    }

    const parents = (event.parents || []).map(snake => snake?.name || "Unnamed").join(" × ");

    return `${event.child?.name || "An ancestor"} came from ${parents} (${event.label.toLowerCase()})`;
}

function getLineageNotice(female, male) {
    if (!female || !male || !window.SnakeLineage) {
        return null;
    }

    const result = window.SnakeLineage.findCloseBreedings(female, male, snakes);

    if (!result.count) {
        return null;
    }

    const details = result.events.slice(0, 3).map(describeLineageEvent).filter(Boolean);
    const heading = result.multiple
        ? `Multiple close breedings in this pedigree (${result.count})`
        : "Close breeding in this pedigree";

    return {
        count: result.count,
        multiple: result.multiple,
        html: `
            <p class="pair-warning">
                <strong>${escapePairText(heading)}.</strong>
                ${escapePairText(details.join("; "))}${result.count > 3 ? ` and ${result.count - 3} more` : ""}.
                This is a notice, not a block: parent-offspring and sibling pairings are
                still available for proving out recessives.
            </p>
        `
    };
}

function getPairHealthNotices(female, male) {
    if (!window.SnakeHealth) {
        return [];
    }

    return [female, male]
        .filter(Boolean)
        .map(snake => ({ snake, quarantine: window.SnakeHealth.getQuarantineStatus(snake) }))
        .filter(item => item.quarantine.active)
        .map(item => `
            <p class="pair-warning">
                <strong>${escapePairText(item.snake.name || "A parent")} is in quarantine.</strong>
                ${escapePairText(item.quarantine.label)}${item.quarantine.end ? ` (expected release ${escapePairText(item.quarantine.end)})` : ""}.
            </p>
        `);
}

function renderPairCheck() {
    const container = document.getElementById("lineageWarning");

    if (!container) {
        return;
    }

    const female = getPairParentSnake(document.getElementById("femaleSelect").value, null);
    const male = getPairParentSnake(document.getElementById("maleSelect").value, null);
    const notices = [...getPairHealthNotices(female, male)];
    const lineage = getLineageNotice(female, male);

    if (lineage) {
        notices.unshift(lineage.html);
    }

    container.hidden = notices.length === 0;
    container.innerHTML = notices.join("");
}

function getPairNotices(pair) {
    const female = getPairParentSnake(pair.femaleSnakeId, pair.femaleIndex);
    const male = getPairParentSnake(pair.maleSnakeId, pair.maleIndex);
    const notices = [...getPairHealthNotices(female, male)];
    const lineage = getLineageNotice(female, male);

    if (lineage) {
        notices.unshift(lineage.html);
    }

    return notices.join("");
}

function saveBreedingPair() {
    const femaleSnakeId = document.getElementById("femaleSelect").value;
    const maleSnakeId = document.getElementById("maleSelect").value;

    if (femaleSnakeId === "" || maleSnakeId === "") {
        alert("Choose both a female and a male.");
        return;
    }

    const female = window.SnakeData.getSnakeByReference(snakes, femaleSnakeId);
    const male = window.SnakeData.getSnakeByReference(snakes, maleSnakeId);

    breedingPairs.push({
        id: `pair-${Date.now()}`,
        femaleSnakeId: female?.id || femaleSnakeId,
        maleSnakeId: male?.id || maleSnakeId,
        pairingDate: document.getElementById("pairingDateInput").value,
        pairings: document.getElementById("pairingDateInput").value
            ? [{ date: document.getElementById("pairingDateInput").value }]
            : [],
        ovulationObserved: Boolean(document.getElementById("ovulationObservedInput").checked),
        ovulationDate: document.getElementById("ovulationDateInput").value,
        preLayShedDate: document.getElementById("preLayShedDateInput").value,
        eggsLaidDate: document.getElementById("eggsLaidDateInput").value,
        eggCount: Number(document.getElementById("eggCountInput").value) || 0,
        clutchId: ""
    });

    saveStorageArray("breedingPairs", breedingPairs);
    clearPairForm();
    renderBreedingPairs();
}

function clearPairForm() {
    document.getElementById("femaleSelect").value = "";
    document.getElementById("maleSelect").value = "";
    document.getElementById("pairingDateInput").value = getTodayText();
    document.getElementById("ovulationObservedInput").checked = false;
    document.getElementById("ovulationDateInput").value = "";
    document.getElementById("preLayShedDateInput").value = "";
    document.getElementById("eggsLaidDateInput").value = "";
    document.getElementById("eggCountInput").value = "";
    renderPairCheck();
}

function updatePairField(pairId, fieldName, value) {
    const pair = breedingPairs.find(item => item.id === pairId);

    if (!pair) {
        return;
    }

    if (fieldName === "eggCount") {
        pair[fieldName] = Number(value) || 0;
    } else if (fieldName === "ovulationObserved") {
        pair[fieldName] = Boolean(value);
    } else {
        pair[fieldName] = value;
    }
    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
}

function addPairingDate(pairId) {
    const pair = breedingPairs.find(item => item.id === pairId);
    const input = document.getElementById(`pairingDate-${pairId}`);

    if (!pair || !input || !input.value) {
        alert("Enter a pairing date first.");
        return;
    }

    pair.pairings = getPairings(pair);
    pair.pairings.push({ date: input.value });
    pair.pairings.sort((a, b) => new Date(a.date) - new Date(b.date));
    pair.pairingDate = pair.pairings[0]?.date || "";

    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
}

function removePairingDate(pairId, pairingIndex) {
    const pair = breedingPairs.find(item => item.id === pairId);

    if (!pair) {
        return;
    }

    pair.pairings = getPairings(pair);
    pair.pairings.splice(pairingIndex, 1);
    pair.pairingDate = pair.pairings[0]?.date || "";

    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
}

function getNextClutchId(laidDate) {
    const year = (laidDate || getTodayText()).slice(0, 4);
    const usedIds = new Set([
        ...clutches.map(clutch => String(clutch.id || "")),
        ...breedingPairs.map(pair => String(pair.clutchId || ""))
    ]);
    let clutchNumber = 1;
    let clutchId = `${year}-${String(clutchNumber).padStart(2, "0")}`;

    // Count-based numbering can collide when an older clutch has no year field
    // (or a record was imported). Advance to the first unused id instead.
    while (usedIds.has(clutchId)) {
        clutchNumber += 1;
        clutchId = `${year}-${String(clutchNumber).padStart(2, "0")}`;
    }

    return clutchId;
}

function openClosePairModal(pairId) {
    const pair = breedingPairs.find(item => item.id === pairId);
    const modal = document.getElementById("closePairModal");
    const text = document.getElementById("closePairModalText");
    const reason = document.getElementById("closePairReasonInput");

    if (!pair || !modal || !text || !reason) {
        return;
    }

    const retiredParentText = describeRetiredParents(pair);

    pendingClosePairId = pairId;
    text.textContent = `${getSnakeLabel(pair.femaleSnakeId || pair.femaleIndex)} x ${getSnakeLabel(pair.maleSnakeId || pair.maleIndex)}${retiredParentText ? ` \u2014 retired parent: ${retiredParentText}.` : ""}`;
    reason.value = "";
    modal.style.display = "block";
    reason.focus();
}

function closeClosePairModal() {
    const modal = document.getElementById("closePairModal");

    pendingClosePairId = "";

    if (modal) {
        modal.style.display = "none";
    }
}

function confirmClosePair() {
    const pairId = pendingClosePairId;
    const reason = document.getElementById("closePairReasonInput");
    const reasonText = reason ? reason.value.trim() : "";

    closeClosePairModal();

    if (pairId) {
        closePair(pairId, reasonText);
    }
}

function closePair(pairId, reason = "") {
    const pair = breedingPairs.find(item => item.id === pairId);

    if (!pair || pair.clutchId || pair.closedAt) {
        return;
    }

    const retiredParentText = describeRetiredParents(pair);
    const typedReason = String(reason || "").trim();

    pair.closedAt = getTodayText();
    pair.closedReason = typedReason
        || (retiredParentText ? `Retired parent: ${retiredParentText}` : "Closed manually");
    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
    renderPairHistory();
}

function reopenPair(pairId) {
    const pair = breedingPairs.find(item => item.id === pairId);

    if (!pair || pair.clutchId) {
        return;
    }

    pair.closedAt = "";
    pair.closedReason = "";
    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
    renderPairHistory();
}

function convertPairToClutch(pairId) {
    const pair = breedingPairs.find(item => item.id === pairId);

    if (!pair) {
        return;
    }

    if (!pair.eggsLaidDate) {
        alert("Enter an eggs laid date before converting to a clutch.");
        return;
    }

    if (pair.clutchId) {
        alert("This pair has already been converted to a clutch.");
        return;
    }

    const clutchId = getNextClutchId(pair.eggsLaidDate);

    clutches.push({
        id: clutchId,
        clutchToken: `tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        year: pair.eggsLaidDate.slice(0, 4),
        femaleSnakeId: pair.femaleSnakeId || "",
        maleSnakeId: pair.maleSnakeId || "",
        pairingDate: pair.pairingDate,
        pairings: getPairings(pair),
        ovulationObserved: Boolean(pair.ovulationObserved),
        ovulationDate: pair.ovulationDate,
        preLayShedDate: pair.preLayShedDate || "",
        laidDate: pair.eggsLaidDate,
        eggCount: pair.eggCount,
        hatchedDate: "",
        hatchlingCount: 0,
        convertedToSnakes: false
    });

    pair.clutchId = clutchId;
    saveStorageArray("clutches", clutches);
    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
    renderPairHistory();
    renderClutches();
}

function goToBreedingOutcomes(clutchId) {
    window.location.href = `breedingOutcomes.html#clutch-${encodeURIComponent(clutchId)}`;
}

function getRetiredParents(pair) {
    return [
        window.SnakeData.getSnakeByReference(snakes, pair.femaleSnakeId || pair.femaleIndex),
        window.SnakeData.getSnakeByReference(snakes, pair.maleSnakeId || pair.maleIndex)
    ].filter(snake => snake && window.SnakeData.isRetiredSnake(snake));
}

function describeRetiredParents(pair) {
    return getRetiredParents(pair)
        .map(snake => `${snake.name || "Unnamed"} (${snake.status})`)
        .join(" and ");
}

function renderBreedingPairs() {
    const list = document.getElementById("breedingPairsList");
    const activePairs = breedingPairs.filter(pair => !pair.clutchId && !pair.closedAt);
    const convertedCount = breedingPairs.filter(pair => pair.clutchId).length;
    const closedCount = breedingPairs.filter(pair => !pair.clutchId && pair.closedAt).length;
    const historyNote = [
        convertedCount > 0
            ? `${convertedCount} converted pair${convertedCount === 1 ? "" : "s"} kept under Clutches`
            : "",
        closedCount > 0
            ? `${closedCount} closed pair${closedCount === 1 ? "" : "s"} kept under Pair History`
            : ""
    ].filter(Boolean).join(" \u00b7 ");

    if (activePairs.length === 0) {
        list.innerHTML = `<p class="empty-message">No active breeding pairs.${historyNote ? ` ${historyNote}.` : ""}</p>`;
        return;
    }

    const historyHtml = historyNote
        ? `<p class="empty-message">${historyNote}.</p>`
        : "";

    list.innerHTML = historyHtml + activePairs.map(pair => {
        const retiredParentText = describeRetiredParents(pair);

        return `
        <div class="breeding-card">
            <div>
                <h4>${getSnakeLabel(pair.femaleSnakeId || pair.femaleIndex)} x ${getSnakeLabel(pair.maleSnakeId || pair.maleIndex)}</h4>
                <p>Status: ${getPairStatus(pair)}</p>
                <p>Pairings: ${getPairings(pair).length || "None recorded"}</p>
            </div>

            ${retiredParentText ? `
                <p class="pair-warning">
                    <strong>Retired parent:</strong> ${retiredParentText}. This pair is still
                    active; close it when it should leave the breeding list.
                </p>
            ` : ""}

            ${getPairNotices(pair)}

            <div class="breeding-event-list">
                ${getPairings(pair).length
                    ? getPairings(pair).map((pairing, index) => `
                        <div class="breeding-event-item">
                            <span>${pairing.date}</span>
                            <button type="button" class="gene-action-button"
                                onclick="removePairingDate('${pair.id}', ${index})">
                                Remove
                            </button>
                        </div>
                    `).join("")
                    : `<p class="empty-message">No pairing dates recorded.</p>`}
            </div>

            <div class="form-grid">
                <label class="form-field">
                    <span>Add Pairing Date</span>
                    <input type="date" id="pairingDate-${pair.id}">
                </label>

                <div class="form-field">
                    <span>&nbsp;</span>
                    <button type="button" class="gene-action-button" 
                        onclick="addPairingDate('${pair.id}')">
                        Add Pairing
                    </button>
                </div>

                <label class="form-field checkbox-field">
                    <span>Ovulation Observed</span>
                    <input type="checkbox" ${pair.ovulationObserved ? "checked" : ""}
                        onchange="updatePairField('${pair.id}', 'ovulationObserved', this.checked)">
                </label>

                <label class="form-field">
                    <span>Ovulation Date</span>
                    <input type="date" value="${pair.ovulationDate || ""}"
                        onchange="updatePairField('${pair.id}', 'ovulationDate', this.value)">
                </label>

                <label class="form-field">
                    <span>Pre-Lay Shed</span>
                    <input type="date" value="${pair.preLayShedDate || ""}"
                        onchange="updatePairField('${pair.id}', 'preLayShedDate', this.value)">
                </label>

                <label class="form-field">
                    <span>Eggs Laid</span>
                    <input type="date" value="${pair.eggsLaidDate || ""}"
                        onchange="updatePairField('${pair.id}', 'eggsLaidDate', this.value)">
                </label>

                <label class="form-field">
                    <span>Egg Count</span>
                    <input type="number" min="0" value="${pair.eggCount || ""}"
                        onchange="updatePairField('${pair.id}', 'eggCount', this.value)">
                </label>
            </div>

            <div class="card-buttons">
                <button type="button" class="archive-button" onclick="openClosePairModal('${pair.id}')">
                    Close Pair
                </button>

                <button type="button" class="edit-button" onclick="convertPairToClutch('${pair.id}')">
                    Convert To Clutch
                </button>
            </div>
        </div>
    `;
    }).join("");
}

function renderPairHistory() {
    const list = document.getElementById("pairHistoryList");

    if (!list) {
        return;
    }

    const closedPairs = breedingPairs.filter(pair => !pair.clutchId && pair.closedAt);

    if (closedPairs.length === 0) {
        list.innerHTML = `<p class="empty-message">No closed pairs yet.</p>`;
        return;
    }

    list.innerHTML = closedPairs.map(pair => {
        const retiredParentText = describeRetiredParents(pair);

        return `
            <div class="breeding-card closed-pair-card">
                <div>
                    <h4>${getSnakeLabel(pair.femaleSnakeId || pair.femaleIndex)} x ${getSnakeLabel(pair.maleSnakeId || pair.maleIndex)}</h4>
                    <p>Status: Closed${pair.closedAt ? ` on ${pair.closedAt}` : ""}</p>
                    <p>Reason: ${pair.closedReason || "Not recorded"}</p>
                    <p>Pairings: ${getPairings(pair).length || "None recorded"}</p>

                    ${retiredParentText ? `
                        <p class="pair-warning"><strong>Retired parent:</strong> ${retiredParentText}.</p>
                    ` : ""}
                </div>

                <div class="card-buttons">
                    <button type="button" class="edit-button" onclick="reopenPair('${pair.id}')">
                        Reopen Pair
                    </button>

                    ${pair.eggsLaidDate ? `
                        <button type="button" class="archive-button" onclick="convertPairToClutch('${pair.id}')">
                            Convert To Clutch
                        </button>
                    ` : ""}
                </div>
            </div>
        `;
    }).join("");
}

function renderClutches() {
    const list = document.getElementById("clutchList");

    if (clutches.length === 0) {
        list.innerHTML = `<p class="empty-message">No clutches yet.</p>`;
        return;
    }

    list.innerHTML = clutches.map(clutch => `
        <div class="breeding-card">
            <div>
                <h4>${clutch.id}</h4>
                <p>${getSnakeLabel(clutch.femaleSnakeId || clutch.femaleIndex)} x ${getSnakeLabel(clutch.maleSnakeId || clutch.maleIndex)}</p>
                <p>Pairings: ${Array.isArray(clutch.pairings) ? clutch.pairings.map(pairing => pairing.date).join(", ") : clutch.pairingDate || "Not recorded"}</p>
                <p>Ovulation: ${clutch.ovulationObserved ? "Observed" : "Not marked"}${clutch.ovulationDate ? ` on ${clutch.ovulationDate}` : ""}</p>
                <p>Pre-lay shed: ${clutch.preLayShedDate || "Not recorded"}</p>
                <p>Laid: ${clutch.laidDate || "Not recorded"} / Eggs: ${clutch.eggCount || 0}</p>
                <p>${clutch.convertedToSnakes
                    ? `Hatched ${clutch.hatchlingCount || 0} hatchlings on ${clutch.hatchedDate || "not recorded"}. Record kept as history.`
                    : clutch.laidDate
                        ? `Waiting to hatch. Expected around ${getExpectedHatchDate(clutch.laidDate)}`
                        : "Waiting to hatch"}</p>
            </div>

            <div class="form-grid">
                <label class="form-field">
                    <span>Hatch Date</span>
                    <input type="date" id="hatchDate-${clutch.id}" value="${clutch.hatchedDate || ""}"
                        ${clutch.convertedToSnakes ? "disabled" : ""}>
                </label>

                <label class="form-field">
                    <span>Hatchling Count</span>
                    <input type="number" min="0" id="hatchCount-${clutch.id}"
                        value="${clutch.hatchlingCount || clutch.eggCount || ""}"
                        ${clutch.convertedToSnakes ? "disabled" : ""}>
                </label>
            </div>

            <div class="card-buttons">
                <button type="button" class="edit-button" onclick="goToBreedingOutcomes('${clutch.id}')">
                    ${clutch.convertedToSnakes ? "View Outcomes" : "Record Hatch"}
                </button>
            </div>
        </div>
    `).join("");
}

window.saveBreedingPair = saveBreedingPair;
window.updatePairField = updatePairField;
window.addPairingDate = addPairingDate;
window.removePairingDate = removePairingDate;
window.convertPairToClutch = convertPairToClutch;
window.closePair = closePair;
window.openClosePairModal = openClosePairModal;
window.closeClosePairModal = closeClosePairModal;
window.confirmClosePair = confirmClosePair;
window.reopenPair = reopenPair;
window.goToBreedingOutcomes = goToBreedingOutcomes;

const closePairModal = document.getElementById("closePairModal");

if (closePairModal) {
    closePairModal.addEventListener("click", event => {
        if (event.target === closePairModal) {
            closeClosePairModal();
        }
    });
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeClosePairModal();
    }
});

setupSnakeSelects();
migrateBreedingReferences();
ensureClutchTokens();

["femaleSelect", "maleSelect"].forEach(id => {
    const select = document.getElementById(id);
    if (select) select.addEventListener("change", renderPairCheck);
});

renderPairCheck();
renderBreedingPairs();
renderPairHistory();
renderClutches();
