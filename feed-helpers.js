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
    if (!Array.isArray(snakes)) {
        return [];
    }

    return snakes.filter(isSnakeDueToFeed);
}

function getTodayText() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

window.getDaysSince = getDaysSince;
window.getFeedingInterval = getFeedingInterval;
window.isSnakeDueToFeed = isSnakeDueToFeed;
window.getSnakesDueToFeed = getSnakesDueToFeed;
window.getTodayText = getTodayText;
