// Shared by the feeding session and the snake form so both offer the same
// reasons. Only Ovulation changes the schedule (it is a feeding hold).
const FEEDING_REFUSAL_REASONS = [
    "Ovulation",
    "In shed",
    "Gravid / pre-lay",
    "Not hungry",
    "Stress / new arrival",
    "Temperatures",
    "Other"
];

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

// A feeding hold is a deliberate pause (ovulation, for example) rather than a
// scheduling side effect: the snake is not due until the hold is ended, no
// matter how long ago it last ate.
function isOnFeedingHold(snake) {
    return Boolean(snake && snake.feedingHold && snake.feedingHold.reason);
}

function isSnakeDueToFeed(snake) {
    if (isOnFeedingHold(snake)) {
        return false;
    }

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

window.FEEDING_REFUSAL_REASONS = FEEDING_REFUSAL_REASONS;
window.getDaysSince = getDaysSince;
window.getFeedingInterval = getFeedingInterval;
window.isOnFeedingHold = isOnFeedingHold;
window.isSnakeDueToFeed = isSnakeDueToFeed;
window.getSnakesDueToFeed = getSnakesDueToFeed;
window.getTodayText = getTodayText;
