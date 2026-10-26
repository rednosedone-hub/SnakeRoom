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
    const element = document.getElementById(id);

    if (element) {
        element.textContent = text;
    }
}

// The home screen earns one money line: net so far, and what the collection is
// eating through. The full ledger lives on the Finances page.
function renderFinanceSummary(snakes) {
    if (!window.SnakeFinance || !document.getElementById("financeNet")) {
        return;
    }

    const expenses = window.SnakeFinance.getExpenses();
    const expos = window.SnakeFinance.getExpos();
    const totals = window.SnakeFinance.summarize(
        window.SnakeFinance.getEvents(snakes, expenses, expos)
    );
    const feeding = window.SnakeFinance.getFeederUsage(
        snakes,
        window.SnakeFinance.getSettings().feederPrices
    );

    setText("financeNet", window.SnakeFinance.formatMoney(totals.net));

    if (totals.revenue === 0 && totals.spend === 0) {
        setText(
            "financeSummary",
            "No money recorded yet. Add purchase prices, feeder orders and show costs."
        );
        return;
    }

    const feedingLine = feeding.total > 0
        ? ` Feed used: ${window.SnakeFinance.formatMoney(feeding.total)}.`
        : "";

    setText(
        "financeSummary",
        `${window.SnakeFinance.formatMoney(totals.revenue)} in, ${window.SnakeFinance.formatMoney(totals.spend)} out.${feedingLine}`
    );
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
    const activeSnakes = snakes.filter(snake => window.SnakeData.isActiveSnake(snake));
    const inactiveCount = snakes.length - activeSnakes.length;
    const retiredCount = snakes.filter(snake => window.SnakeData.isRetiredSnake(snake)).length;
    const soldCount = snakes.filter(snake => String(snake.status || "").trim() === "Sold").length;
    const breedingPairs = window.SnakeData.readStorageArray("breedingPairs", []);
    const clutches = window.SnakeData.readStorageArray("clutches", []);
    const allStatuses = activeSnakes.map(snake => window.getFeedingStatus(snake));
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

    const females = countByValue(activeSnakes, "sex", "Female");
    const males = countByValue(activeSnakes, "sex", "Male");
    const available = countByValue(activeSnakes, "status", "Available");
    const activePlans = breedingPairs.filter(pair => !pair.clutchId).length;
    const activeClutches = clutches.filter(clutch => !clutch.convertedToSnakes).length;
    const convertedClutches = clutches.length - activeClutches;

    renderFinanceSummary(snakes);

    setText("totalSnakes", activeSnakes.length);
    setText("activeBreedingPlans", activePlans);
    setText("activeClutches", activeClutches);
    setText("feedingsDue", feedingsDue.length);

    setText(
        "snakeSummary",
        activeSnakes.length === 0
            ? (inactiveCount > 0
                ? `No active snakes. ${inactiveCount} inactive record${inactiveCount === 1 ? "" : "s"} kept.`
                : "No snakes entered yet.")
            : `${females} females, ${males} males, ${available} available${soldCount > 0 ? ` \u00b7 ${soldCount} sold` : ""}${retiredCount > 0 ? ` \u00b7 ${retiredCount} retired` : ""}`
    );
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

    const feedingSummary = buildFeedingSummary(dueStatuses, soonStatuses) || window.describeNextDue(activeSnakes);

    setText(
        "feedingSummary",
        feedingSummary || (activeSnakes.length === 0
            ? "No active snakes on the feeding schedule."
            : "No snakes have a feeding date yet.")
    );

    const list = document.getElementById("feedingDueList");

    if (dueStatuses.length === 0 && soonStatuses.length === 0) {
        const nextDueText = window.describeNextDue(activeSnakes);

        list.innerHTML = `
            <p class="empty-message">
                ${activeSnakes.length === 0
                    ? "No active snakes on the feeding schedule."
                    : `Nothing due in the next ${window.FEEDING_LEAD_DAYS} days.`}
            </p>
            ${nextDueText ? `<p class="empty-message feeding-next-due">${nextDueText}</p>` : ""}
        `;
        return;
    }

    list.innerHTML = window.getSnakesDueOrComingUp(activeSnakes).map(status => {
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
