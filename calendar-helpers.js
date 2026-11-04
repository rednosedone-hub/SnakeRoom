// calendar-helpers.js
// The maths behind the unified task calendar: which days a month shows, and
// which jobs from around the app land on each day. It is deliberately free of
// DOM code so the rules can be tested, and the page only paints what it returns.
//
// Every task is something the keeper can act on that day:
//   feeding  - a snake's next meal (and the meals after it, inside the window)
//   health   - quarantine release, or a follow-up on a health event
//   pickup   - a hold's pickup date, plus a reminder a few days before it
//   breeding - a clutch's hatch window and first candling, plus a pair's
//              estimated ovulation and egg date after a pre-lay shed
//   order    - a feeder size that has reached its re-order date
//
// Overdue work is pinned to today: the app treats "was due last week" as "do it
// now", so the calendar shows it on today rather than burying it in the past.

(function () {
    const TASK_TYPES = {
        pickup: { label: "Pickup", rank: 1 },
        feeding: { label: "Feeding", rank: 2 },
        health: { label: "Health", rank: 3 },
        breeding: { label: "Breeding", rank: 4 },
        order: { label: "Order", rank: 5 }
    };

    const HATCH_DAYS = 55;
    // A hold's pickup date is only useful if the keeper reaches out first. Three
    // days is enough time to agree a time, settle the balance and sort out a
    // shipping box or a meeting place without the buyer feeling chased.
    const PICKUP_REMINDER_DAYS = 3;

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

    // The incubation maths lives in incubation-helpers.js, which the outcomes
    // page also loads. When it is absent the calendar keeps its own 55-day term
    // rather than losing the reminder altogether.
    function incubationTool() {
        return window.Incubation || null;
    }

    function collectBreedingTasks(clutches, options, push) {
        (Array.isArray(clutches) ? clutches : []).forEach(clutch => {
            if (!clutch || !parseDate(clutch.laidDate) || clutch.convertedToSnakes) {
                return;
            }

            const incubation = incubationTool();
            const eggCount = number(clutch.eggCount, 0);
            const href = `breedingOutcomes.html#clutch-${encodeURIComponent(text(clutch.id))}`;
            const hatchDate = incubation && typeof incubation.expectedHatchDate === "function"
                ? incubation.expectedHatchDate(clutch)
                : addDays(clutch.laidDate, HATCH_DAYS);

            if (hatchDate) {
                const date = hatchDate < options.today ? options.today : hatchDate;
                const overdue = hatchDate < options.today;

                if (date <= options.endDate) {
                    push({
                        date,
                        type: "breeding",
                        title: overdue
                            ? `Hatch window passed: clutch ${text(clutch.id)}`
                            : `Hatch window opens: clutch ${text(clutch.id)}`,
                        detail: `${eggCount} egg${eggCount === 1 ? "" : "s"} · laid ${clutch.laidDate}`,
                        href,
                        overdue
                    });
                }
            }

            // One reminder around day 21, and only while the keeper has not
            // recorded a candling. Past that date it is pinned to today like
            // every other overdue job.
            const candleDue = incubation && typeof incubation.candleDueDate === "function"
                ? incubation.candleDueDate(clutch)
                : addDays(clutch.laidDate, 21);
            const candled = incubation && typeof incubation.latestCandle === "function"
                ? Boolean(incubation.latestCandle(clutch))
                : Boolean(clutch.candleLog && clutch.candleLog.length);

            // Once the hatch window has passed the "open the incubator" task
            // above is the useful one; telling a keeper to candle eggs that
            // should already have hatched is noise.
            const hatchWindowPassed = Boolean(hatchDate) && hatchDate < options.today;

            if (candleDue && !candled && !hatchWindowPassed) {
                const candleDate = candleDue < options.today ? options.today : candleDue;

                if (candleDate <= options.endDate) {
                    push({
                        date: candleDate,
                        type: "breeding",
                        title: `Candle clutch ${text(clutch.id)}`,
                        detail: `${eggCount} egg${eggCount === 1 ? "" : "s"} · first look for veins`,
                        href,
                        overdue: candleDue < options.today
                    });
                }
            }
        });
    }

    function findSnakeByReference(snakes, reference) {
        const wanted = text(reference);

        if (!wanted) {
            return null;
        }

        if (window.SnakeData && typeof window.SnakeData.getSnakeByReference === "function") {
            const found = window.SnakeData.getSnakeByReference(snakes, wanted);

            if (found) {
                return found;
            }
        }

        return (Array.isArray(snakes) ? snakes : []).find(snake => snake && text(snake.id) === wanted) || null;
    }

    // A pair with a pre-lay shed but no eggs yet gets two markers: the
    // estimated ovulation (a day in the past, shown where it happened) and the
    // eggs due date (the job still ahead). Once eggs, or a clutch, are on
    // record the clutch's own hatch tasks take over.
    function collectPairTasks(pairs, snakes, options, push) {
        const timeline = window.BreedingTimeline;

        if (!timeline) {
            return;
        }

        (Array.isArray(pairs) ? pairs : []).forEach(pair => {
            if (!pair || pair.clutchId || parseDate(pair.eggsLaidDate)) {
                return;
            }

            const female = pair.femaleSnakeId
                ? findSnakeByReference(snakes, pair.femaleSnakeId)
                : (Array.isArray(snakes) ? snakes[Number(pair.femaleIndex)] || null : null);
            const estimate = timeline.estimate(pair, female, { today: options.today });

            if (!estimate) {
                return;
            }

            const label = snakeLabel(female) || "Female";
            const climbText = timeline.describeClimb(estimate.weightClimb);

            if (!estimate.ovulationObserved) {
                push({
                    date: estimate.ovulationDate,
                    type: "breeding",
                    title: `Ovulation (est.): ${label}`,
                    detail: `Pre-lay shed ${estimate.shedDate} · ${timeline.OVULATION_WINDOW[0]}-${timeline.OVULATION_WINDOW[1]} days before it · ${climbText}`,
                    href: "breeding.html#clutches"
                });
            }

            const overdue = estimate.layDate < options.today;
            const staleAfter = timeline.addDays(estimate.layTo, 14);

            // Two weeks past the end of the lay window the estimate is history,
            // not a job; keeping it pinned to today would be permanent noise.
            if (overdue && options.today > staleAfter) {
                return;
            }

            push({
                date: overdue ? options.today : estimate.layDate,
                type: "breeding",
                title: overdue ? `Eggs overdue (est.): ${label}` : `Eggs due (est.): ${label}`,
                detail: `${estimate.layFrom} to ${estimate.layTo} (${timeline.LAY_WINDOW[0]}-${timeline.LAY_WINDOW[1]} days after the shed)`,
                href: "breeding.html#clutches",
                overdue
            });
        });
    }

    function normalizeName(value) {
        return text(value).replace(/\s+/g, " ").toLowerCase();
    }

    // The buyer directory is where the phone number and e-mail live, so the
    // reminder can be acted on from the calendar without opening another page.
    function findBuyerRecord(buyers, name) {
        const wanted = normalizeName(name);

        if (!wanted) {
            return null;
        }

        if (window.SnakeBuyers && typeof window.SnakeBuyers.findBuyerByName === "function") {
            const found = window.SnakeBuyers.findBuyerByName(buyers, name);

            if (found) {
                return found;
            }
        }

        return (Array.isArray(buyers) ? buyers : [])
            .find(buyer => normalizeName(buyer && buyer.name) === wanted) || null;
    }

    function buyerContact(buyers, name) {
        const buyer = findBuyerRecord(buyers, name);

        if (!buyer) {
            return "";
        }

        // Ringing is how a pickup gets agreed, so the phone wins when both are
        // on file; the e-mail is the fallback for a quiet follow-up.
        return text(buyer.phone) || text(buyer.email);
    }

    function formatBalance(value) {
        return `$${(Math.round((Number(value) || 0) * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;
    }

    function describeDays(days) {
        return days === 1 ? "1 day" : `${days} days`;
    }

    // A dated hold produces two calendar entries: a reminder three days before
    // the pickup, when the keeper should reach out and make the final
    // arrangements, and the pickup itself. A hold already past its date folds
    // into one late pickup pinned to today, the way every other overdue job is.
    function collectPickupTasks(snakes, options, push) {
        const holds = window.SaleHolds;

        if (!holds || typeof holds.getHold !== "function") {
            return;
        }

        (Array.isArray(snakes) ? snakes : []).forEach(snake => {
            if (!snake) {
                return;
            }

            const hold = holds.getHold(snake, options.today);

            if (!hold || !hold.active || !parseDate(hold.dueDate)) {
                return;
            }

            const label = snakeLabel(snake);
            const buyer = hold.buyer;
            const contact = buyerContact(options.buyers, buyer);
            const who = buyer ? `for ${buyer}` : "No buyer named";
            const balance = hold.balance > 0 ? `${formatBalance(hold.balance)} balance due` : "";
            const daysLeft = hold.daysLeft === null
                ? daysBetween(options.today, hold.dueDate)
                : hold.daysLeft;

            if (daysLeft === null) {
                return;
            }

            if (daysLeft > 0) {
                const reminderDate = addDays(hold.dueDate, -PICKUP_REMINDER_DAYS);

                if (reminderDate) {
                    push({
                        date: reminderDate < options.today ? options.today : reminderDate,
                        type: "pickup",
                        title: `Confirm pickup: ${label}`,
                        detail: [
                            `Pickup in ${describeDays(daysLeft)} (${hold.dueDate})`,
                            who,
                            contact,
                            balance
                        ].filter(Boolean).join(" \u00b7 "),
                        href: snakeHref(snake)
                    });
                }
            }

            const overdue = daysLeft < 0;

            push({
                date: overdue ? options.today : hold.dueDate,
                type: "pickup",
                title: overdue ? `Pickup was due: ${label}` : `Pickup: ${label}`,
                detail: [
                    overdue ? `${describeDays(Math.abs(daysLeft))} late` : "",
                    who,
                    contact,
                    balance
                ].filter(Boolean).join(" \u00b7 "),
                href: snakeHref(snake),
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
        const context = {
            today,
            startDate,
            endDate,
            health: opts.health,
            buyers: opts.buyers
        };

        collectFeedingTasks(opts.snakes, context, push);
        collectHealthTasks(opts.snakes, context, push);
        collectPickupTasks(opts.snakes, context, push);
        collectBreedingTasks(opts.clutches, context, push);
        collectPairTasks(opts.pairs, opts.snakes, context, push);
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
        PICKUP_REMINDER_DAYS,
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
