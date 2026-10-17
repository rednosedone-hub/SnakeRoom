const snakes = window.SnakeData.loadSnakesWithIds([]);
const selectedSnakeIndexes = new Set();
const pendingFeedingResults = new Map();

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

// What the page says when nothing is due. A bare "nothing due" on feeding day
// looks like the app has lost the collection, so say when the next ones land.
function formatDayText(daysFromToday) {
    const target = new Date();

    target.setDate(target.getDate() + daysFromToday);

    return target.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// A refusal is a real event but not a meal: the snake stays due, and the row
// says when it last turned food down so it is obvious it was tried.
function getLastRefusalDate(snake) {
    if (!Array.isArray(snake.feedingHistory)) {
        return "";
    }

    let latest = "";

    snake.feedingHistory.forEach(entry => {
        if (!entry || entry.result !== "Refused") {
            return;
        }

        const date = entry.date || "";

        if (date && date > latest) {
            latest = date;
        }
    });

    return latest;
}

function describeNextDue(snakes) {
    const waits = [];
    let neverFed = 0;

    snakes.forEach(snake => {
        const daysSinceFed = getDaysSince(snake.lastFed);

        if (daysSinceFed === null) {
            neverFed += 1;
            return;
        }

        const daysUntil = getFeedingInterval(snake) - daysSinceFed;

        if (daysUntil > 0) {
            waits.push(daysUntil);
        }
    });

    if (waits.length === 0) {
        return neverFed > 0
            ? `${neverFed} snake${neverFed === 1 ? " has" : "s have"} no feeding record yet, so ${neverFed === 1 ? "it never shows" : "they never show"} as due. Set a last fed date on those to schedule them.`
            : "";
    }

    const soonest = Math.min(...waits);
    const count = waits.filter(days => days === soonest).length;
    const when = soonest === 1 ? "tomorrow" : `in ${soonest} days`;
    const neverFedNote = neverFed > 0
        ? ` ${neverFed} snake${neverFed === 1 ? " has" : "s have"} no feeding record, so ${neverFed === 1 ? "it is" : "they are"} not scheduled.`
        : "";

    return `Next due ${formatDayText(soonest)} (${when}): ${count} snake${count === 1 ? "" : "s"}.${neverFedNote}`;
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
        const refusalDate = getLastRefusalDate(snake);
        const refusalNote = refusalDate && refusalDate > (snake.lastFed || "")
            ? `<span class="feeding-refused">Refused ${refusalDate}</span>`
            : "";

        // The data-label attributes become the visible field names when the
        // table turns into cards on a phone (style.css, max-width: 700px).
        return `
            <tr>
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

    selectedSnakeIndexes.forEach(index => {
        if (snakes[index]) {
            const result = pendingFeedingResults.get(index) || "";

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
            snakes[index].feedingHistory.push({
                date: fedDate,
                feederSize: snakes[index].feederSize || "",
                result
            });
        }
    });

    pendingFeedingResults.clear();
    window.SnakeData.saveStorageArray("snakes", snakes);
    selectedSnakeIndexes.clear();
    const resultDetail = Object.keys(resultCounts)
        .map(label => `${resultCounts[label]} ${label}`)
        .join(", ");
    const refusedCount = resultCounts.refused || 0;
    const acceptedCount = fedCount - refusedCount;
    const outcomeParts = [];

    if (acceptedCount > 0) {
        outcomeParts.push(`${acceptedCount} drop${acceptedCount === 1 ? "s" : ""} off until the next interval`);
    }

    if (refusedCount > 0) {
        outcomeParts.push(`${refusedCount} stay${refusedCount === 1 ? "s" : ""} on the list with ${refusedCount === 1 ? "its" : "their"} refusal date`);
    }

    renderFeedingTable(getSnakesDueToFeed(snakes));
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
    renderFeedingTable(getSnakesDueToFeed(snakes));
    alert(`${updatedCount} feeder size${updatedCount === 1 ? "" : "s"} updated.`);
}

function clearSelectedSnakes() {
    selectedSnakeIndexes.clear();
    updateBulkActionBar();
}

window.toggleSnakeSelection = toggleSnakeSelection;
window.updateFeedingResult = updateFeedingResult;
window.markSelectedFed = markSelectedFed;
window.updateSelectedFeederSizes = updateSelectedFeederSizes;
window.clearSelectedSnakes = clearSelectedSnakes;

const dueSnakes = getSnakesDueToFeed(snakes);
renderFeedingTable(dueSnakes);
