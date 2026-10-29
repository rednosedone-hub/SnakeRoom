// calendar-helpers.js
// The maths behind the unified task calendar: which days a month shows, and
// which jobs from around the app land on each day. It is deliberately free of
// DOM code so the rules can be tested, and the page only paints what it returns.
//
// Every task is something the keeper can act on that day:
//   feeding  - a snake's next meal (and the meals after it, inside the window)
//   health   - quarantine release, or a follow-up on a health event
//   breeding - a clutch's 55-day hatch window
//   order    - a feeder size that has reached its re-order date
//
// Overdue work is pinned to today: the app treats "was due last week" as "do it
// now", so the calendar shows it on today rather than burying it in the past.

(function () {
    const TASK_TYPES = {
        feeding: { label: "Feeding", rank: 1 },
        health: { label: "Health", rank: 2 },
        breeding: { label: "Breeding", rank: 3 },
        order: { label: "Order", rank: 4 }
    };

    const HATCH_DAYS = 55;

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function number(value, fallback) {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function parseDate(value) {
        const clean = text(value).slice(0, 10);
        const parts = clean.split("-").map(Number);

        if (parts.length !== 3 || parts.some(part => Number.isNaN(part))) {
            return null;
        }

        const date = new Date(parts[0], parts[1] - 1, parts[2]);

        if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) {
            return null;
        }

        return date;
    }

    function dateText(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return "";
        }

        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function todayText(now = new Date()) {
        return dateText(now);
    }

    function addDays(value, days) {
        const date = parseDate(value);

        if (!date) {
            return "";
        }

        date.setDate(date.getDate() + Number(days || 0));

        return dateText(date);
    }

    function daysBetween(fromValue, toValue) {
        const from = parseDate(fromValue);
        const to = parseDate(toValue);

        if (!from || !to) {
            return null;
        }

        return Math.round((to - from) / (1000 * 60 * 60 * 24));
    }

    function startOfMonth(year, month) {
        return new Date(Number(year), Number(month), 1);
    }

    function endOfMonth(year, month) {
        return new Date(Number(year), Number(month) + 1, 0);
    }

    // A six-week grid that always starts on Sunday, so the month never jumps
    // around as the user pages through it.
    function buildMonthGrid(year, month, today = todayText()) {
        const first = startOfMonth(year, month);
        const gridStart = new Date(first);
        gridStart.setDate(first.getDate() - first.getDay());

        return Array.from({ length: 42 }, (_, offset) => {
            const date = new Date(gridStart);

            date.setDate(gridStart.getDate() + offset);

            return {
                date: dateText(date),
                day: date.getDate(),
                inMonth: date.getMonth() === Number(month),
                isToday: dateText(date) === today,
                isWeekend: date.getDay() === 0 || date.getDay() === 6
            };
        });
    }

    function feedingInterval(snake) {
        const interval = parseInt(snake && snake.feedingIntervalDays, 10);

        return Number.isNaN(interval) || interval <= 0 ? 7 : interval;
    }

    function snakeLabel(snake) {
        return text(snake && snake.name) || text(snake && snake.ID) || "Unnamed snake";
    }

    function isInactive(snake) {
        return Boolean(window.SnakeData && window.SnakeData.isInactiveSnake
            ? window.SnakeData.isInactiveSnake(snake)
            : ["Sold", "Archived", "Deceased"].includes(text(snake && snake.status)));
    }

    function isOnHold(snake) {
        return Boolean(snake && snake.feedingHold && snake.feedingHold.reason);
    }

    function snakeHref(snake) {
        const id = text(snake && snake.id);

        return id ? `snake-form.html?uid=${encodeURIComponent(id)}` : "snakes.html";
    }

    function collectFeedingTasks(snakes, options, push) {
        (Array.isArray(snakes) ? snakes : []).forEach(snake => {
            if (!snake || isInactive(snake) || isOnHold(snake)) {
                return;
            }

            if (!parseDate(snake.lastFed)) {
                return;
            }

            const interval = feedingInterval(snake);
            const label = snakeLabel(snake);
            const size = text(snake.feederSize);
            const baseDue = addDays(snake.lastFed, interval);
            let due = baseDue;
            let occurrences = 0;

            if (due < options.today) {
                // Overdue: the next chance to feed is today.
                const overdueDays = daysBetween(baseDue, options.today);

                push({
                    date: options.today,
                    type: "feeding",
                    title: `Feed ${label}`,
                    detail: `${size || "No feeder size set"} · overdue ${overdueDays} day${overdueDays === 1 ? "" : "s"}`,
                    href: "feeding-session.html",
                    overdue: true
                });

                due = addDays(options.today, interval);
            }

            while (due && due <= options.endDate && occurrences < 60) {
                occurrences += 1;

                if (due >= options.startDate) {
                    push({
                        date: due,
                        type: "feeding",
                        title: `Feed ${label}`,
                        detail: size || "No feeder size set",
                        href: "feeding-session.html"
                    });
                }

                due = addDays(due, interval);
            }
        });
    }

    function collectHealthTasks(snakes, options, push) {
        if (!options.health) {
            return;
        }

        (Array.isArray(snakes) ? snakes : []).forEach(snake => {
            if (!snake || isInactive(snake)) {
                return;
            }

            const label = snakeLabel(snake);
            const quarantine = typeof options.health.getQuarantineStatus === "function"
                ? options.health.getQuarantineStatus(snake, options.today)
                : null;

            if (quarantine && quarantine.active && quarantine.end) {
                const date = quarantine.end < options.today ? options.today : quarantine.end;

                push({
                    date,
                    type: "health",
                    title: `End quarantine: ${label}`,
                    detail: quarantine.label,
                    href: snakeHref(snake),
                    overdue: quarantine.end < options.today
                });
            }

            const history = typeof options.health.getHealthHistory === "function"
                ? options.health.getHealthHistory(snake)
                : [];

            history.forEach(entry => {
                if (!entry || !entry.followUpDate || entry.resolvedDate) {
                    return;
                }

                const date = entry.followUpDate < options.today ? options.today : entry.followUpDate;

                push({
                    date,
                    type: "health",
                    title: `Follow up: ${label}`,
                    detail: text(entry.title) || text(entry.type) || "Health follow-up",
                    href: snakeHref(snake),
                    overdue: entry.followUpDate < options.today
                });
            });
        });
    }

    function collectBreedingTasks(clutches, options, push) {
        (Array.isArray(clutches) ? clutches : []).forEach(clutch => {
            if (!clutch || !parseDate(clutch.laidDate) || clutch.convertedToSnakes) {
                return;
            }

            const hatchDate = addDays(clutch.laidDate, HATCH_DAYS);

            if (!hatchDate) {
                return;
            }

            const date = hatchDate < options.today ? options.today : hatchDate;

            if (date > options.endDate) {
                return;
            }

            const overdue = hatchDate < options.today;
            const eggCount = number(clutch.eggCount, 0);

            push({
                date,
                type: "breeding",
                title: overdue
                    ? `Hatch window passed: clutch ${text(clutch.id)}`
                    : `Hatch window opens: clutch ${text(clutch.id)}`,
                detail: `${eggCount} egg${eggCount === 1 ? "" : "s"} · laid ${clutch.laidDate}`,
                href: `breedingOutcomes.html#clutch-${encodeURIComponent(text(clutch.id))}`,
                overdue
            });
        });
    }

    function collectOrderTasks(forecast, options, push) {
        if (!forecast || !Array.isArray(forecast.sizes)) {
            return;
        }

        const live = forecast.mode === "live";

        forecast.sizes.forEach(size => {
            const quantity = number(size.suggestedOrder, 0);

            if (quantity <= 0) {
                return;
            }

            const due = live
                ? text(size.nextDate)
                : text(size.orderByDate) || text(size.nextDate);

            if (!due) {
                return;
            }

            const date = due < options.today ? options.today : due;

            if (date > options.endDate) {
                return;
            }

            push({
                date,
                type: "order",
                title: `Order ${quantity} ${size.size}`,
                detail: live
                    ? `For the feeding on ${size.nextDate || "the next feeding day"}`
                    : (size.runsOutDate ? `Stock runs out ${size.runsOutDate}` : "Below your keep-at-least stock"),
                href: "feeders.html#feederWeeklySection",
                overdue: due < options.today
            });
        });
    }

    function compareTasks(left, right) {
        return String(left.date).localeCompare(String(right.date))
            || (TASK_TYPES[left.type] ? TASK_TYPES[left.type].rank : 9) - (TASK_TYPES[right.type] ? TASK_TYPES[right.type].rank : 9)
            || String(left.title).localeCompare(String(right.title));
    }

    function collectTasks(options) {
        const opts = options || {};
        const today = opts.today || todayText();
        const startDate = opts.startDate || today;
        const endDate = opts.endDate || addDays(today, 41);
        const tasks = [];
        const push = task => {
            if (!task || !task.date || !parseDate(task.date)) {
                return;
            }

            if (task.date < startDate || task.date > endDate) {
                return;
            }

            tasks.push(task);
        };
        const context = { today, startDate, endDate, health: opts.health };

        collectFeedingTasks(opts.snakes, context, push);
        collectHealthTasks(opts.snakes, context, push);
        collectBreedingTasks(opts.clutches, context, push);
        collectOrderTasks(opts.forecast, context, push);

        return tasks.sort(compareTasks);
    }

    function groupTasksByDate(tasks) {
        const grouped = new Map();

        (Array.isArray(tasks) ? tasks : []).forEach(task => {
            if (!grouped.has(task.date)) {
                grouped.set(task.date, []);
            }

            grouped.get(task.date).push(task);
        });

        return grouped;
    }

    function summarizeTasks(tasks, today = todayText()) {
        const list = Array.isArray(tasks) ? tasks : [];
        const weekEnd = addDays(today, 6);

        return {
            today: list.filter(task => task.date === today).length,
            week: list.filter(task => task.date >= today && task.date <= weekEnd).length,
            overdue: list.filter(task => task.overdue).length,
            byType: Object.keys(TASK_TYPES).reduce((counts, type) => {
                counts[type] = list.filter(task => task.type === type).length;

                return counts;
            }, {})
        };
    }

    window.CalendarTools = {
        TASK_TYPES,
        HATCH_DAYS,
        parseDate,
        dateText,
        todayText,
        addDays,
        daysBetween,
        buildMonthGrid,
        collectTasks,
        groupTasksByDate,
        summarizeTasks
    };
})();
