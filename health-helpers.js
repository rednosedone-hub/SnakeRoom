// Health and quarantine helpers.
//
// Health records stay on the snake record, so they travel with the normal
// snapshot and merge with the same per-field / per-record rules as weights and
// feeding history. This file turns those records into short, actionable watch
// items for the dashboard and collection.
(function () {
    const DAY_MS = 24 * 60 * 60 * 1000;

    const HEALTH_EVENT_TYPES = [
        "Checkup",
        "Illness",
        "Injury",
        "Mites",
        "Regurgitation",
        "Medication",
        "Vet Visit",
        "Other"
    ];

    const HEALTH_SEVERITIES = ["Mild", "Moderate", "Severe"];

    const QUARANTINE_REASONS = [
        "New arrival",
        "Illness",
        "Mites",
        "Preventative",
        "Other"
    ];

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function parseDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));

        if (!match) {
            return null;
        }

        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function dateText(date) {
        if (!date) {
            return "";
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function todayText(now = new Date()) {
        return dateText(now instanceof Date ? now : new Date(now));
    }

    function addDays(value, days) {
        const date = parseDate(value);

        if (!date) {
            return null;
        }

        date.setDate(date.getDate() + Number(days || 0));
        return date;
    }

    function daysBetween(fromValue, toValue) {
        const from = parseDate(fromValue);
        const to = parseDate(toValue);

        if (!from || !to) {
            return null;
        }

        return Math.round((to.getTime() - from.getTime()) / DAY_MS);
    }

    function getHealthHistory(snake) {
        const history = Array.isArray(snake && snake.healthHistory) ? snake.healthHistory : [];

        return history
            .filter(entry => entry && typeof entry === "object")
            .slice()
            .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")));
    }

    function getQuarantineStatus(snake, today = todayText()) {
        const start = text(snake && snake.quarantineStart);
        const end = text(snake && snake.quarantineEnd);
        const released = Boolean(snake && snake.quarantineReleased);
        const releasedDate = text(snake && snake.quarantineReleasedDate);

        if (released) {
            return {
                state: "released",
                active: false,
                start,
                end,
                released,
                releasedDate,
                daysLeft: null,
                label: `Released${releasedDate ? ` ${releasedDate}` : ""}`
            };
        }

        if (!start && !end) {
            return {
                state: "none",
                active: false,
                start,
                end,
                released: false,
                releasedDate: "",
                daysLeft: null,
                label: "Not in quarantine"
            };
        }

        const startDate = parseDate(start);
        const todayDate = parseDate(today);

        if (startDate && todayDate && startDate > todayDate) {
            return {
                state: "scheduled",
                active: false,
                start,
                end,
                released: false,
                releasedDate: "",
                daysLeft: end ? daysBetween(today, end) : null,
                label: `Starts ${start}`
            };
        }

        const daysLeft = end ? daysBetween(today, end) : null;

        if (daysLeft === null) {
            return {
                state: "active",
                active: true,
                start,
                end,
                released: false,
                releasedDate: "",
                daysLeft,
                label: `In quarantine${start ? ` since ${start}` : ""}`
            };
        }

        if (daysLeft < 0) {
            return {
                state: "overdue",
                active: true,
                start,
                end,
                released: false,
                releasedDate: "",
                daysLeft,
                label: `Release date passed ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} ago`
            };
        }

        if (daysLeft === 0) {
            return {
                state: "due",
                active: true,
                start,
                end,
                released: false,
                releasedDate: "",
                daysLeft,
                label: "Quarantine ends today"
            };
        }

        return {
            state: "active",
            active: true,
            start,
            end,
            released: false,
            releasedDate: "",
            daysLeft,
            label: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
        };
    }

    function getFollowUpStatus(entry, today = todayText()) {
        if (!entry || !entry.followUpDate) {
            return { state: "none", daysUntil: null, label: "" };
        }

        if (entry.resolvedDate) {
            return {
                state: "resolved",
                daysUntil: null,
                label: `Resolved ${entry.resolvedDate}`
            };
        }

        const daysUntil = daysBetween(today, entry.followUpDate);

        if (daysUntil === null) {
            return { state: "open", daysUntil: null, label: `Follow-up ${entry.followUpDate}` };
        }

        if (daysUntil < 0) {
            return {
                state: "overdue",
                daysUntil,
                label: `Follow-up overdue ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? "" : "s"}`
            };
        }

        if (daysUntil === 0) {
            return { state: "due", daysUntil, label: "Follow-up due today" };
        }

        return {
            state: "upcoming",
            daysUntil,
            label: `Follow-up in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`
        };
    }

    function getOpenFollowUps(snake, today = todayText()) {
        return getHealthHistory(snake)
            .map(entry => ({ entry, status: getFollowUpStatus(entry, today) }))
            .filter(item => item.status.state === "overdue" || item.status.state === "due")
            .sort((left, right) => (left.status.daysUntil || 0) - (right.status.daysUntil || 0));
    }

    function getRecentRefusals(snake, today = todayText(), days = 21) {
        const cutoff = dateText(addDays(today, -Math.abs(days)));

        if (!cutoff) {
            return [];
        }

        return (Array.isArray(snake.feedingHistory) ? snake.feedingHistory : [])
            .filter(entry => entry
                && String(entry.result || "") === "Refused"
                && entry.date >= cutoff
                && entry.date <= today);
    }

    function getLatestRegurgitation(snake, today = todayText(), days = 14) {
        const cutoff = dateText(addDays(today, -Math.abs(days)));

        return (Array.isArray(snake.feedingHistory) ? snake.feedingHistory : [])
            .filter(entry => entry
                && String(entry.result || "") === "Regurgitated"
                && entry.date >= cutoff
                && entry.date <= today)
            .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")))[0] || null;
    }

    function getWeightTrend(snake, today = todayText()) {
        const history = (Array.isArray(snake.weightHistory) ? snake.weightHistory : [])
            .map(entry => ({
                date: text(entry && entry.date),
                weight: Number(entry && entry.weight)
            }))
            .filter(entry => entry.date && Number.isFinite(entry.weight) && entry.weight > 0)
            .sort((left, right) => left.date.localeCompare(right.date));

        if (history.length < 2) {
            return null;
        }

        const latest = history[history.length - 1];

        // A stale card should not raise a health warning from last season.
        if (daysBetween(latest.date, today) > 30) {
            return null;
        }

        const baseline = history
            .filter(entry => entry.date < latest.date && daysBetween(entry.date, latest.date) >= 14)
            .slice(-1)[0];

        if (!baseline || baseline.weight <= 0) {
            return null;
        }

        const changePercent = ((latest.weight - baseline.weight) / baseline.weight) * 100;

        return {
            baseline,
            latest,
            changePercent,
            changeWeight: latest.weight - baseline.weight
        };
    }

    function getHealthWatchReasons(snake, today = todayText()) {
        const reasons = [];
        const quarantine = getQuarantineStatus(snake, today);

        if (quarantine.active) {
            reasons.push({
                code: "quarantine",
                priority: quarantine.state === "overdue" ? 0 : 1,
                label: quarantine.state === "overdue"
                    ? quarantine.label
                    : `Quarantine${quarantine.end ? ` until ${quarantine.end}` : ""}${quarantine.daysLeft !== null ? ` (${quarantine.daysLeft} day${quarantine.daysLeft === 1 ? "" : "s"})` : ""}`,
                detail: quarantine.start ? `Started ${quarantine.start}` : ""
            });
        }

        getOpenFollowUps(snake, today).forEach(item => {
            reasons.push({
                code: "follow-up",
                priority: item.status.state === "overdue" ? 0 : 1,
                label: item.status.label,
                detail: [item.entry.type, item.entry.description].filter(Boolean).join(" · ")
            });
        });

        getHealthHistory(snake).forEach(entry => {
            if (String(entry.severity || "") === "Severe" && !entry.resolvedDate) {
                reasons.push({
                    code: "severe",
                    priority: 0,
                    label: `Severe ${entry.type || "health event"} unresolved`,
                    detail: [entry.date, entry.description].filter(Boolean).join(" · ")
                });
            }
        });

        const regurgitation = getLatestRegurgitation(snake, today);

        if (regurgitation) {
            reasons.push({
                code: "regurgitation",
                priority: 0,
                label: `Regurgitated ${regurgitation.date}`,
                detail: "Check husbandry and wait before the next meal."
            });
        }

        const refusals = getRecentRefusals(snake, today);

        if (refusals.length >= 2) {
            reasons.push({
                code: "refusals",
                priority: 1,
                label: `${refusals.length} refusals in the last 21 days`,
                detail: refusals.map(entry => entry.date).join(", ")
            });
        }

        const weightTrend = getWeightTrend(snake, today);

        if (weightTrend && weightTrend.changePercent <= -5) {
            reasons.push({
                code: "weight-loss",
                priority: 1,
                label: `Weight down ${Math.abs(weightTrend.changePercent).toFixed(1)}%`,
                detail: `${weightTrend.baseline.weight}g on ${weightTrend.baseline.date} → ${weightTrend.latest.weight}g on ${weightTrend.latest.date}`
            });
        }

        return reasons.sort((left, right) => left.priority - right.priority);
    }

    function getHealthWatchItems(snakes, today = todayText()) {
        return (Array.isArray(snakes) ? snakes : [])
            .map(snake => ({
                snake,
                reasons: getHealthWatchReasons(snake, today)
            }))
            .filter(item => item.reasons.length > 0)
            .sort((left, right) =>
                left.reasons[0].priority - right.reasons[0].priority
                || String(left.snake.name || "").localeCompare(String(right.snake.name || ""))
            );
    }

    function getHealthBadge(snake, today = todayText()) {
        const quarantine = getQuarantineStatus(snake, today);

        if (quarantine.active) {
            return {
                label: quarantine.state === "overdue" ? "Quarantine overdue" : "Quarantine",
                className: quarantine.state === "overdue" ? "health-badge-alert" : "health-badge-quarantine",
                title: quarantine.label
            };
        }

        const reasons = getHealthWatchReasons(snake, today);

        if (reasons.length > 0) {
            return {
                label: "Health watch",
                className: "health-badge-watch",
                title: reasons.map(reason => reason.label).join(" · ")
            };
        }

        return null;
    }

    window.SnakeHealth = {
        HEALTH_EVENT_TYPES,
        HEALTH_SEVERITIES,
        QUARANTINE_REASONS,
        todayText,
        parseDate,
        daysBetween,
        getHealthHistory,
        getQuarantineStatus,
        getFollowUpStatus,
        getOpenFollowUps,
        getRecentRefusals,
        getLatestRegurgitation,
        getWeightTrend,
        getHealthWatchReasons,
        getHealthWatchItems,
        getHealthBadge
    };
})();
