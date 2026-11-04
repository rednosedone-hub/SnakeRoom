// pair-scorecard.js
// The Pair & Clutch Scorecard page. Every number comes from
// PairScorecard.scorecard(), so the readout, the cards and the clutch table can
// never disagree about the same record.

(function () {
    const S = window.PairScorecard;
    const F = window.SnakeFinance;

    const data = {
        snakes: [],
        pairs: [],
        clutches: [],
        settings: { currency: "CAD" }
    };

    const elements = {
        refreshButton: document.getElementById("scorecardRefreshButton"),
        verdict: document.getElementById("scorecardVerdict"),
        kpis: document.getElementById("scorecardKpis"),
        projectsSection: document.getElementById("scorecardProjectsSection"),
        projects: document.getElementById("scorecardProjects"),
        pairGrid: document.getElementById("scorecardPairGrid"),
        pairEmpty: document.getElementById("scorecardPairEmpty"),
        clutchBody: document.getElementById("scorecardClutchBody"),
        clutchTableWrap: document.getElementById("scorecardClutchTableWrap"),
        clutchCards: document.getElementById("scorecardClutchCards"),
        clutchEmpty: document.getElementById("scorecardClutchEmpty"),
        status: document.getElementById("scorecardStatus")
    };

    function escapeHtml(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatMoney(value) {
        if (F && typeof F.formatMoney === "function") {
            return F.formatMoney(value, data.settings.currency);
        }

        return `$${(Number(value) || 0).toFixed(2)}`;
    }

    function formatDate(value, short = true) {
        if (!value) {
            return "—";
        }

        const date = new Date(`${value}T00:00:00`);

        if (Number.isNaN(date.getTime())) {
            return escapeHtml(value);
        }

        return date.toLocaleDateString(undefined, short
            ? { month: "short", day: "numeric", year: "numeric" }
            : { year: "numeric", month: "long", day: "numeric" });
    }

    function snakeLink(id, name) {
        const label = escapeHtml(name || "Unnamed");

        return id
            ? `<a href="snake-form.html?uid=${encodeURIComponent(id)}">${label}</a>`
            : label;
    }

    function loadAll() {
        data.snakes = window.SnakeData.loadSnakesWithIds([]);
        data.pairs = window.SnakeData.readStorageArray("breedingPairs", []);
        data.clutches = window.SnakeData.readStorageArray("clutches", []);

        if (F && typeof F.getSettings === "function") {
            data.settings = F.getSettings() || data.settings;
        }
    }

    function renderVerdict(result) {
        if (!elements.verdict) {
            return;
        }

        const insights = result.insights;

        elements.verdict.className = `season-verdict season-verdict-${insights.tone}`;
        elements.verdict.innerHTML = `
            <h4>${escapeHtml(insights.headline)}</h4>
            <p>${escapeHtml(insights.detail || "")}</p>
        `;
    }

    function renderKpis(result) {
        if (!elements.kpis) {
            return;
        }

        const totals = result.totals;
        const kpis = [
            {
                label: "Pairings",
                value: String(totals.pairs),
                note: `${totals.scoredPairs} scored · ${totals.workingPairs} working`
            },
            {
                label: "Healthy hatch",
                value: totals.cleanRate === null ? "—" : `${totals.cleanRate}%`,
                note: totals.completedEggs > 0
                    ? `${totals.healthy} of ${totals.completedEggs} eggs${totals.defective > 0 ? ` · ${totals.defective} with defects` : ""}`
                    : "No hatched clutch yet"
            },
            {
                label: "Clutches",
                value: String(totals.clutches),
                note: totals.incubating > 0
                    ? `${totals.incubating} still incubating`
                    : "None incubating"
            },
            {
                label: "Hatchlings",
                value: String(totals.hatched),
                note: `${totals.counts.sold} sold · ${totals.counts.retained} kept${totals.defective > 0 ? ` · ${totals.defective} defective` : ""}`
            },
            {
                label: "Value / clutch",
                value: totals.valuePerClutch === null ? "—" : formatMoney(totals.valuePerClutch),
                note: totals.completedClutches > 0
                    ? `sales per hatched clutch, before costs`
                    : "No hatched clutch yet"
            },
            {
                label: "Sales",
                value: totals.revenue > 0 ? formatMoney(totals.revenue) : "—",
                note: totals.hatched > 0 && totals.revenue > 0
                    ? `${formatMoney(totals.revenue / totals.hatched)} per hatchling`
                    : "No sales recorded"
            }
        ];

        if (totals.projectPairs > 0) {
            kpis.push({
                label: "Project steps",
                value: `${totals.projectSteps}/${totals.projectPairs}`,
                note: `${totals.projectHits} hit · ${totals.projectPartials} partial · ${totals.projectMisses} missed`
            });
        }

        elements.kpis.innerHTML = kpis.map(kpi => `
            <div class="fin-kpi">
                <span class="fin-kpi-label">${escapeHtml(kpi.label)}</span>
                <strong class="fin-kpi-value">${escapeHtml(kpi.value)}</strong>
                <span class="fin-kpi-note">${escapeHtml(kpi.note)}</span>
            </div>
        `).join("");
    }

    function statCell(label, value, note) {
        return `
            <div class="scorecard-stat">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
                <em>${escapeHtml(note)}</em>
            </div>
        `;
    }

    function pairCard(row) {
        const grade = row.grade;
        const percentage = row.cleanRate === null ? 0 : Math.max(0, Math.min(100, row.cleanRate));
        const defectLine = row.defective > 0
            ? `<p class="scorecard-defects">
                    <strong>${row.defective} of ${row.hatched} hatchlings</strong> had a recorded defect
                    ${row.defectBreakdown.length > 0 ? `(${row.defectBreakdown.map(item => `${escapeHtml(item.label)}${item.count > 1 ? ` x${item.count}` : ""}`).join(", ")})` : ""}.
                    The grade counts healthy hatchlings only.
                </p>`
            : "";
        const clutchNote = row.incubating > 0
            ? `${row.completed} hatched · ${row.incubating} incubating`
            : `${row.completed} hatched`;
        const activity = [
            `${row.pairings} pairing date${row.pairings === 1 ? "" : "s"}`,
            row.lastLaidDate ? `last clutch ${formatDate(row.lastLaidDate)}` : "",
            row.status === "closed" && row.closedAt ? `closed ${formatDate(row.closedAt)}` : ""
        ].filter(Boolean).join(" · ");

        return `
            <article class="scorecard-pair${row.attention ? " is-attention" : ""}">
                <div class="scorecard-pair-head">
                    <div>
                        <h4>${snakeLink(row.femaleId, row.femaleName || row.label.split(" x ")[0])}
                            <span class="scorecard-cross">x</span>
                            ${snakeLink(row.maleId, row.maleName || "")}</h4>
                        <p class="scorecard-pair-status is-${escapeHtml(row.verdict.key)}">
                            ${escapeHtml(row.verdict.label)}
                            <span class="scorecard-purpose is-${escapeHtml(row.purpose)}"
                                title="${escapeHtml(row.purposeNote)}">${escapeHtml(row.purposeLabel)}</span>
                        </p>
                        ${row.purpose === "project" || row.targetMorph ? `
                            <p class="scorecard-target">
                                Target: ${row.targetMorph
                                    ? `<a href="goalPlanner.html">${escapeHtml(row.targetMorph)}</a>`
                                    : "not named yet"}
                            </p>
                        ` : ""}
                        ${row.purpose === "project" && row.judged ? `
                            <p class="scorecard-project-step">
                                ${row.step ? `<span class="scorecard-step-no">Step ${row.step}</span>` : ""}
                                <span class="scorecard-outcome is-${escapeHtml(row.outcome)}">${escapeHtml(row.outcomeLabel)}</span>
                                ${row.nextLabel ? `<span class="scorecard-next">Next: ${escapeHtml(row.nextLabel)}</span>` : ""}
                            </p>
                        ` : ""}
                        ${row.purpose === "project" && (row.nextKeeper || row.nextNeeds) ? `
                            <p class="scorecard-target">
                                ${row.nextKeeper
                                    ? `Keeper: ${escapeHtml(row.nextKeeper)}${row.nextKeeperDefects.length > 0 ? ` (${row.nextKeeperDefects.map(escapeHtml).join(", ")})` : ""}`
                                    : ""}${row.nextKeeper && row.nextNeeds ? " \u00b7 " : ""}${row.nextNeeds ? `Next step needs: ${escapeHtml(row.nextNeeds)}` : ""}
                            </p>
                        ` : ""}
                    </div>

                    <span class="scorecard-grade is-${escapeHtml(grade.key)}"
                        title="${escapeHtml(grade.note)}">${escapeHtml(grade.label)}</span>
                </div>

                <div class="scorecard-stats">
                    ${statCell(
                        "Hatch rate",
                        row.hatchRate === null ? "—" : `${row.hatchRate}%`,
                        row.completedEggs > 0
                            ? (row.defective > 0
                                ? `${row.hatched} hatched · ${row.healthy} healthy`
                                : `${row.hatched} of ${row.completedEggs} eggs`)
                            : "No eggs counted"
                    )}
                    ${statCell("Clutches", String(row.clutches), clutchNote)}
                    ${statCell(
                        "Hatchlings",
                        String(row.hatched),
                        row.hatchlingsPerClutch === null ? "None yet" : `${row.hatchlingsPerClutch} per hatched clutch`
                    )}
                    ${statCell(
                        "Sales / clutch",
                        row.revenuePerClutch === null ? "—" : formatMoney(row.revenuePerClutch),
                        row.revenuePerClutch === null ? "No hatched clutch" : "before costs"
                    )}
                    ${statCell(
                        "Kept",
                        String(row.counts.retained),
                        `${row.counts.sold} sold`
                    )}
                    ${statCell(
                        "Sales",
                        row.revenue > 0 ? formatMoney(row.revenue) : "—",
                        row.valuePerHatchling ? `${formatMoney(row.valuePerHatchling)} per hatchling` : "No sales"
                    )}
                </div>

                ${defectLine}

                <div class="scorecard-meter" role="img"
                    aria-label="Healthy hatch rate ${row.cleanRate === null ? "not scored" : `${row.cleanRate} percent`}">
                    <span class="scorecard-meter-fill is-${escapeHtml(grade.key)}"
                        style="width: ${percentage}%"></span>
                </div>

                <p class="scorecard-note">${escapeHtml(row.verdict.note)}</p>

                <p class="scorecard-meta">${escapeHtml(activity)}</p>
            </article>
        `;
    }

    function projectCard(project) {
        const steps = project.steps.map(step => `
            <li class="scorecard-project-step">
                <span class="scorecard-step-no">${step.step ? `Step ${step.step}` : "Unsorted"}</span>
                <span class="scorecard-outcome is-${escapeHtml(step.outcome)}">${escapeHtml(step.outcomeLabel)}</span>
                <strong>${escapeHtml(step.label)}</strong>
                ${step.result ? `<p>Hatched: ${escapeHtml(step.result)}</p>` : ""}
                ${step.missing ? `<p>Missing: ${escapeHtml(step.missing)}</p>` : ""}
                ${step.nextKeeper
                    ? `<p>Keeper: ${escapeHtml(step.nextKeeper)}${step.nextKeeperDefects.length > 0 ? ` (${step.nextKeeperDefects.map(escapeHtml).join(", ")})` : ""}</p>`
                    : ""}
                ${step.defective > 0 ? `<p>Defects: ${step.defective} of ${step.hatched} hatchlings${step.defectBreakdown.length > 0 ? ` — ${step.defectBreakdown.map(item => `${escapeHtml(item.label)}${item.count > 1 ? ` x${item.count}` : ""}`).join(", ")}` : ""}</p>` : ""}
                ${step.nextNeeds ? `<p>Next step needs: ${escapeHtml(step.nextNeeds)}</p>` : ""}
                ${step.nextLabel ? `<p>Next: ${escapeHtml(step.nextLabel)}${step.nextNote ? ` — ${escapeHtml(step.nextNote)}` : ""}</p>` : ""}
            </li>
        `).join("");

        return `
            <article class="scorecard-project">
                <header class="scorecard-project-head">
                    <div>
                        <h4>${escapeHtml(project.target)}</h4>
                        <p class="scorecard-project-meta">
                            ${project.count} pairing${project.count === 1 ? "" : "s"} · ${project.keepers} kept${project.defective > 0 ? ` · ${project.defective} with defects` : ""}
                        </p>
                    </div>
                    <span class="scorecard-outcome is-${escapeHtml(project.status)}">${escapeHtml(project.statusLabel)}</span>
                </header>
                <ol class="scorecard-project-steps">${steps}</ol>
            </article>
        `;
    }

    function renderProjects(result) {
        if (!elements.projectsSection || !elements.projects) {
            return;
        }

        const projects = result.projects || [];

        elements.projectsSection.hidden = projects.length === 0;
        elements.projects.innerHTML = projects.map(projectCard).join("");
    }

    function renderPairs(result) {
        if (!elements.pairGrid) {
            return;
        }

        elements.pairGrid.innerHTML = result.pairs.map(pairCard).join("");

        if (elements.pairEmpty) {
            elements.pairEmpty.hidden = result.pairs.length > 0;
        }
    }

    function clutchRow(clutch) {
        const hatched = clutch.isHatched
            ? formatDate(clutch.hatchedDate || clutch.laidDate)
            : "Incubating";

        return `
            <tr>
                <td><strong>${escapeHtml(clutch.id || "Clutch")}</strong></td>
                <td>${escapeHtml(clutch.pair)}</td>
                <td>${formatDate(clutch.laidDate)}</td>
                <td>${hatched}</td>
                <td class="fin-amount-cell">${clutch.eggs}</td>
                <td class="fin-amount-cell">${clutch.isHatched ? clutch.hatched : "—"}</td>
                <td class="fin-amount-cell">${clutch.defective > 0 ? clutch.defective : "—"}</td>
                <td class="fin-amount-cell" title="${clutch.hatchRate === null ? "Not hatched" : `${clutch.hatchRate}% of the eggs hatched`}">
                    ${clutch.cleanRate === null ? "—" : `${clutch.cleanRate}%`}
                </td>
                <td class="fin-amount-cell">
                    <span class="scorecard-grade is-${escapeHtml(clutch.grade.key)}"
                        title="${escapeHtml(clutch.grade.note)}">${escapeHtml(clutch.grade.label)}</span>
                </td>
                <td class="fin-amount-cell">${clutch.revenue > 0 ? formatMoney(clutch.revenue) : "—"}</td>
            </tr>
        `;
    }

    function clutchCard(clutch) {
        const dates = clutch.isHatched
            ? `Laid ${formatDate(clutch.laidDate)} · hatched ${formatDate(clutch.hatchedDate || clutch.laidDate)}`
            : `Laid ${formatDate(clutch.laidDate)} · incubating`;
        const counts = [
            `${clutch.eggs} egg${clutch.eggs === 1 ? "" : "s"}`,
            clutch.isHatched ? `${clutch.hatched} hatched` : "",
            clutch.defective > 0 ? `${clutch.defective} with defects` : "",
            clutch.unhatched > 0 ? `${clutch.unhatched} did not hatch` : "",
            `${clutch.counts.retained} kept`,
            `${clutch.counts.sold} sold`
        ].filter(Boolean).join(" · ");

        return `
            <div class="season-clutch-card">
                <div class="season-clutch-card-head">
                    <strong>${escapeHtml(clutch.id || "Clutch")}</strong>
                    <span>${escapeHtml(clutch.pair)}</span>
                    <span class="scorecard-grade is-${escapeHtml(clutch.grade.key)}"
                        title="${escapeHtml(clutch.grade.note)}">${escapeHtml(clutch.grade.label)}</span>
                </div>
                <p>${dates}</p>
                <p>${counts}</p>
                <p>${clutch.hatchRate === null ? "No hatch rate yet" : `${clutch.hatchRate}% hatch rate`}
                    ${clutch.cleanRate === null ? "" : ` · ${clutch.cleanRate}% healthy`}
                    ${clutch.valuePerHatchling ? ` · ${formatMoney(clutch.valuePerHatchling)} per hatchling` : ""}</p>
                ${clutch.defective > 0
                    ? `<p class="scorecard-defects">${clutch.defectBreakdown.map(item => `${escapeHtml(item.label)}${item.count > 1 ? ` x${item.count}` : ""}`).join(", ")}</p>`
                    : ""}
                ${clutch.revenue > 0 ? `<p class="season-clutch-card-sales">${formatMoney(clutch.revenue)} in sales</p>` : ""}
            </div>
        `;
    }

    function renderClutches(result) {
        if (elements.clutchBody) {
            elements.clutchBody.innerHTML = result.clutches.map(clutchRow).join("");
        }

        if (elements.clutchCards) {
            elements.clutchCards.innerHTML = result.clutches.map(clutchCard).join("");
        }

        if (elements.clutchTableWrap) {
            elements.clutchTableWrap.hidden = result.clutches.length === 0;
        }

        if (elements.clutchEmpty) {
            elements.clutchEmpty.hidden = result.clutches.length > 0;
        }
    }

    function render() {
        if (!S) {
            if (elements.status) {
                elements.status.textContent = "The scorecard tools did not load. Refresh the page.";
            }

            return;
        }

        loadAll();

        const result = S.scorecard({
            snakes: data.snakes,
            pairs: data.pairs,
            clutches: data.clutches
        });

        renderVerdict(result);
        renderKpis(result);
        renderProjects(result);
        renderPairs(result);
        renderClutches(result);

        return result;
    }

    function refresh() {
        const result = render();

        if (elements.status) {
            elements.status.textContent = result
                ? `Scored ${result.totals.pairs} pairing${result.totals.pairs === 1 ? "" : "s"} and ${result.totals.clutches} clutch${result.totals.clutches === 1 ? "" : "es"} from this device's records.`
                : "";
        }
    }

    if (elements.refreshButton) {
        elements.refreshButton.addEventListener("click", refresh);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", refresh);
    } else {
        refresh();
    }
})();
