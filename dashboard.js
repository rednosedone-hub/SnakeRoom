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

let feederWatchMessage = "";
let feederWatchMessageTimer = null;

function bindFeederWatchActions() {
    const list = document.getElementById("feederWatchList");

    if (!list || list.dataset.stockBound === "true") {
        return;
    }

    list.dataset.stockBound = "true";
    list.addEventListener("click", event => {
        const button = event.target.closest("[data-stock-size]");

        if (!button) {
            return;
        }

        const size = button.getAttribute("data-stock-size");
        const quantity = parseInt(button.getAttribute("data-stock-quantity"), 10);

        if (!size || !quantity || !window.SnakeFeeders) {
            return;
        }

        window.SnakeFeeders.addStock(size, quantity);
        feederWatchMessage = `Added ${quantity} ${size} to freezer stock.`;
        renderFeederWatch(window.SnakeData.loadSnakesWithIds(window.SnakeData.defaultSnakes)
            .filter(snake => window.SnakeData.isActiveSnake(snake)));

        window.clearTimeout(feederWatchMessageTimer);
        feederWatchMessageTimer = window.setTimeout(() => {
            feederWatchMessage = "";

            const status = document.getElementById("feederWatchStatus");

            if (status) {
                status.textContent = "";
            }
        }, 6000);
    });
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

function renderHealthWatch(snakes) {
    const list = document.getElementById("healthWatchList");

    if (!list) {
        return;
    }

    if (!window.SnakeHealth) {
        list.innerHTML = `<p class="empty-message">Health helpers did not load.</p>`;
        return;
    }

    const items = window.SnakeHealth.getHealthWatchItems(snakes);

    if (items.length === 0) {
        list.innerHTML = `<p class="empty-message">Nothing needs attention right now.</p>`;
        return;
    }

    list.innerHTML = items.map(item => {
        const reasons = item.reasons;
        const urgent = reasons[0].priority === 0;
        const reasonLine = reasons.slice(0, 2).map(reason => reason.label).join(" \u00b7 ");
        const more = reasons.length > 2 ? ` +${reasons.length - 2} more` : "";
        const profileUrl = `snake-form.html?uid=${encodeURIComponent(item.snake.id || "")}`;

        return `
            <div class="dashboard-list-item health-watch-item${urgent ? " is-urgent" : ""}" title="${escapeHtml(reasons.map(reason => reason.label).join(" \u00b7 "))}">
                <strong><a href="${profileUrl}">${escapeHtml(item.snake.name || "Unnamed")}</a></strong>
                <span>${escapeHtml(window.SnakeData.getSnakeIdentityText(item.snake))}</span>
                <span>${escapeHtml(reasonLine)}${more}</span>
            </div>
        `;
    }).join("");
}

// ---- Feeder watch ----------------------------------------------------------
//
// The feeding list says who eats next; this says whether there is food for it.
// Frozen stock is judged against the forecast; live feeding has nothing to
// count, so the alert is the next feeding day's order instead.

function formatFeederWatchDate(forecast, value) {
    const days = window.SnakeFeeders.daysBetween(forecast.today, value);

    return days === null ? "" : window.formatFeedDayText(days);
}

function renderFeederWatch(snakes) {
    const list = document.getElementById("feederWatchList");
    const lead = document.getElementById("feederWatchLead");
    const countBadge = document.getElementById("feederWatchCount");
    const status = document.getElementById("feederWatchStatus");

    if (!list || !lead || !countBadge) {
        return;
    }

    bindFeederWatchActions();

    if (status) {
        status.textContent = feederWatchMessage;
    }

    if (!window.SnakeFeeders) {
        lead.textContent = "Feeder helpers did not load.";
        list.innerHTML = "";
        countBadge.textContent = "";
        countBadge.classList.remove("visible");
        return;
    }

    const forecast = window.SnakeFeeders.buildForecast({
        snakes,
        settings: window.SnakeFeeders.getSettings(),
        inventory: window.SnakeFeeders.getInventory()
    });
    const isLive = forecast.mode === "live";
    const attention = forecast.sizes.filter(size => size.suggestedOrder > 0
        && (isLive ? size.status === "order" : size.status !== "ok"));
    const urgent = attention.filter(size => size.status === "order");
    const watch = attention.filter(size => size.status === "watch");

    countBadge.textContent = String(attention.length);
    countBadge.classList.toggle("visible", attention.length > 0);
    countBadge.title = attention.length === 1
        ? "1 feeder size needs attention"
        : `${attention.length} feeder sizes need attention`;

    if (isLive) {
        lead.textContent = attention.length > 0
            ? `Live feeders: buy for the next feeding day (${attention.length} size${attention.length === 1 ? "" : "s"}).`
            : (forecast.events.length > 0
                ? `No live order needed yet. Next feeding ${formatFeederWatchDate(forecast, forecast.events[0].date)}.`
                : "No live feedings scheduled. Give a snake a feeder size and a last-fed date to forecast one.");

        if (attention.length === 0) {
            list.innerHTML = `<p class="empty-message">Nothing needs buying for the next feeding day.</p>`;
            return;
        }

        list.innerHTML = attention.map(size => `
            <div class="dashboard-list-item feeder-watch-item is-urgent">
                <strong>${escapeHtml(size.size)}</strong>
                <span>${size.nextCount} needed</span>
                <span>Buy fresh</span>
                <span>For ${escapeHtml(formatFeederWatchDate(forecast, size.nextDate))} \u00b7 ${size.need} meal${size.need === 1 ? "" : "s"} in ${forecast.horizonDays} days</span>
            </div>
        `).join("");
        return;
    }

    if (urgent.length > 0 && watch.length > 0) {
        lead.textContent = `Order ${urgent.length} size${urgent.length === 1 ? "" : "s"} now; ${watch.length} more will run low in the next ${forecast.horizonDays} days.`;
    } else if (urgent.length > 0) {
        lead.textContent = `Order ${urgent.length} size${urgent.length === 1 ? "" : "s"} now to keep the feeding schedule covered.`;
    } else if (watch.length > 0) {
        lead.textContent = `${watch.length} size${watch.length === 1 ? " is" : "s are"} running low in the next ${forecast.horizonDays} days.`;
    } else if (forecast.totals.onHand > 0) {
        lead.textContent = `Freezer stock covers the next ${forecast.horizonDays} days of feedings.`;
    } else {
        lead.textContent = "No freezer stock recorded yet. Set what is on hand, or log a frozen order, on the Feeders page.";
    }

    if (attention.length === 0) {
        list.innerHTML = `<p class="empty-message">Nothing needs ordering right now.</p>`;
        return;
    }

    list.innerHTML = attention.map(size => {
        const isUrgent = size.status === "order";
        const action = `<span class="feeder-watch-action"><button type="button" class="feeder-stock-in-button" data-stock-size="${escapeHtml(size.size)}" data-stock-quantity="${size.suggestedOrder}" title="Add ${size.suggestedOrder} ${escapeHtml(size.size)} to freezer stock">Stock in ${size.suggestedOrder}</button></span>`;
        const stockLine = `${size.onHand} on hand${size.keepAtLeast > 0 ? ` \u00b7 keep ${size.keepAtLeast}` : ""}`;
        const timingParts = [];

        if (isUrgent) {
            timingParts.push("Order now");
        } else if (size.orderByDate) {
            timingParts.push(`Order by ${formatFeederWatchDate(forecast, size.orderByDate)}`);
        }

        if (size.runsOutDate) {
            timingParts.push(`runs out ${formatFeederWatchDate(forecast, size.runsOutDate)}`);
        } else if (!isUrgent) {
            timingParts.push(`below the ${size.keepAtLeast} buffer`);
        }

        timingParts.push(`${size.need} needed in ${forecast.horizonDays} days`);

        return `
            <div class="dashboard-list-item feeder-watch-item${isUrgent ? " is-urgent" : ""}">
                <strong>${escapeHtml(size.size)}</strong>
                <span>${escapeHtml(stockLine)}</span>
                ${action}
                <span>${escapeHtml(timingParts.join(" \u00b7 "))}</span>
            </div>
        `;
    }).join("");
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
    renderFeederWatch(activeSnakes);
    renderHealthWatch(activeSnakes);

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
