const snakes = window.SnakeData.loadSnakesWithIds([]);
const clutches = window.SnakeData.readStorageArray("clutches", []);

const elements = {
    sortInput: document.getElementById("weightSortInput"),
    sexFilter: document.getElementById("weightSexFilter"),
    statusFilter: document.getElementById("weightStatusFilter"),
    printButton: document.getElementById("printWeightSheetButton"),
    date: document.getElementById("weightSheetDate"),
    body: document.getElementById("weightSheetBody"),
    clutchSelect: document.getElementById("clutchGrowthSelect"),
    clutchVerdict: document.getElementById("clutchGrowthVerdict"),
    clutchNote: document.getElementById("clutchGrowthNote"),
    clutchChart: document.getElementById("clutchGrowthChart"),
    clutchBody: document.getElementById("clutchGrowthBody")
};

function getLatestWeight(snake) {
    const history = Array.isArray(snake.weightHistory) ? snake.weightHistory : [];
    const sortedHistory = history
        .map(entry => ({
            date: entry.date || "",
            weight: entry.weight || entry.value || ""
        }))
        .filter(entry => entry.weight !== "")
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    if (sortedHistory.length > 0) {
        const latest = sortedHistory[0];
        return latest.date ? `${latest.weight}g (${latest.date})` : `${latest.weight}g`;
    }

    return snake.weight ? `${snake.weight}g` : "";
}

function getFilteredSnakes() {
    const selectedSex = elements.sexFilter.value;
    const selectedStatus = elements.statusFilter.value;
    const selectedSort = elements.sortInput.value;

    const filteredSnakes = snakes
        .filter(snake => selectedSex === "All" || snake.sex === selectedSex)
        .filter(snake => selectedStatus === "All"
            ? window.SnakeData.isActiveSnake(snake)
            : snake.status === selectedStatus);

    filteredSnakes.sort((a, b) => {
        if (selectedSort === "binNumber") {
            return String(a.binNumber || "").localeCompare(
                String(b.binNumber || ""),
                undefined,
                { numeric: true, sensitivity: "base" }
            ) || String(a.name || "").localeCompare(String(b.name || ""));
        }

        return String(a.name || "").localeCompare(String(b.name || ""));
    });

    return filteredSnakes;
}

function getSnakeGenes(snake) {
    if (!Array.isArray(snake.genes) || snake.genes.length === 0) {
        return "";
    }

    if (window.GeneTools?.describeGenes) {
        return window.GeneTools.describeGenes(snake.genes).join(", ");
    }

    return snake.genes.map(gene => gene.name).join(", ");
}

function renderWeightSheet() {
    const filteredSnakes = getFilteredSnakes();
    elements.date.textContent = new Date().toLocaleDateString();

    if (filteredSnakes.length === 0) {
        elements.body.innerHTML = `
            <tr>
                <td colspan="6">No snakes match the selected filters.</td>
            </tr>
        `;
        return;
    }

    elements.body.innerHTML = filteredSnakes.map(snake => `
        <tr>
            <td>${snake.binNumber || ""}</td>
            <td>${snake.sex || ""}</td>            
            <td>${snake.name || ""}</td>
            <td>${getSnakeGenes(snake)}</td>
            <td>${getLatestWeight(snake)}</td>
            <td class="new-weight-cell"></td>
        </tr>
    `).join("");
}

function printWeightSheet() {
    renderWeightSheet();
    window.print();
}

// ---- Clutch growth -------------------------------------------------------
// The weights of one clutch read against age rather than the calendar, so a
// hatchling that is behind its siblings stands out even if they were weighed
// on different days. The maths live in clutch-growth-helpers.js.

const CLUTCH_GROWTH_COLORS = [
    "#ffd700",
    "#7fd1ff",
    "#9ce37d",
    "#ff9f6e",
    "#d7a4ff",
    "#6ee7d7",
    "#ff8fb1",
    "#c9b458",
    "#8ab4ff",
    "#b5e61d"
];
const CLUTCH_GROWTH_EMPTY = `<p class="empty-message">No clutch selected.</p>`;

const clutchGrowthState = { clutchId: "" };

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function clutchGrowthTool() {
    return window.ClutchGrowth || null;
}

function clutchRecordsById() {
    const map = new Map();

    (Array.isArray(clutches) ? clutches : []).forEach(clutch => {
        const id = String(clutch && clutch.id || "").trim();

        if (id) {
            map.set(id, clutch);
        }
    });

    return map;
}

// A clutch only belongs on this page once it has hatchlings on record; a
// clutch still incubating has no weights to compare.
function getClutchGroups() {
    const records = clutchRecordsById();
    const groups = new Map();

    snakes.forEach(snake => {
        const clutchId = String(snake && snake.clutchId || "").trim();

        if (!clutchId) {
            return;
        }

        if (!groups.has(clutchId)) {
            groups.set(clutchId, {
                id: clutchId,
                clutch: records.get(clutchId) || null,
                hatchlings: 0
            });
        }

        groups.get(clutchId).hatchlings += 1;
    });

    return [...groups.values()].sort((left, right) =>
        left.id.localeCompare(right.id, undefined, { numeric: true })
    );
}

function clutchOptionLabel(group) {
    return `Clutch ${group.id} (${group.hatchlings} hatchling${group.hatchlings === 1 ? "" : "s"})`;
}

function populateClutchGrowthSelect(groups) {
    if (!elements.clutchSelect) {
        return;
    }

    if (groups.length === 0) {
        elements.clutchSelect.innerHTML = "";
        elements.clutchSelect.disabled = true;
        return;
    }

    elements.clutchSelect.disabled = false;
    elements.clutchSelect.innerHTML = groups
        .map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(clutchOptionLabel(group))}</option>`)
        .join("");
    elements.clutchSelect.value = clutchGrowthState.clutchId;
}

function clutchIdFromHash() {
    const match = /^#clutch-(.+)$/.exec(window.location.hash || "");

    if (!match) {
        return "";
    }

    try {
        return decodeURIComponent(match[1]).trim();
    } catch (error) {
        return match[1].trim();
    }
}

function initialClutchId(groups) {
    const fromHash = clutchIdFromHash();

    if (fromHash && groups.some(group => group.id === fromHash)) {
        return fromHash;
    }

    // Default to the newest clutch, which is the one being weighed this season.
    return groups.length > 0 ? groups[groups.length - 1].id : "";
}

function setClutchGrowthClutch(value) {
    const next = String(value || "").trim();

    if (next === clutchGrowthState.clutchId) {
        return;
    }

    clutchGrowthState.clutchId = next;

    if (elements.clutchSelect && elements.clutchSelect.value !== next) {
        elements.clutchSelect.value = next;
    }

    renderClutchGrowth();
}

window.setClutchGrowthClutch = setClutchGrowthClutch;

function formatAge(days) {
    return Number.isFinite(days) ? `${Math.round(days)} d` : "—";
}

function formatRate(rate) {
    if (!Number.isFinite(rate)) {
        return "—";
    }

    const rounded = Math.round(rate * 10) / 10;

    return `${rounded > 0 ? "+" : ""}${rounded} g/wk`;
}

function growthFlagChip(row) {
    if (!row.flag) {
        if (!row.latest) {
            return `<span class="clutch-growth-chip is-empty">No weigh-in</span>`;
        }

        return row.undated
            ? `<span class="clutch-growth-chip is-neutral">Current weight</span>`
            : `<span class="clutch-growth-chip is-neutral">Only weigh-in</span>`;
    }

    if (row.flag === "lagging") {
        return `<span class="clutch-growth-chip is-lagging">Lagging</span>`;
    }

    if (row.flag === "ahead") {
        return `<span class="clutch-growth-chip is-ahead">Ahead</span>`;
    }

    return `<span class="clutch-growth-chip is-track">On track</span>`;
}

function renderClutchGrowthChart(result) {
    const growth = clutchGrowthTool();

    if (!growth || !elements.clutchChart) {
        return;
    }

    if (!result.hatchDate) {
        elements.clutchChart.innerHTML = `<p class="empty-message">No hatch date on record, so the chart cannot place the weigh-ins by age. The table below still compares the latest weights.</p>`;
        return;
    }

    // A phone gets a narrower frame so the labels stay readable without
    // zooming the SVG down to a thumbnail.
    const narrow = window.innerWidth < 560;
    const laidOut = growth.layout(result.rows, narrow
        ? { width: 340, height: 250, padding: 34 }
        : { width: 460, height: 240, padding: 40 });
    const plotRows = result.rows.filter(row => row.agePoints.length > 0);

    if (laidOut.series.length === 0) {
        const hasUndatedWeight = result.rows.some(row => row && row.latest);

        elements.clutchChart.innerHTML = `<p class="empty-message">${hasUndatedWeight
            ? "None of this clutch's hatchlings has a dated weigh-in yet, so there is nothing to plot by age. The table below still compares the weights on record."
            : "None of this clutch's hatchlings has a weigh-in yet."}</p>`;
        return;
    }

    const colorFor = row => CLUTCH_GROWTH_COLORS[Math.max(0, plotRows.indexOf(row)) % CLUTCH_GROWTH_COLORS.length];
    const innerHeight = laidOut.height - laidOut.padding * 2;
    const midWeight = Math.round((laidOut.min + laidOut.max) / 2);
    const yFor = weight => laidOut.height - laidOut.padding
        - ((weight - laidOut.min) / Math.max(1, laidOut.max - laidOut.min)) * innerHeight;
    const yLabels = [laidOut.max, midWeight, laidOut.min].map(weight => `
        <text class="weight-chart-label" x="${laidOut.padding - 8}" y="${yFor(weight) + 4}"
            text-anchor="end">${weight}</text>
    `).join("");
    const gridLines = [laidOut.max, midWeight, laidOut.min].map(weight => `
        <line class="weight-chart-grid" x1="${laidOut.padding}" y1="${yFor(weight)}"
            x2="${laidOut.width - laidOut.padding}" y2="${yFor(weight)}" />
    `).join("");
    const xLabels = laidOut.ticks.map((tick, index) => {
        const isFirst = index === 0;
        const isLast = index === laidOut.ticks.length - 1 && !isFirst;

        return `
            <text class="weight-chart-label" x="${tick.x}" y="${laidOut.height - 10}"
                text-anchor="${isFirst ? "start" : (isLast ? "end" : "middle")}">${tick.label}</text>
        `;
    }).join("");
    const lines = plotRows.map((row, index) => {
        const points = laidOut.series[index] ? laidOut.series[index].points : [];
        const color = CLUTCH_GROWTH_COLORS[index % CLUTCH_GROWTH_COLORS.length];
        const path = points.map(point => `${point.x},${point.y}`).join(" ");
        const dots = points.map(point => `
            <circle class="clutch-growth-dot" cx="${point.x}" cy="${point.y}" r="3"
                style="fill: ${color};">
                <title>${escapeHtml(row.label)}: ${point.weight} g at ${point.age} d (${point.date})</title>
            </circle>
        `).join("");

        return `
            ${points.length > 1 ? `<polyline class="clutch-growth-line" points="${path}" style="stroke: ${color};" />` : ""}
            ${dots}
        `;
    }).join("");
    const legend = plotRows.map(row => `
        <span class="clutch-growth-key">
            <i class="clutch-growth-swatch" style="background-color: ${colorFor(row)};"></i>
            ${escapeHtml(row.label)}${row.ageDays !== null ? ` · ${formatAge(row.ageDays)}` : ""}
        </span>
    `).join("");
    const aria = `Weight by age for ${plotRows.length} hatchling${plotRows.length === 1 ? "" : "s"} of clutch ${result.clutchId}`;

    elements.clutchChart.innerHTML = `
        <div class="clutch-growth-legend">${legend}</div>
        <svg viewBox="0 0 ${laidOut.width} ${laidOut.height}" width="100%"
            role="img" aria-label="${escapeHtml(aria)}">
            ${gridLines}
            ${yLabels}
            ${lines}
            ${xLabels}
        </svg>
        <p class="clutch-growth-axis-note">Days since hatching · grams</p>
    `;
}

function renderClutchGrowthTable(result) {
    if (!elements.clutchBody) {
        return;
    }

    const plotRows = result.rows.filter(row => row.agePoints.length > 0);

    if (result.rows.length === 0) {
        elements.clutchBody.innerHTML = `
            <tr>
                <td colspan="5">No hatchlings are linked to this clutch yet.</td>
            </tr>
        `;
        return;
    }

    elements.clutchBody.innerHTML = result.rows.map(row => {
        const colorIndex = plotRows.indexOf(row);
        const swatch = colorIndex >= 0
            ? `<i class="clutch-growth-swatch" style="background-color: ${CLUTCH_GROWTH_COLORS[colorIndex % CLUTCH_GROWTH_COLORS.length]};"></i>`
            : `<i class="clutch-growth-swatch is-empty"></i>`;
        const idText = row.ID ? `<small>${escapeHtml(row.ID)}</small>` : "";
        const latest = row.latest
            ? `<strong>${row.latest.weight} g</strong><small>${row.latest.date ? escapeHtml(row.latest.date) : "no weigh-in date"}</small>`
            : "—";
        const ratio = Number.isFinite(row.ratio) ? `${Math.round(row.ratio * 100)}% of median` : "—";

        return `
            <tr class="${row.flag === "lagging" ? "is-lagging" : ""}">
                <td class="clutch-growth-name">${swatch}<span>${escapeHtml(row.label)}${idText}</span></td>
                <td data-label="Latest">${latest}</td>
                <td data-label="Age">${formatAge(row.ageDays)}</td>
                <td data-label="Growth">${formatRate(row.ratePerWeek)}</td>
                <td data-label="vs Clutch">${ratio}<br>${growthFlagChip(row)}</td>
            </tr>
        `;
    }).join("");
}

function renderClutchGrowth() {
    const growth = clutchGrowthTool();
    const groups = getClutchGroups();

    populateClutchGrowthSelect(groups);

    if (!elements.clutchVerdict || !elements.clutchBody) {
        return;
    }

    if (groups.length === 0) {
        clutchGrowthState.clutchId = "";
        elements.clutchVerdict.textContent = "No hatchlings are grouped into a clutch yet. Hatchlings get a clutch id when a clutch is recorded in Breeding Outcomes.";
        elements.clutchNote.hidden = true;
        elements.clutchChart.innerHTML = CLUTCH_GROWTH_EMPTY;
        elements.clutchBody.innerHTML = `
            <tr>
                <td colspan="5">Nothing to compare yet.</td>
            </tr>
        `;
        return;
    }

    if (!growth) {
        elements.clutchVerdict.textContent = "The clutch comparison could not load. Reload the page.";
        return;
    }

    const group = groups.find(item => item.id === clutchGrowthState.clutchId) || groups[groups.length - 1];

    clutchGrowthState.clutchId = group.id;

    const result = growth.compare(snakes, group.id, { clutch: group.clutch });

    elements.clutchVerdict.textContent = result.verdict;

    if (!result.hatchDate) {
        elements.clutchNote.hidden = false;
        elements.clutchNote.textContent = "Add a hatch date to the clutch (Breeding Outcomes) or to each hatchling record to place their weights by age.";
    } else if (result.hatchSource === "hatchlings") {
        elements.clutchNote.hidden = false;
        elements.clutchNote.textContent = `The clutch has no hatch date of its own, so ${result.hatchDate} is taken from the hatchling records.`;
    } else {
        elements.clutchNote.hidden = true;
        elements.clutchNote.textContent = "";
    }

    renderClutchGrowthChart(result);
    renderClutchGrowthTable(result);
}

// Rotating a phone changes the chart's frame, so redraw it.
let clutchResizeTimer = null;

function handleClutchResize() {
    if (clutchResizeTimer) {
        clearTimeout(clutchResizeTimer);
    }

    clutchResizeTimer = setTimeout(() => {
        clutchResizeTimer = null;
        renderClutchGrowth();
    }, 150);
}

function scrollToClutchGrowth() {
    const section = document.getElementById("clutchGrowthSection");

    if (section) {
        // Instant, not smooth: the hero image and fonts can still change the
        // layout, so this is corrected once more after they land.
        section.scrollIntoView({ block: "start", behavior: "auto" });
    }
}

function handleClutchHashChange() {
    const fromHash = clutchIdFromHash();

    if (!fromHash) {
        return;
    }

    const groups = getClutchGroups();

    if (groups.some(group => group.id === fromHash)) {
        setClutchGrowthClutch(fromHash);
        scrollToClutchGrowth();
    }
}

elements.sortInput.addEventListener("change", renderWeightSheet);
elements.sexFilter.addEventListener("change", renderWeightSheet);
elements.statusFilter.addEventListener("change", renderWeightSheet);
elements.printButton.addEventListener("click", printWeightSheet);
window.addEventListener("hashchange", handleClutchHashChange);
window.addEventListener("resize", handleClutchResize);

renderWeightSheet();

const startingClutchId = window.ClutchGrowth ? initialClutchId(getClutchGroups()) : "";

clutchGrowthState.clutchId = startingClutchId;
renderClutchGrowth();

// A link from a hatchling's own chart says "show me this clutch", so land on
// the comparison rather than the top of the print sheet.
if (startingClutchId && clutchIdFromHash() === startingClutchId) {
    scrollToClutchGrowth();

    // The logo and web fonts arrive after this script, and both push the page
    // down, so scroll again once the page has finished loading.
    if (document.readyState !== "complete") {
        window.addEventListener("load", scrollToClutchGrowth, { once: true });
    }

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scrollToClutchGrowth).catch(() => {});
    }
}
