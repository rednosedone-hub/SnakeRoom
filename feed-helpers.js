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

// ---- Snoozing a feeding ----------------------------------------------------
//
// Snoozing is not a meal. The last-fed date stays honest (no food was taken),
// and the schedule counts from the day it was snoozed instead, which moves the
// snake straight to its next feeding slot. The marker clears itself once the
// snake is fed or the schedule is reset, and it never hides a snake that has
// gone overdue again.

function normalizeDateText(value) {
    const clean = String(value === undefined || value === null ? "" : value).trim().slice(0, 10);

    return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : "";
}

function getFeedSnoozeDate(snake) {
    return normalizeDateText(snake && snake.feedingSnoozedOn);
}

// The date the feeding interval counts from: the last meal, or a later snooze.
function getFeedingAnchor(snake) {
    const lastFed = normalizeDateText(snake && snake.lastFed);
    const snoozedOn = getFeedSnoozeDate(snake);

    if (snoozedOn && (!lastFed || snoozedOn >= lastFed)) {
        return { date: snoozedOn, snoozed: true };
    }

    return { date: lastFed, snoozed: false };
}

function isFeedSnoozed(snake) {
    return getFeedingAnchor(snake).snoozed;
}

// Moves the snake to its next scheduled feeding without logging a meal.
function snoozeFeeding(snake, dateValue) {
    if (!snake) {
        return null;
    }

    const snoozedOn = normalizeDateText(dateValue) || getTodayText();

    snake.feedingSnoozedOn = snoozedOn;

    const status = getFeedingStatus(snake);

    return {
        snoozedOn,
        dueDate: status.dueDate,
        daysUntil: status.daysUntil,
        interval: status.interval
    };
}

function clearFeedingSnooze(snake) {
    if (snake && snake.feedingSnoozedOn) {
        delete snake.feedingSnoozedOn;

        return true;
    }

    return false;
}

function isSnakeDueToFeed(snake) {
    if (window.SnakeData.isInactiveSnake(snake) || isOnFeedingHold(snake)) {
        return false;
    }

    const feedingIntervalDays = getFeedingInterval(snake);
    const daysSinceAnchor = getDaysSince(getFeedingAnchor(snake).date);

    if (daysSinceAnchor === null) {
        return false;
    }

    return daysSinceAnchor >= feedingIntervalDays;
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
    const anchor = getFeedingAnchor(snake);
    const base = {
        snake,
        interval,
        daysSinceFed,
        snoozedOn: anchor.snoozed ? anchor.date : "",
        daysUntil: null,
        dueDate: null
    };

    // A retired record keeps its feeding history but never appears as due.
    if (window.SnakeData.isInactiveSnake(snake)) {
        return { ...base, state: "inactive" };
    }

    if (isOnFeedingHold(snake)) {
        return { ...base, state: "hold" };
    }

    const daysSinceAnchor = getDaysSince(anchor.date);

    if (daysSinceAnchor === null) {
        return { ...base, state: "unscheduled" };
    }

    const daysUntil = interval - daysSinceAnchor;

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
window.getFeedSnoozeDate = getFeedSnoozeDate;
window.getFeedingAnchor = getFeedingAnchor;
window.isFeedSnoozed = isFeedSnoozed;
window.snoozeFeeding = snoozeFeeding;
window.clearFeedingSnooze = clearFeedingSnooze;
window.isSnakeDueToFeed = isSnakeDueToFeed;
window.getSnakesDueToFeed = getSnakesDueToFeed;
window.getFeedingStatus = getFeedingStatus;
window.getSnakesDueOrComingUp = getSnakesDueOrComingUp;
window.shiftDateText = shiftDateText;
window.formatFeedDayText = formatFeedDayText;
window.describeNextDue = describeNextDue;
window.getTodayText = getTodayText;
