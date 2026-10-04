const snakes = window.SnakeData.loadSnakesWithIds([]);
let breedingPairs = window.SnakeData.readStorageArray("breedingPairs", []);
let clutches = window.SnakeData.readStorageArray("clutches", []);

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
    const clutchCountForYear = clutches.filter(clutch => clutch.year === year).length;
    const clutchNumber = String(clutchCountForYear + 1).padStart(2, "0");

    return `${year}-${clutchNumber}`;
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
    renderClutches();
}

function getNextHatchlingId(clutchId, number) {
    return `${clutchId}-${String(number).padStart(2, "0")}`;
}

function convertClutchToSnakes(clutchId) {
    const clutch = clutches.find(item => item.id === clutchId);

    if (!clutch) {
        return;
    }

    if (clutch.convertedToSnakes) {
        alert("This clutch has already been converted to individual snakes.");
        return;
    }

    const hatchDateInput = document.getElementById(`hatchDate-${clutchId}`);
    const hatchCountInput = document.getElementById(`hatchCount-${clutchId}`);
    const hatchDate = hatchDateInput.value;
    const hatchlingCount = Number(hatchCountInput.value) || 0;

    if (!hatchDate || hatchlingCount <= 0) {
        alert("Enter a hatch date and hatchling count first.");
        return;
    }

    for (let index = 1; index <= hatchlingCount; index += 1) {
        const hatchlingId = getNextHatchlingId(clutch.id, index);

        snakes.push({
            name: hatchlingId,
            ID: hatchlingId,
            morph: hatchlingId,
            sex: "Unknown",
            weight: "",
            hatchDate: hatchDate,
            acquiredDate: "",
            lastFed: "",
            feedingIntervalDays: 7,
            feederSize: "",
            status: "Hatchling",
            genes: [],
            feedingHistory: [],
            weightHistory: [],
            shedHistory: [],
            image: "Images/TheSnakeRoom.jpg",
            clutchId: clutch.id,
            dam: getSnakeLabel(clutch.femaleSnakeId || clutch.femaleIndex),
            sire: getSnakeLabel(clutch.maleSnakeId || clutch.maleIndex)
        });
    }

    clutch.hatchedDate = hatchDate;
    clutch.hatchlingCount = hatchlingCount;
    clutch.convertedToSnakes = true;

    saveStorageArray("snakes", snakes);
    saveStorageArray("clutches", clutches);
    renderClutches();
}

function renderBreedingPairs() {
    const list = document.getElementById("breedingPairsList");

    if (breedingPairs.length === 0) {
        list.innerHTML = `<p class="empty-message">No breeding pairs yet.</p>`;
        return;
    }

    list.innerHTML = breedingPairs.map(pair => `
        <div class="breeding-card">
            <div>
                <h4>${getSnakeLabel(pair.femaleSnakeId || pair.femaleIndex)} x ${getSnakeLabel(pair.maleSnakeId || pair.maleIndex)}</h4>
                <p>Status: ${getPairStatus(pair)}</p>
                <p>Pairings: ${getPairings(pair).length || "None recorded"}</p>
            </div>

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
                <button type="button" class="edit-button" onclick="convertPairToClutch('${pair.id}')">
                    Convert To Clutch
                </button>
            </div>
        </div>
    `).join("");
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
                    ? `Converted to ${clutch.hatchlingCount} hatchlings on ${clutch.hatchedDate}`
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
                <button type="button" class="edit-button" onclick="convertClutchToSnakes('${clutch.id}')"
                    ${clutch.convertedToSnakes ? "disabled" : ""}>
                    Convert To Snakes
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
window.convertClutchToSnakes = convertClutchToSnakes;

setupSnakeSelects();
migrateBreedingReferences();
renderBreedingPairs();
renderClutches();
