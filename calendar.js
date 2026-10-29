// calendar.js
// The unified task calendar: one month view for the jobs the rest of the app
// already knows about - meals, health follow-ups, clutch hatch windows and
// feeder orders. Nothing new is stored here; the page only reads the collection
// and presents what is due.

(function () {
    const C = window.CalendarTools;
    const today = C.todayText();
    const state = {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        selected: today,
        tasks: [],
        summaryTasks: [],
        grouped: new Map()
    };

    const elements = {
        monthLabel: document.getElementById("calendarMonthLabel"),
        grid: document.getElementById("calendarGrid"),
        prevButton: document.getElementById("calendarPrevButton"),
        nextButton: document.getElementById("calendarNextButton"),
        todayButton: document.getElementById("calendarTodayButton"),
        refreshButton: document.getElementById("calendarRefreshButton"),
        dayTitle: document.getElementById("calendarDayTitle"),
        dayList: document.getElementById("calendarDayList"),
        dayEmpty: document.getElementById("calendarDayEmpty"),
        todayCount: document.getElementById("calendarKpiToday"),
        weekCount: document.getElementById("calendarKpiWeek"),
        overdueCount: document.getElementById("calendarKpiOverdue"),
        status: document.getElementById("calendarStatus")
    };

    function escapeHtml(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatLongDate(dateText) {
        const date = C.parseDate(dateText);

        if (!date) {
            return "Choose a day";
        }

        return date.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        });
    }

    function formatMonth(year, month) {
        return new Date(year, month, 1).toLocaleDateString(undefined, {
            month: "long",
            year: "numeric"
        });
    }

    function formatShort(dateText) {
        const date = C.parseDate(dateText);

        return date
            ? date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
            : dateText;
    }

    function loadData() {
        const snakes = window.SnakeData.loadSnakesWithIds([]);
        const clutches = window.SnakeData.readStorageArray("clutches", []);
        const forecast = window.SnakeFeeders
            ? window.SnakeFeeders.buildForecast({
                snakes,
                settings: window.SnakeFeeders.getSettings(),
                inventory: window.SnakeFeeders.getInventory()
            })
            : null;

        return { snakes, clutches, forecast };
    }

    function refreshTasks() {
        const data = loadData();
        const grid = C.buildMonthGrid(state.year, state.month, today);
        const startDate = grid[0].date;
        const endDate = grid[grid.length - 1].date;

        const base = {
            snakes: data.snakes,
            clutches: data.clutches,
            forecast: data.forecast,
            health: window.SnakeHealth,
            today
        };

        state.tasks = C.collectTasks({ ...base, startDate, endDate });
        state.grouped = C.groupTasksByDate(state.tasks);

        // The counters describe today and the coming week, so they stay honest
        // while the user pages through other months.
        state.summaryTasks = C.collectTasks({
            ...base,
            startDate: today,
            endDate: C.addDays(today, 6)
        });
    }

    function taskTypeLabel(type) {
        return C.TASK_TYPES[type] ? C.TASK_TYPES[type].label : "Task";
    }

    function taskChip(task) {
        return `<span class="calendar-chip is-${escapeHtml(task.type)}${task.overdue ? " is-overdue" : ""}">
            ${escapeHtml(task.title)}
        </span>`;
    }

    function renderSummary() {
        const summary = C.summarizeTasks(state.summaryTasks, today);

        elements.todayCount.textContent = String(summary.today);
        elements.weekCount.textContent = String(summary.week);
        elements.overdueCount.textContent = String(summary.overdue);
    }

    function renderMonth() {
        const grid = C.buildMonthGrid(state.year, state.month, today);

        elements.monthLabel.textContent = formatMonth(state.year, state.month);

        elements.grid.innerHTML = grid.map(day => {
            const tasks = state.grouped.get(day.date) || [];
            const visible = tasks.slice(0, 2);
            const more = tasks.length - visible.length;
            const classes = [
                "calendar-day",
                day.inMonth ? "" : "is-outside",
                day.isToday ? "is-today" : "",
                day.date === state.selected ? "is-selected" : "",
                day.isWeekend ? "is-weekend" : ""
            ].filter(Boolean).join(" ");

            return `
                <button type="button" class="${classes}" data-date="${escapeHtml(day.date)}"
                    aria-label="${escapeHtml(formatLongDate(day.date))}${tasks.length ? `, ${tasks.length} task${tasks.length === 1 ? "" : "s"}` : ""}">
                    <span class="calendar-day-number">${day.day}</span>
                    <span class="calendar-day-tasks">
                        ${visible.map(taskChip).join("")}
                        ${more > 0 ? `<span class="calendar-more">+${more} more</span>` : ""}
                    </span>
                </button>
            `;
        }).join("");
    }

    function renderDay() {
        const tasks = state.grouped.get(state.selected) || [];

        elements.dayTitle.textContent = formatLongDate(state.selected);
        elements.dayEmpty.hidden = tasks.length > 0;

        elements.dayList.innerHTML = tasks.map(task => `
            <li class="calendar-task is-${escapeHtml(task.type)}${task.overdue ? " is-overdue" : ""}">
                <div class="calendar-task-body">
                    <span class="calendar-task-type">${escapeHtml(taskTypeLabel(task.type))}</span>
                    <strong>${escapeHtml(task.title)}</strong>
                    ${task.detail ? `<span class="calendar-task-detail">${escapeHtml(task.detail)}</span>` : ""}
                    ${task.overdue ? `<span class="calendar-task-overdue">Overdue</span>` : ""}
                </div>
                <a class="small-link-button" href="${escapeHtml(task.href)}">Open</a>
            </li>
        `).join("");
    }

    function renderAll() {
        renderSummary();
        renderMonth();
        renderDay();
    }

    function selectDate(date) {
        if (!C.parseDate(date)) {
            return;
        }

        state.selected = date;
        renderMonth();
        renderDay();
    }

    function changeMonth(delta) {
        const next = new Date(state.year, state.month + delta, 1);

        state.year = next.getFullYear();
        state.month = next.getMonth();

        const sameMonthAsToday = today.startsWith(`${state.year}-${String(state.month + 1).padStart(2, "0")}`);

        state.selected = sameMonthAsToday
            ? today
            : C.dateText(new Date(state.year, state.month, 1));

        refreshTasks();
        renderAll();
    }

    function refresh() {
        const before = state.tasks.length;

        refreshTasks();
        renderAll();

        if (elements.status) {
            elements.status.textContent = before === state.tasks.length
                ? "Calendar refreshed."
                : "Calendar refreshed with the latest collection data.";
        }
    }

    function bindEvents() {
        elements.prevButton.addEventListener("click", () => changeMonth(-1));
        elements.nextButton.addEventListener("click", () => changeMonth(1));

        elements.todayButton.addEventListener("click", () => {
            const now = new Date();

            state.year = now.getFullYear();
            state.month = now.getMonth();
            state.selected = today;
            refreshTasks();
            renderAll();
        });

        elements.refreshButton.addEventListener("click", refresh);

        elements.grid.addEventListener("click", event => {
            const day = event.target.closest("[data-date]");

            if (day) {
                selectDate(day.dataset.date);
            }
        });
    }

    function applyUrlDate() {
        const requested = new URLSearchParams(window.location.search).get("date");

        if (!C.parseDate(requested)) {
            return;
        }

        const date = C.parseDate(requested);

        state.year = date.getFullYear();
        state.month = date.getMonth();
        state.selected = requested;
    }

    function init() {
        applyUrlDate();
        bindEvents();
        refreshTasks();
        renderAll();
    }

    init();
})();
