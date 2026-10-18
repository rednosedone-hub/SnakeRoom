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

// Feeders have to be ordered before the snakes need them, so the dashboard
// starts showing a snake this many days ahead of its due date.
const FEEDING_LEAD_DAYS = 3;

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

// Where a snake sits relative to its next meal:
//   due         - due today or overdue
//   soon        - due within FEEDING_LEAD_DAYS (the ordering window)
//   scheduled   - further out
//   hold        - deliberately paused, so never due
//   unscheduled - no last-fed date to count from
function getFeedingStatus(snake) {
    const interval = getFeedingInterval(snake);
    const daysSinceFed = getDaysSince(snake.lastFed);
    const base = { snake, interval, daysSinceFed, daysUntil: null, dueDate: null };

    if (isOnFeedingHold(snake)) {
        return { ...base, state: "hold" };
    }

    if (daysSinceFed === null) {
        return { ...base, state: "unscheduled" };
    }

    const daysUntil = interval - daysSinceFed;

    return {
        ...base,
        daysUntil,
        dueDate: shiftDateText(daysUntil),
        state: daysUntil <= 0 ? "due" : daysUntil <= FEEDING_LEAD_DAYS ? "soon" : "scheduled"
    };
}

// YYYY-MM-DD for today plus a number of days, in local time (the same shape a
// date input and the stored lastFed value use).
function shiftDateText(daysFromToday) {
    const target = new Date();

    target.setDate(target.getDate() + daysFromToday);

    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, "0");
    const day = String(target.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

// "Sat 19 Oct" — short enough for a dashboard row.
function formatFeedDayText(daysFromToday) {
    const target = new Date();

    target.setDate(target.getDate() + daysFromToday);

    return target.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function getSnakesDueOrComingUp(snakes) {
    if (!Array.isArray(snakes)) {
        return [];
    }

    return snakes
        .map(snake => getFeedingStatus(snake))
        .filter(status => status.state === "due" || status.state === "soon")
        .sort((a, b) =>
            (a.daysUntil ?? 0) - (b.daysUntil ?? 0)
            || String(a.snake.name || "").localeCompare(String(b.snake.name || ""))
        );
}

// What to say when nothing on this list is due: the point is that the keeper
// knows when to look again, not that the screen is empty.
function describeNextDue(snakes) {
    const waits = [];
    let neverFed = 0;

    (snakes || []).forEach(snake => {
        const status = getFeedingStatus(snake);

        if (status.state === "unscheduled") {
            neverFed += 1;
            return;
        }

        if (status.state === "scheduled") {
            waits.push(status.daysUntil);
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

    return `Next due ${formatFeedDayText(soonest)} (${when}): ${count} snake${count === 1 ? "" : "s"}.${neverFedNote}`;
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
window.FEEDING_LEAD_DAYS = FEEDING_LEAD_DAYS;
window.getDaysSince = getDaysSince;
window.getFeedingInterval = getFeedingInterval;
window.isOnFeedingHold = isOnFeedingHold;
window.isSnakeDueToFeed = isSnakeDueToFeed;
window.getSnakesDueToFeed = getSnakesDueToFeed;
window.getFeedingStatus = getFeedingStatus;
window.getSnakesDueOrComingUp = getSnakesDueOrComingUp;
window.shiftDateText = shiftDateText;
window.formatFeedDayText = formatFeedDayText;
window.describeNextDue = describeNextDue;
window.getTodayText = getTodayText;
