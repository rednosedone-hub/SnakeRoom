function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function countByValue(items, fieldName, value) {
    return items.filter(item => item[fieldName] === value).length;
}

function setText(id, text) {
    document.getElementById(id).textContent = text;
}

function getFeederSummary(snakes) {
    const counts = {};

    snakes.forEach(snake => {
        const feederSize = snake.feederSize || "unspecified feeder";
        counts[feederSize] = (counts[feederSize] || 0) + 1;
    });

    return Object.keys(counts)
        .sort()
        .map(feederSize => `${counts[feederSize]} ${feederSize}`);
}

function describeDaysAgo(days) {
    if (days === 0) {
        return "Last fed today";
    }

    return `Last fed ${days} day${days === 1 ? "" : "s"} ago`;
}

// One row per snake, with the reason it is on the list. A snake due in two days
// is here so its feeders can be ordered, not so it can be fed early.
function describeDueTag(status) {
    if (status.state === "due") {
        const overdue = Math.abs(status.daysUntil);

        return overdue === 0
            ? "Due today"
            : `Overdue ${overdue} day${overdue === 1 ? "" : "s"}`;
    }

    return `Due in ${status.daysUntil} day${status.daysUntil === 1 ? "" : "s"} \u00b7 ${window.formatFeedDayText(status.daysUntil)}`;
}

function buildFeedingSummary(dueStatuses, soonStatuses) {
    const dueFeeders = getFeederSummary(dueStatuses.map(status => status.snake)).join(", ");
    const soonFeeders = getFeederSummary(soonStatuses.map(status => status.snake)).join(", ");

    if (dueStatuses.length > 0 && soonStatuses.length > 0) {
        return `Need ${dueFeeders} now. ${soonFeeders} due within ${window.FEEDING_LEAD_DAYS} days.`;
    }

    if (dueStatuses.length > 0) {
        return `Need ${dueFeeders}`;
    }

    if (soonStatuses.length > 0) {
        const lastDay = Math.max(...soonStatuses.map(status => status.daysUntil));

        return `Order ${soonFeeders} \u2014 due by ${window.formatFeedDayText(lastDay)}.`;
    }

    return "";
}

function renderDashboard() {
    const snakes = window.SnakeData.loadSnakesWithIds(window.SnakeData.defaultSnakes);
    const breedingPairs = window.SnakeData.readStorageArray("breedingPairs", []);
    const clutches = window.SnakeData.readStorageArray("clutches", []);
    const allStatuses = snakes.map(snake => window.getFeedingStatus(snake));
    const dueStatuses = allStatuses.filter(status => status.state === "due");
    const soonStatuses = allStatuses.filter(status => status.state === "soon");
    const feedingsDue = dueStatuses.map(status => status.snake);

    window.feedingDebug = allStatuses.map(status => ({
        name: status.snake.name,
        lastFed: status.snake.lastFed,
        daysSinceFed: status.daysSinceFed,
        feedingIntervalDays: status.interval,
        feederSize: status.snake.feederSize,
        state: status.state,
        daysUntil: status.daysUntil,
        dueDate: status.dueDate,
        isDue: status.state === "due"
    }));

    const females = countByValue(snakes, "sex", "Female");
    const males = countByValue(snakes, "sex", "Male");
    const available = countByValue(snakes, "status", "Available");
    const activePlans = breedingPairs.filter(pair => !pair.clutchId).length;
    const activeClutches = clutches.filter(clutch => !clutch.convertedToSnakes).length;
    const convertedClutches = clutches.length - activeClutches;

    setText("totalSnakes", snakes.length);
    setText("activeBreedingPlans", activePlans);
    setText("activeClutches", activeClutches);
    setText("feedingsDue", feedingsDue.length);

    setText("snakeSummary", `${females} females, ${males} males, ${available} available`);
    setText(
        "breedingSummary",
        activePlans === 1
            ? "1 pair not yet converted to a clutch"
            : `${activePlans} pairs not yet converted to clutches`
    );
    setText(
        "clutchSummary",
        activeClutches === 1
            ? `1 clutch waiting to hatch, ${convertedClutches} converted`
            : `${activeClutches} clutches waiting to hatch, ${convertedClutches} converted`
    );

    const feedingSummary = buildFeedingSummary(dueStatuses, soonStatuses) || window.describeNextDue(snakes);

    setText(
        "feedingSummary",
        feedingSummary || "No snakes have a feeding date yet."
    );

    const list = document.getElementById("feedingDueList");

    if (dueStatuses.length === 0 && soonStatuses.length === 0) {
        const nextDueText = window.describeNextDue(snakes);

        list.innerHTML = `
            <p class="empty-message">
                Nothing due in the next ${window.FEEDING_LEAD_DAYS} days.
            </p>
            ${nextDueText ? `<p class="empty-message feeding-next-due">${nextDueText}</p>` : ""}
        `;
        return;
    }

    list.innerHTML = window.getSnakesDueOrComingUp(snakes).map(status => {
        const snake = status.snake;
        const feederSize = snake.feederSize || "No feeder size";
        const lastFed = status.daysSinceFed === null ? "No feeding record" : describeDaysAgo(status.daysSinceFed);
        const tagClass = status.state === "due" ? "is-due" : "is-soon";

        return `
            <div class="dashboard-list-item${status.state === "soon" ? " is-upcoming" : ""}">
                <strong>${snake.name}</strong>
                <span>${window.SnakeData.getSnakeIdentityText(snake)}</span>
                <span>${feederSize}</span>
                <span>${lastFed} <span class="feed-due-tag ${tagClass}">${escapeHtml(describeDueTag(status))}</span></span>
            </div>
        `;
    }).join("");
}

renderDashboard();
