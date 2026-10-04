function countByValue(items, fieldName, value) {
    return items.filter(item => item[fieldName] === value).length;
}

function setText(id, text) {
    document.getElementById(id).textContent = text;
}

function getDaysSince(dateText) {
    if (!dateText) {
        return null;
    }

    const cleanDateText = String(dateText).trim();
    const dateParts = cleanDateText.split("-").map(Number);

    if (dateParts.length !== 3 || dateParts.some(part => Number.isNaN(part))) {
        return null;
    }

    const today = new Date();
    const todayDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
    );
    const date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const millisecondsPerDay = 1000 * 60 * 60 * 24;

    return Math.floor((todayDate - date) / millisecondsPerDay);
}

function getFeedingInterval(snake) {
    const interval = parseInt(snake.feedingIntervalDays, 10);

    if (Number.isNaN(interval) || interval <= 0) {
        return 7;
    }

    return interval;
}

function isSnakeDueToFeed(snake) {
    const feedingIntervalDays = getFeedingInterval(snake);
    const daysSinceFed = getDaysSince(snake.lastFed);

    if (daysSinceFed === null) {
        return false;
    }

    return daysSinceFed >= feedingIntervalDays;
}

function getSnakesDueToFeed(snakes) {
    return snakes.filter(isSnakeDueToFeed);
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

function renderDashboard() {
    const snakes = window.SnakeData.loadSnakesWithIds(window.SnakeData.defaultSnakes);
    const breedingPairs = window.SnakeData.readStorageArray("breedingPairs", []);
    const clutches = window.SnakeData.readStorageArray("clutches", []);
    const feedingsDue = getSnakesDueToFeed(snakes);

    window.feedingDebug = snakes.map(snake => {
        const daysSinceFed = getDaysSince(snake.lastFed);
        const feedingIntervalDays = getFeedingInterval(snake);

        return {
            name: snake.name,
            lastFed: snake.lastFed,
            daysSinceFed: daysSinceFed,
            feedingIntervalDays: feedingIntervalDays,
            feederSize: snake.feederSize,
            isDue: isSnakeDueToFeed(snake)
        };
    });

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

    if (feedingsDue.length === 0) {
        setText("feedingSummary", "No snakes are due today.");
        document.getElementById("feedingDueList").innerHTML = `
            <p class="empty-message">
                Feeding due dates will appear here after we add feeding records.
            </p>
        `;
        return;
    }

    const feederSummary = getFeederSummary(feedingsDue);

    setText(
        "feedingSummary",
        feederSummary.length > 0
            ? `Need ${feederSummary.join(", ")}`
            : "No snakes are due today."
    );

    document.getElementById("feedingDueList").innerHTML = feedingsDue.map(snake => {
        const daysSinceFed = getDaysSince(snake.lastFed);

        return `
            <div class="dashboard-list-item">
                <strong>${snake.name}</strong>
                <span>${window.SnakeData.getSnakeIdentityText(snake)}</span>
                <span>${snake.feederSize || "No feeder size"}</span>
                <span>Last fed ${daysSinceFed} days ago</span>
            </div>
        `;
    }).join("");
}

renderDashboard();
