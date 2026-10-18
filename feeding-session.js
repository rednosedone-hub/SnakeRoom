const snakes = window.SnakeData.loadSnakesWithIds([]);
const selectedSnakeIndexes = new Set();
const pendingFeedingResults = new Map();
const pendingFeedingReasons = new Map();

// Reasons a snake refuses food, shared with the snake form. Ovulation is the
// one that changes the schedule: she comes off the due list until the hold ends.
const REFUSAL_REASONS = window.FEEDING_REFUSAL_REASONS || ["Ovulation"];

const HOLD_REASONS = ["Ovulation"];

function getSnakesDueToFeed(snakes) {
    return snakes
        .map((snake, index) => ({ snake, originalIndex: index }))
        .filter(item => isSnakeDueToFeed(item.snake));
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

function showFeedingReport(message, isError = false) {
    const report = document.getElementById("feedingReport");

    if (!report) {
        return;
    }

    report.textContent = message;
    report.classList.toggle("import-error", isError);
}

// A refusal is a real event but not a meal: the snake stays due, and the row
// says when it last turned food down so it is obvious it was tried.
function getLastRefusal(snake) {
    if (!Array.isArray(snake.feedingHistory)) {
        return null;
    }

    let latest = null;

    snake.feedingHistory.forEach(entry => {
        if (!entry || entry.result !== "Refused") {
            return;
        }

        const date = entry.date || "";

        if (date && (!latest || date >= latest.date)) {
            latest = { date, reason: entry.reason || "" };
        }
    });

    return latest;
}

function updateBulkActionBar() {
    const selectedCount = document.getElementById("selectedCount");
    const bulkFedDateInput = document.getElementById("bulkFedDateInput");

    if (bulkFedDateInput && bulkFedDateInput.value === "") {
        bulkFedDateInput.value = getTodayText();
    }

    if (selectedCount) {
        const count = selectedSnakeIndexes.size;
        selectedCount.textContent = count === 1 ? "1 selected" : `${count} selected`;
    }
}

function updateFeedingResult(index, result) {
    // Held until "Mark Fed" writes the record, so re-renders never wipe a choice.
    pendingFeedingResults.set(index, result);

    // The reason dropdown only applies to a refusal, so reveal it in place
    // rather than re-rendering the whole list and losing other row choices.
    const row = document.querySelector(`#snakeTableWrapper tr[data-row-index="${index}"]`);
    const reasonCell = row ? row.querySelector(".feeding-reason-cell") : null;

    if (reasonCell) {
        reasonCell.style.display = result === "Refused" ? "" : "none";
    }
}

function updateFeedingReason(index, reason) {
    pendingFeedingReasons.set(index, reason);
}

function toggleSnakeSelection(index, isSelected) {
    if (isSelected) {
        selectedSnakeIndexes.add(index);
    } else {
        selectedSnakeIndexes.delete(index);
    }

    updateBulkActionBar();
}

function renderFeedingTable(dueItems) {
    const snakeTableWrapper = document.getElementById("snakeTableWrapper");

    if (!snakeTableWrapper) {
        return;
    }

    snakeTableWrapper.innerHTML = "";

    if (!Array.isArray(dueItems) || dueItems.length === 0) {
        const nextDueText = describeNextDue(snakes);

        snakeTableWrapper.innerHTML = `
            <p class="empty-message">
                No snakes are due to be fed today.
            </p>
            ${nextDueText ? `<p class="empty-message feeding-next-due">${nextDueText}</p>` : ""}
        `;
        updateBulkActionBar();
        return;
    }

    const rows = dueItems.map(item => {
        const snake = item.snake;
        const index = item.originalIndex;
        const feederSize = snake.feederSize || "No feeder size";
        const morphLabel = window.SnakeData.getSnakeIdentityText(snake);
        const lastFedText = snake.lastFed ? snake.lastFed : "No feeding record";
        const pendingResult = pendingFeedingResults.get(index) || "";
        const pendingReason = pendingFeedingReasons.get(index) || "";
        const lastRefusal = getLastRefusal(snake);
        const refusalNote = lastRefusal && lastRefusal.date > (snake.lastFed || "")
            ? `<span class="feeding-refused">Refused ${lastRefusal.date}${lastRefusal.reason ? ` (${lastRefusal.reason})` : ""}</span>`
            : "";

        // The data-label attributes become the visible field names when the
        // table turns into cards on a phone (style.css, max-width: 700px).
        return `
            <tr data-row-index="${index}">
                <td class="feeding-check">
                    <input
                        type="checkbox"
                        aria-label="Select ${snake.name || "snake"}"
                        onchange="toggleSnakeSelection(${index}, this.checked)"
                    >
                </td>
                <td data-label="Name">${snake.name}</td>
                <td data-label="ID">${morphLabel}</td>
                <td data-label="Feeder">${feederSize}</td>
                <td data-label="Last Fed">${lastFedText}${refusalNote}</td>
                <td data-label="Result" class="feeding-result-cell">
                    <select aria-label="Feeding result for ${snake.name || "snake"}" onchange="updateFeedingResult(${index}, this.value)">
                        <option value="" ${pendingResult === "" ? "selected" : ""}>Select</option>
                        <option value="Accepted" ${pendingResult === "Accepted" ? "selected" : ""}>Accepted</option>
                        <option value="Refused" ${pendingResult === "Refused" ? "selected" : ""}>Refused</option>
                        <option value="Regurgitated" ${pendingResult === "Regurgitated" ? "selected" : ""}>Regurgitated</option>
                    </select>
                </td>
                <td data-label="Reason" class="feeding-reason-cell"${pendingResult === "Refused" ? "" : " style=\"display: none\""}>
                    <select aria-label="Refusal reason for ${snake.name || "snake"}" onchange="updateFeedingReason(${index}, this.value)">
                        <option value="">Select reason</option>
                        ${REFUSAL_REASONS.map(reason => `
                            <option value="${reason}" ${pendingReason === reason ? "selected" : ""}>${reason}</option>
                        `).join("")}
                    </select>
                </td>
            </tr>
        `;
    }).join("");

    snakeTableWrapper.innerHTML = `
        <table class="snake-table feeding-table">
            <thead>
                <tr>
                    <th></th>
                    <th>Name</th>
                    <th>ID</th>
                    <th>Feeder</th>
                    <th>Last Fed</th>
                    <th>Result</th>
                    <th>Reason</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;

    updateBulkActionBar();
}

function markSelectedFed() {
    const bulkFedDateInput = document.getElementById("bulkFedDateInput");
    const fedDate = bulkFedDateInput && bulkFedDateInput.value ? bulkFedDateInput.value : getTodayText();

    if (selectedSnakeIndexes.size === 0) {
        alert("Select at least one snake first.");
        return;
    }

    const fedCount = selectedSnakeIndexes.size;
    const resultCounts = {};

    selectedSnakeIndexes.forEach(index => {
        const resultLabel = (pendingFeedingResults.get(index) || "no result").toLowerCase();

        resultCounts[resultLabel] = (resultCounts[resultLabel] || 0) + 1;
    });

    let holdCount = 0;

    selectedSnakeIndexes.forEach(index => {
        if (snakes[index]) {
            const result = pendingFeedingResults.get(index) || "";
            const reason = result === "Refused" ? (pendingFeedingReasons.get(index) || "") : "";

            // A refusal is logged, but it is not a meal: lastFed keeps the date
            // of the last food actually eaten, so the snake stays due.
            if (result !== "Refused") {
                snakes[index].lastFed = fedDate;
            }

            if (!Array.isArray(snakes[index].feedingHistory)) {
                snakes[index].feedingHistory = [];
            }

            // Record which feeder was used, the same shape the snake form
            // writes, so the history reads the same whichever page logged it.
            const entry = {
                date: fedDate,
                feederSize: snakes[index].feederSize || "",
                result
            };

            if (reason) {
                entry.reason = reason;
            }

            snakes[index].feedingHistory.push(entry);

            // Ovulation takes her off the list on purpose instead of leaving
            // her there refusing every week.
            if (HOLD_REASONS.includes(reason)) {
                snakes[index].feedingHold = { reason, since: fedDate };
                holdCount += 1;
            }
        }
    });

    pendingFeedingResults.clear();
    pendingFeedingReasons.clear();
    window.SnakeData.saveStorageArray("snakes", snakes);
    selectedSnakeIndexes.clear();
    const resultDetail = Object.keys(resultCounts)
        .map(label => `${resultCounts[label]} ${label}`)
        .join(", ");
    const refusedCount = resultCounts.refused || 0;
    const acceptedCount = fedCount - refusedCount;
    const stayCount = refusedCount - holdCount;
    const outcomeParts = [];

    if (acceptedCount > 0) {
        outcomeParts.push(`${acceptedCount} drop${acceptedCount === 1 ? "s" : ""} off until the next interval`);
    }

    if (stayCount > 0) {
        outcomeParts.push(`${stayCount} stay${stayCount === 1 ? "s" : ""} on the list with ${stayCount === 1 ? "its" : "their"} refusal date`);
    }

    if (holdCount > 0) {
        outcomeParts.push(`${holdCount} ${holdCount === 1 ? "is" : "are"} now on a feeding hold`);
    }

    refreshFeedingViews();
    showFeedingReport(
        `Logged ${fedCount} snake${fedCount === 1 ? "" : "s"} for ${fedDate}` +
        `${resultDetail ? ` (${resultDetail})` : ""}. ` +
        `${outcomeParts.join("; ")}.`
    );
}

function updateSelectedFeederSizes() {
    if (selectedSnakeIndexes.size === 0) {
        alert("Select at least one snake first.");
        return;
    }

    let updatedCount = 0;

    selectedSnakeIndexes.forEach(index => {
        const snake = snakes[index];

        if (!snake) {
            return;
        }

        const suggestedFeederSize = getSuggestedFeederSize(snake.weight, snake.sex);

        if (suggestedFeederSize) {
            snake.feederSize = suggestedFeederSize;
            updatedCount += 1;
        }
    });

    localStorage.setItem("snakes", JSON.stringify(snakes));
    refreshFeedingViews();
    alert(`${updatedCount} feeder size${updatedCount === 1 ? "" : "s"} updated.`);
}

function clearSelectedSnakes() {
    selectedSnakeIndexes.clear();
    updateBulkActionBar();
}

// ---- Feeding holds ---------------------------------------------------------
//
// A snake on hold is deliberately not due. Ovulation adds one automatically;
// ending the hold puts her back on the normal schedule.

function renderFeedingHolds() {
    const section = document.getElementById("feedingHoldSection");
    const list = document.getElementById("feedingHoldList");

    if (!section || !list) {
        return;
    }

    const held = snakes
        .map((snake, index) => ({ snake, index }))
        .filter(item => window.isOnFeedingHold(item.snake));

    if (held.length === 0) {
        section.style.display = "none";
        list.innerHTML = "";
        return;
    }

    section.style.display = "";
    list.innerHTML = held.map(({ snake, index }) => `
        <div class="feeding-hold-item">
            <div>
                <strong>${snake.name || "Unnamed"}</strong>
                <span class="feeding-hold-detail">
                    ${window.SnakeData.getSnakeIdentityText(snake)} &middot;
                    ${snake.feedingHold.reason} since ${snake.feedingHold.since || "unknown"}
                </span>
            </div>
            <div class="feeding-hold-actions">
                <button type="button" class="gene-action-button" onclick="logFedFromHold(${index})">
                    Fed Today
                </button>
                <button type="button" class="gene-action-button" onclick="endFeedingHold(${index})">
                    End Hold
                </button>
            </div>
        </div>
    `).join("");
}

function endFeedingHold(index) {
    const snake = snakes[index];

    if (!snake || !snake.feedingHold) {
        return;
    }

    delete snake.feedingHold;
    window.SnakeData.saveStorageArray("snakes", snakes);
    refreshFeedingViews();
    showFeedingReport(`${snake.name || "That snake"} is off the feeding hold and back on the normal schedule.`);
}

function logFedFromHold(index) {
    const snake = snakes[index];

    if (!snake) {
        return;
    }

    const fedDate = getTodayText();

    delete snake.feedingHold;
    snake.lastFed = fedDate;

    if (!Array.isArray(snake.feedingHistory)) {
        snake.feedingHistory = [];
    }

    snake.feedingHistory.push({
        date: fedDate,
        feederSize: snake.feederSize || "",
        result: "Accepted"
    });
    window.SnakeData.saveStorageArray("snakes", snakes);
    refreshFeedingViews();
    showFeedingReport(`${snake.name || "That snake"} logged as fed on ${fedDate} and taken off the feeding hold.`);
}

function refreshFeedingViews() {
    renderFeedingTable(getSnakesDueToFeed(snakes));
    renderFeedingHolds();
}

window.toggleSnakeSelection = toggleSnakeSelection;
window.updateFeedingResult = updateFeedingResult;
window.updateFeedingReason = updateFeedingReason;
window.markSelectedFed = markSelectedFed;
window.updateSelectedFeederSizes = updateSelectedFeederSizes;
window.clearSelectedSnakes = clearSelectedSnakes;
window.endFeedingHold = endFeedingHold;
window.logFedFromHold = logFedFromHold;

renderFeedingTable(getSnakesDueToFeed(snakes));
renderFeedingHolds();
