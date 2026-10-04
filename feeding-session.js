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
        snakeTableWrapper.innerHTML = `
            <p class="empty-message">
                No snakes are due to be fed today.
            </p>
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

        return `
            <tr>
                <td>
                    <input
                        type="checkbox"
                        onchange="toggleSnakeSelection(${index}, this.checked)"
                    >
                </td>
                <td>${snake.name}</td>
                <td>${morphLabel}</td>
                <td>${feederSize}</td>
                <td>${lastFedText}</td>
                <td>
                    <select onchange="updateFeedingResult(${index}, this.value)">
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
        <table class="snake-table">
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

    selectedSnakeIndexes.forEach(index => {
        if (snakes[index]) {
            snakes[index].lastFed = fedDate;
            if (!Array.isArray(snakes[index].feedingHistory)) {
                snakes[index].feedingHistory = [];
            }
            snakes[index].feedingHistory.push({
                date: fedDate,
                result: pendingFeedingResults.get(index) || ""
            });
        }
    });

    pendingFeedingResults.clear();
    window.SnakeData.saveStorageArray("snakes", snakes);
    selectedSnakeIndexes.clear();
    renderFeedingTable(getSnakesDueToFeed(snakes));
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
