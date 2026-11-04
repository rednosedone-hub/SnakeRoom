const snakes = window.SnakeData.loadSnakesWithIds([]);
let breedingPairs = window.SnakeData.readStorageArray("breedingPairs", []);
let clutches = window.SnakeData.readStorageArray("clutches", []);
let pendingClosePairId = "";

function migrateBreedingReferences() {
    let changedPairs = false;
    let changedClutches = false;

    breedingPairs = breedingPairs.map(pair => {
        const femaleSnakeId = pair.femaleSnakeId || snakes[pair.femaleIndex]?.id || "";
        const maleSnakeId = pair.maleSnakeId || snakes[pair.maleIndex]?.id || "";

        if (femaleSnakeId !== pair.femaleSnakeId || maleSnakeId !== pair.maleSnakeId) {
            changedPairs = true;
            return {
                ...pair,
                femaleSnakeId,
                maleSnakeId
            };
        }

        return pair;
    });

    clutches = clutches.map(clutch => {
        const femaleSnakeId = clutch.femaleSnakeId || snakes[clutch.femaleIndex]?.id || "";
        const maleSnakeId = clutch.maleSnakeId || snakes[clutch.maleIndex]?.id || "";

        if (femaleSnakeId !== clutch.femaleSnakeId || maleSnakeId !== clutch.maleSnakeId) {
            changedClutches = true;
            return {
                ...clutch,
                femaleSnakeId,
                maleSnakeId
            };
        }

        return clutch;
    });

    if (changedPairs) {
        saveStorageArray("breedingPairs", breedingPairs);
    }

    if (changedClutches) {
        saveStorageArray("clutches", clutches);
    }
}

function ensureClutchTokens() {
    let changed = false;

    clutches.forEach(clutch => {
        if (!clutch.clutchToken) {
            clutch.clutchToken = `tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
            changed = true;
        }
    });

    if (changed) {
        saveStorageArray("clutches", clutches);
    }
}

function saveStorageArray(key, items) {
    window.SnakeData.saveStorageArray(key, items);
}

function getTodayText() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getSnakeLabel(index) {
    return window.SnakeData.getSnakeLabelByReference(snakes, index);
}

function getExpectedHatchDate(layDate) {
    if (!layDate) {
        return "";
    }

    if (window.Incubation && window.Incubation.expectedHatchDate) {
        return window.Incubation.expectedHatchDate({ laidDate: layDate });
    }

    const date = new Date(layDate);
    date.setDate(date.getDate() + 55);

    return date.toISOString().split("T")[0];
}

function formatDate(dateText) {
    if (!dateText) {
        return "Not recorded";
    }

    return new Date(dateText).toLocaleDateString();
}

function getSnakeOptions(sex, selectId) {
    const select = document.getElementById(selectId);
    const previousValue = select ? select.value : "";
    const options = snakes
        .map((snake, index) => ({ snake, index }))
        .filter(item => window.SnakeData.isActiveSnake(item.snake))
        .filter(item => item.snake.sex === sex || item.snake.sex === "Unknown")
        .map(item => `
            <option value="${item.snake.id}">
                ${getSnakeLabel(item.snake.id)}
            </option>
        `)
        .join("");

    select.innerHTML = `<option value="">-- Select ${sex} --</option>${options}`;

    if (previousValue && select.querySelector(`option[value="${CSS.escape(previousValue)}"]`)) {
        select.value = previousValue;
    }
}

function setupSnakeSelects() {
    getSnakeOptions("Female", "femaleSelect");
    getSnakeOptions("Male", "maleSelect");
    document.getElementById("pairingDateInput").value = getTodayText();
}

function getPairings(pair) {
    if (Array.isArray(pair.pairings)) {
        return pair.pairings;
    }

    if (pair.pairingDate) {
        return [{ date: pair.pairingDate }];
    }

    return [];
}

// A pairing is either for sales or a step in a project toward a target morph.
// The scorecard reads this field to decide whether a low sales figure is a
// problem or simply the point.
function getPairPurpose(pair) {
    return String(pair && pair.purpose || "").toLowerCase() === "project" ? "project" : "sales";
}

function getPairPurposeLabel(pair) {
    return getPairPurpose(pair) === "project" ? "Project pairing" : "Sales pairing";
}

// A project pairing is judged on the morph it produced, not on the eggs that
// hatched: a healthy clutch can still miss the goal entirely, and the keeper
// needs to record that so the next step can be planned.
const PROJECT_OUTCOME_OPTIONS = [
    { key: "pending", label: "Not judged yet" },
    { key: "hit", label: "Goal hit" },
    { key: "partial", label: "Partial - kept something useful" },
    { key: "missed", label: "Missed - nothing to keep" }
];

const PROJECT_NEXT_OPTIONS = [
    { key: "undecided", label: "Not decided" },
    { key: "breed-back", label: "Keep and breed back" },
    { key: "repeat", label: "Repeat this pairing" },
    { key: "new-approach", label: "Try a different approach" },
    { key: "done", label: "Project complete" }
];

function getPairHatchlings(pair) {
    if (!pair) {
        return [];
    }

    const clutch = clutches.find(item => item && String(item.id || "") === String(pair.clutchId || ""));
    const token = clutch && clutch.clutchToken ? String(clutch.clutchToken) : "";
    const clutchId = String((clutch && clutch.id) || pair.clutchId || "");

    return snakes.filter(snake => {
        if (!snake || !window.SnakeData.isActiveSnake(snake)) {
            return false;
        }

        if (token && String(snake.clutchToken || "") === token) {
            return true;
        }

        return Boolean(clutchId) && String(snake.clutchId || "") === clutchId;
    });
}

function hatchlingOptionLabel(snake) {
    const name = snake.name || "Unnamed";
    const morph = snake.morph && snake.morph !== name ? ` - ${snake.morph}` : "";
    // A defective keeper is still the keeper's call, but not a silent one: the
    // dropdown names the problem so a kinked animal is not carried forward by
    // accident.
    const defects = window.SnakeDefects ? window.SnakeDefects.summary(snake) : "";

    return `${name}${morph}${defects ? ` - ${defects}` : ""}`;
}

// The plan for the next generation, recorded on the step that produced the
// keeper: which animal to hold back, and which gene or animal still has to be
// added before the next pairing can happen.
function pairProjectFields(pair) {
    const hatchlings = getPairHatchlings(pair);
    const outcome = String(pair.projectOutcome || "pending");
    const next = String(pair.projectNext || "undecided");
    const options = (list, selected) => list
        .map(option => `<option value="${option.key}" ${option.key === selected ? "selected" : ""}>${option.label}</option>`)
        .join("");

    return `
        <div class="pair-project-fields">
            <h5>Project Step</h5>
            <p class="empty-message">
                Judge this step on the morph it produced. The scorecard groups pairings by target
                morph and lists their steps in order.
            </p>

            <div class="form-grid">
                <label class="form-field">
                    <span>Step</span>
                    <input type="number" min="1" value="${Number(pair.projectStep) || ""}" placeholder="1"
                        onchange="updatePairField('${pair.id}', 'projectStep', this.value)">
                </label>

                <label class="form-field">
                    <span>Outcome</span>
                    <select onchange="updatePairField('${pair.id}', 'projectOutcome', this.value)">
                        ${options(PROJECT_OUTCOME_OPTIONS, outcome)}
                    </select>
                </label>

                <label class="form-field">
                    <span>What Hatched</span>
                    <input type="text" value="${escapePairText(pair.projectResult || "")}"
                        placeholder="e.g. Hurricane Clown, no Cypress or Pin"
                        onchange="updatePairField('${pair.id}', 'projectResult', this.value)">
                </label>

                <label class="form-field">
                    <span>What Was Missing</span>
                    <input type="text" value="${escapePairText(pair.projectMissing || "")}"
                        placeholder="e.g. Cypress, Pinstripe"
                        onchange="updatePairField('${pair.id}', 'projectMissing', this.value)">
                </label>

                <label class="form-field">
                    <span>Next Move</span>
                    <select onchange="updatePairField('${pair.id}', 'projectNext', this.value)">
                        ${options(PROJECT_NEXT_OPTIONS, next)}
                    </select>
                </label>

                <label class="form-field">
                    <span>Next-Step Note</span>
                    <input type="text" value="${escapePairText(pair.projectNextNote || "")}"
                        placeholder="e.g. Keep him and breed back to the mother when he is up to size"
                        onchange="updatePairField('${pair.id}', 'projectNextNote', this.value)">
                </label>

                <label class="form-field">
                    <span>Keeper Kept</span>
                    <select onchange="updatePairField('${pair.id}', 'nextKeeperId', this.value)">
                        <option value="">Not chosen yet</option>
                        ${hatchlings.map(snake => `
                            <option value="${snake.id}" ${String(pair.nextKeeperId || "") === String(snake.id) ? "selected" : ""}>
                                ${escapePairText(hatchlingOptionLabel(snake))}
                            </option>
                        `).join("")}
                    </select>
                    <small class="empty-message">${hatchlings.length > 0
                        ? "The animal from this clutch that carries the project on."
                        : "No hatchlings from this clutch are on record yet."}</small>
                </label>

                <label class="form-field">
                    <span>Next Step Needs</span>
                    <input type="text" value="${escapePairText(pair.nextNeeds || "")}"
                        placeholder="e.g. Yellow Belly or Banana Het Clown"
                        onchange="updatePairField('${pair.id}', 'nextNeeds', this.value)">
                </label>
            </div>

            <div class="card-buttons">
                <button type="button" class="edit-button" onclick="startProjectNextStep('${pair.id}')">
                    Start Next Step
                </button>
            </div>
        </div>
    `;
}

// Fill the new-pair form with the next step so it is a record, not a note: the
// keeper becomes one parent, the target and step carry over, and the missing
// partner is left for the keeper to choose (or to source later).
function startProjectNextStep(pairId) {
    const pair = breedingPairs.find(item => item.id === pairId);

    if (!pair) {
        return;
    }

    const keeper = pair.nextKeeperId
        ? window.SnakeData.getSnakeByReference(snakes, pair.nextKeeperId)
        : null;
    const nextStep = (Number(pair.projectStep) || 1) + 1;
    const hint = document.getElementById("projectNextHint");

    document.getElementById("pairPurposeInput").value = "project";
    document.getElementById("targetMorphInput").value = pair.targetMorph || "";
    document.getElementById("projectStepInput").value = nextStep;
    document.getElementById("femaleSelect").value = "";
    document.getElementById("maleSelect").value = "";

    if (keeper && keeper.sex === "Female") {
        document.getElementById("femaleSelect").value = keeper.id;
    } else if (keeper && keeper.sex === "Male") {
        document.getElementById("maleSelect").value = keeper.id;
    }

    if (hint) {
        hint.textContent = [
            `Step ${nextStep} toward ${pair.targetMorph || "the goal"}`,
            keeper ? `keeper ${keeper.name || "unnamed"} is set as a parent` : "",
            pair.nextNeeds ? `the other parent still needs ${pair.nextNeeds}` : ""
        ].filter(Boolean).join(" \u00b7 ")
            + ". Choose the other parent, then Save Pair. Until that animal is on hand the need stays recorded on the step.";
        hint.hidden = false;
    }

    renderPairCheck();
    document.getElementById("femaleSelect").scrollIntoView({ behavior: "smooth", block: "center" });
}

function getPairStatus(pair) {
    if (pair.clutchId) {
        return `Converted to ${pair.clutchId}`;
    }

    if (pair.eggsLaidDate) {
        return "Eggs laid";
    }

    if (pair.ovulationObserved || pair.ovulationDate) {
        return "Ovulated";
    }

    return "Paired";
}

function escapePairText(value) {
    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getPairParentSnake(reference, fallbackIndex) {
    const directMatch = window.SnakeData.getSnakeByReference(snakes, reference);
    const hasFallback = fallbackIndex !== null
        && fallbackIndex !== undefined
        && fallbackIndex !== ""
        && Number.isInteger(Number(fallbackIndex));

    return directMatch || (hasFallback ? snakes[Number(fallbackIndex)] || null : null);
}

function describeLineageEvent(event) {
    if (!event) {
        return "";
    }

    if (event.type === "proposed") {
        return `${event.female?.name || "Female"} × ${event.male?.name || "Male"} (${event.label.toLowerCase()})`;
    }

    const parents = (event.parents || []).map(snake => snake?.name || "Unnamed").join(" × ");

    return `${event.child?.name || "An ancestor"} came from ${parents} (${event.label.toLowerCase()})`;
}

function getLineageNotice(female, male) {
    if (!female || !male || !window.SnakeLineage) {
        return null;
    }

    const result = window.SnakeLineage.findCloseBreedings(female, male, snakes);

    if (!result.count) {
        return null;
    }

    const details = result.events.slice(0, 3).map(describeLineageEvent).filter(Boolean);
    const heading = result.multiple
        ? `Multiple close breedings in this pedigree (${result.count})`
        : "Close breeding in this pedigree";

    return {
        count: result.count,
        multiple: result.multiple,
        html: `
            <p class="pair-warning">
                <strong>${escapePairText(heading)}.</strong>
                ${escapePairText(details.join("; "))}${result.count > 3 ? ` and ${result.count - 3} more` : ""}.
                This is a notice, not a block: parent-offspring and sibling pairings are
                still available for proving out recessives.
            </p>
        `
    };
}

function getPairHealthNotices(female, male) {
    if (!window.SnakeHealth) {
        return [];
    }

    return [female, male]
        .filter(Boolean)
        .map(snake => ({ snake, quarantine: window.SnakeHealth.getQuarantineStatus(snake) }))
        .filter(item => item.quarantine.active)
        .map(item => `
            <p class="pair-warning">
                <strong>${escapePairText(item.snake.name || "A parent")} is in quarantine.</strong>
                ${escapePairText(item.quarantine.label)}${item.quarantine.end ? ` (expected release ${escapePairText(item.quarantine.end)})` : ""}.
            </p>
        `);
}

function getReadinessContext() {
    return { snakes, breedingPairs, clutches };
}

function getReadinessCheckHtml(check) {
    const detail = check.detail
        ? `<span class="readiness-check-detail">${escapePairText(check.detail)}</span>`
        : "";

    return `
        <li class="readiness-check is-${escapePairText(check.state)}">
            <span class="readiness-check-label">${escapePairText(check.label)}</span>
            ${detail}
        </li>
    `;
}

function getReadinessCardHtml(snake) {
    if (!snake || !window.SnakeReadiness) {
        return "";
    }

    const readiness = window.SnakeReadiness.getPairingReadiness(snake, getReadinessContext());
    const targetText = readiness.rules
        ? `${readiness.rules.minAgeLabel} / ${readiness.rules.minWeight}g minimum`
        : "Set sex to check minimums";
    const attentionChecks = readiness.checks.filter(check => check.state !== "pass");
    const attentionHtml = attentionChecks.length > 0
        ? `<ul class="readiness-attention-list">${attentionChecks.map(getReadinessCheckHtml).join("")}</ul>`
        : `<p class="readiness-clear">All readiness checks pass.</p>`;
    // The rise is good news, so it is not buried behind "View all checks".
    const weightTrendHtml = readiness.weightGain
        ? `<p class="readiness-weight-trend"><strong>${escapePairText(readiness.weightGain.summary)}</strong> \u00b7 ${escapePairText(readiness.weightGain.detail)}</p>`
        : "";

    return `
        <div class="readiness-card ${readiness.ready ? "is-ready" : "is-not-ready"}">
            <div class="readiness-card-header">
                <div>
                    <strong>${escapePairText(snake.name || "Unnamed snake")}</strong>
                    <span class="readiness-target">${escapePairText(readiness.sex || "Unknown sex")} \u00b7 ${escapePairText(targetText)}</span>
                </div>
                <span class="readiness-badge ${readiness.ready ? "readiness-badge-ready" : "readiness-badge-not"}">
                    ${escapePairText(readiness.label)}
                </span>
            </div>

            ${weightTrendHtml}

            ${attentionHtml}

            <details class="readiness-details">
                <summary>View all checks</summary>
                <ul class="readiness-check-list">
                    ${readiness.checks.map(getReadinessCheckHtml).join("")}
                </ul>
            </details>
        </div>
    `;
}

function getReadinessPanelHtml(female, male) {
    const cards = [female, male]
        .filter(Boolean)
        .map(getReadinessCardHtml)
        .filter(Boolean);

    if (cards.length === 0) {
        return "";
    }

    const parentReadiness = [female, male]
        .filter(Boolean)
        .map(snake => window.SnakeReadiness.getPairingReadiness(snake, getReadinessContext()));
    const readyCount = parentReadiness.filter(result => result.ready).length;
    const warningCount = parentReadiness.reduce((total, result) => total + result.warnings.length, 0);
    const readyWithNotes = readyCount === cards.length && warningCount > 0;
    const heading = cards.length === 1
        ? (readyCount === 1
            ? (readyWithNotes
                ? "This parent meets the core checks. Review the note below."
                : "This parent meets the pairing readiness checks.")
            : "Readiness is a guide, not a block. Review the checks for this parent.")
        : (readyCount === cards.length
            ? (readyWithNotes
                ? "Both parents meet the core checks. Review the notes below."
                : "Both parents meet the pairing readiness checks.")
            : "Readiness is a guide, not a block. Review the checks before saving this pair.");

    return `
        <div class="readiness-panel">
            <p class="readiness-panel-heading">${escapePairText(heading)}</p>
            <div class="readiness-card-grid">${cards.join("")}</div>
        </div>
    `;
}

function getReadinessBadgeHtml(snake) {
    const badge = window.SnakeReadiness && window.SnakeReadiness.getReadinessBadge
        ? window.SnakeReadiness.getReadinessBadge(snake, {
            ...getReadinessContext(),
            showNotReady: true
        })
        : null;

    if (!badge) {
        return "";
    }

    return `<span class="readiness-badge ${badge.className}" title="${escapePairText(badge.title)}">${escapePairText(badge.label)}</span>`;
}

function getPairReadinessLine(pair) {
    const female = getPairParentSnake(pair.femaleSnakeId, pair.femaleIndex);
    const male = getPairParentSnake(pair.maleSnakeId, pair.maleIndex);
    const badges = [
        { snake: female, label: "Female" },
        { snake: male, label: "Male" }
    ]
        .filter(item => item.snake)
        .map(item => `${escapePairText(item.label)}: ${getReadinessBadgeHtml(item.snake)}`)
        .filter(Boolean);

    return badges.length > 0
        ? `<p class="pair-readiness-line">${badges.join(" \u00b7 ")}</p>`
        : "";
}

// The shed, ovulation and egg estimate, when the pair has a pre-lay shed on
// record. The calendar carries the same dates as tasks; this line is the view
// a keeper sees while working the pair.
function getPairTimelineLine(pair) {
    const timeline = window.BreedingTimeline;

    // Once eggs are on record the clutch's own dates take over.
    if (!timeline || pair.clutchId || pair.eggsLaidDate) {
        return "";
    }

    const female = getPairParentSnake(pair.femaleSnakeId, pair.femaleIndex);
    const estimate = timeline.estimate(pair, female);

    if (!estimate) {
        return "";
    }

    const ovulation = estimate.ovulationObserved
        ? `Ovulation recorded ${estimate.ovulationDate}`
        : `Ovulation est. ${estimate.ovulationDate} (${estimate.ovulationFrom} to ${estimate.ovulationTo})`;
    const climb = timeline.describeClimb(estimate.weightClimb);

    return `<p class="pair-readiness-line">Timeline: ${escapePairText(ovulation)} \u00b7 eggs due est. ${escapePairText(estimate.layDate)} (${escapePairText(estimate.layFrom)} to ${escapePairText(estimate.layTo)}) \u00b7 ${escapePairText(climb)}</p>`;
}

function getTimelineCardFor(record) {
    const timeline = window.BreedingTimeline;

    if (!timeline || !timeline.card) {
        return null;
    }

    const female = getPairParentSnake(record.femaleSnakeId, record.femaleIndex);
    const incubationDays = window.Incubation && window.Incubation.incubationDays
        ? window.Incubation.incubationDays(record)
        : record.incubationDays;

    return timeline.card(record, female, { incubationDays });
}

function formatCardDate(value) {
    const date = window.BreedingTimeline && window.BreedingTimeline.parseDate(value);

    if (!date) {
        return "";
    }

    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function getTimelineRailStop(stage) {
    return `
        <div class="clutch-rail-stop${stage.observed ? " is-observed" : ""}">
            <span class="clutch-rail-label">${escapePairText(stage.label)}</span>
            <strong class="clutch-rail-date">${escapePairText(formatCardDate(stage.date) || "To come")}</strong>
        </div>
    `;
}

function getTimelineStageRow(stage) {
    const windowText = stage.from && stage.to
        ? `${formatCardDate(stage.from)} &ndash; ${formatCardDate(stage.to)}`
        : "&mdash;";

    return `
        <tr>
            <td>
                <strong>${escapePairText(stage.label)}</strong>
                <span class="clutch-stage-note">${escapePairText(stage.note)}</span>
            </td>
            <td>${formatCardDate(stage.date) || "&mdash;"}</td>
            <td>${windowText}</td>
            <td class="clutch-tick-cell">${stage.observed ? "&#10003;" : `<span class="clutch-tick-box"></span>`}</td>
        </tr>
    `;
}

// The card is built into its own sheet rather than printed from the breeding
// page itself: the print styles then hide the whole app and leave only paper.
function getTimelineCardHtml(record, options = {}) {
    const card = getTimelineCardFor(record);

    if (!card) {
        return "";
    }

    const timeline = window.BreedingTimeline;
    const femaleLabel = getSnakeLabel(record.femaleSnakeId || record.femaleIndex);
    const maleLabel = getSnakeLabel(record.maleSnakeId || record.maleIndex);
    const title = `${femaleLabel} x ${maleLabel}`;
    const pairings = Array.isArray(record.pairings) && record.pairings.length
        ? record.pairings.map(pairing => pairing && pairing.date).filter(Boolean)
        : (record.pairingDate ? [record.pairingDate] : []);
    const pairingText = pairings.map(formatCardDate).filter(Boolean).join(" \u00b7 ");
    const evidence = card.weightClimb
        ? `Weight climbed ${timeline.describeClimb(card.weightClimb)} before the shed.`
        : (card.shedDate
            ? "No weight climb on record before the shed, so the dates rest on the shed alone."
            : "");

    return `
        <article class="clutch-timeline-card">
            <header class="clutch-timeline-head">
                <div>
                    <p class="clutch-timeline-kicker">The Snake Room</p>
                    <h1>Clutch Timeline</h1>
                    <p class="clutch-timeline-pair">${escapePairText(title)}</p>
                    ${options.subtitle ? `<p class="clutch-timeline-subtitle">${escapePairText(options.subtitle)}</p>` : ""}
                </div>

                <div class="clutch-timeline-meta">
                    <p>Printed ${escapePairText(formatCardDate(getTodayText()))}</p>
                    ${card.eggCount ? `<p>${card.eggCount} egg${card.eggCount === 1 ? "" : "s"} on record</p>` : ""}
                </div>
            </header>

            <div class="clutch-timeline-rail">
                ${card.stages.map(getTimelineRailStop).join("")}
            </div>

            <table class="clutch-timeline-table">
                <thead>
                    <tr>
                        <th>Stage</th>
                        <th>Date</th>
                        <th>Window</th>
                        <th>Seen</th>
                    </tr>
                </thead>
                <tbody>${card.stages.map(getTimelineStageRow).join("")}</tbody>
            </table>

            <div class="clutch-timeline-notes">
                ${pairingText ? `<p><strong>Pairings:</strong> ${escapePairText(pairingText)}</p>` : ""}
                ${evidence ? `<p><strong>Evidence:</strong> ${escapePairText(evidence)}</p>` : ""}
                <p class="clutch-timeline-footnote">
                    ${card.stages.every(stage => stage.observed)
                        ? "Every date on this card is a recorded event."
                        : "An estimated date is the middle of the usual window, not a promise. Write the real date in the Seen column when it happens."}
                </p>
            </div>
        </article>
    `;
}

function getTimelinePrintButton(record, kind) {
    if (!getTimelineCardFor(record)) {
        return "";
    }

    return `
        <button type="button" class="gene-action-button" onclick="printClutchTimeline('${kind}', '${record.id}')">
            Print Timeline
        </button>
    `;
}

function clearClutchTimelinePrint() {
    document.body.classList.remove("printing-clutch-timeline");

    const sheet = document.getElementById("clutchTimelinePrintSheet");

    if (sheet) {
        sheet.innerHTML = "";
    }
}

function printClutchTimeline(kind, id) {
    const record = kind === "clutch"
        ? clutches.find(item => item.id === id)
        : breedingPairs.find(item => item.id === id);

    if (!record) {
        return;
    }

    const html = getTimelineCardHtml(record, kind === "clutch"
        ? { subtitle: `Clutch ${record.id}` }
        : { subtitle: "Pair in progress" });

    if (!html) {
        return;
    }

    let sheet = document.getElementById("clutchTimelinePrintSheet");

    if (!sheet) {
        sheet = document.createElement("div");
        sheet.id = "clutchTimelinePrintSheet";
        sheet.className = "clutch-print-sheet";
        document.body.appendChild(sheet);
    }

    sheet.innerHTML = html;
    document.body.classList.add("printing-clutch-timeline");
    window.print();
}

function renderPairCheck() {
    const container = document.getElementById("lineageWarning");
    const readinessContainer = document.getElementById("pairingReadiness");

    if (!container) {
        return;
    }

    const female = getPairParentSnake(document.getElementById("femaleSelect").value, null);
    const male = getPairParentSnake(document.getElementById("maleSelect").value, null);
    const readinessHtml = getReadinessPanelHtml(female, male);
    const notices = [...getPairHealthNotices(female, male)];
    const lineage = getLineageNotice(female, male);

    if (readinessContainer) {
        readinessContainer.hidden = readinessHtml === "";
        readinessContainer.innerHTML = readinessHtml;
    }

    if (lineage) {
        notices.unshift(lineage.html);
    }

    container.hidden = notices.length === 0;
    container.innerHTML = notices.join("");
}

function getPairNotices(pair) {
    const female = getPairParentSnake(pair.femaleSnakeId, pair.femaleIndex);
    const male = getPairParentSnake(pair.maleSnakeId, pair.maleIndex);
    const notices = [...getPairHealthNotices(female, male)];
    const lineage = getLineageNotice(female, male);

    if (lineage) {
        notices.unshift(lineage.html);
    }

    return notices.join("");
}

function saveBreedingPair() {
    const femaleSnakeId = document.getElementById("femaleSelect").value;
    const maleSnakeId = document.getElementById("maleSelect").value;

    if (femaleSnakeId === "" || maleSnakeId === "") {
        alert("Choose both a female and a male.");
        return;
    }

    const female = window.SnakeData.getSnakeByReference(snakes, femaleSnakeId);
    const male = window.SnakeData.getSnakeByReference(snakes, maleSnakeId);

    breedingPairs.push({
        id: `pair-${Date.now()}`,
        femaleSnakeId: female?.id || femaleSnakeId,
        maleSnakeId: male?.id || maleSnakeId,
        pairingDate: document.getElementById("pairingDateInput").value,
        pairings: document.getElementById("pairingDateInput").value
            ? [{ date: document.getElementById("pairingDateInput").value }]
            : [],
        ovulationObserved: Boolean(document.getElementById("ovulationObservedInput").checked),
        ovulationDate: document.getElementById("ovulationDateInput").value,
        preLayShedDate: document.getElementById("preLayShedDateInput").value,
        eggsLaidDate: document.getElementById("eggsLaidDateInput").value,
        eggCount: Number(document.getElementById("eggCountInput").value) || 0,
        purpose: getPairPurpose({ purpose: document.getElementById("pairPurposeInput").value }),
        targetMorph: document.getElementById("targetMorphInput").value.trim(),
        projectStep: Math.max(0, Math.round(Number(document.getElementById("projectStepInput").value))) || 0,
        clutchId: ""
    });

    saveStorageArray("breedingPairs", breedingPairs);
    clearPairForm();
    renderBreedingPairs();
}

function clearPairForm() {
    document.getElementById("femaleSelect").value = "";
    document.getElementById("maleSelect").value = "";
    document.getElementById("pairingDateInput").value = getTodayText();
    document.getElementById("ovulationObservedInput").checked = false;
    document.getElementById("ovulationDateInput").value = "";
    document.getElementById("preLayShedDateInput").value = "";
    document.getElementById("eggsLaidDateInput").value = "";
    document.getElementById("eggCountInput").value = "";
    document.getElementById("pairPurposeInput").value = "sales";
    document.getElementById("targetMorphInput").value = "";
    document.getElementById("projectStepInput").value = "";
    const nextHint = document.getElementById("projectNextHint");

    if (nextHint) {
        nextHint.hidden = true;
        nextHint.textContent = "";
    }

    renderPairCheck();
}

function updatePairField(pairId, fieldName, value) {
    const pair = breedingPairs.find(item => item.id === pairId);

    if (!pair) {
        return;
    }

    if (fieldName === "eggCount" || fieldName === "projectStep") {
        pair[fieldName] = Math.max(0, Math.round(Number(value))) || 0;
    } else if (fieldName === "ovulationObserved") {
        pair[fieldName] = Boolean(value);
    } else {
        pair[fieldName] = value;
    }
    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
}

function addPairingDate(pairId) {
    const pair = breedingPairs.find(item => item.id === pairId);
    const input = document.getElementById(`pairingDate-${pairId}`);

    if (!pair || !input || !input.value) {
        alert("Enter a pairing date first.");
        return;
    }

    pair.pairings = getPairings(pair);
    pair.pairings.push({ date: input.value });
    pair.pairings.sort((a, b) => new Date(a.date) - new Date(b.date));
    pair.pairingDate = pair.pairings[0]?.date || "";

    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
}

function removePairingDate(pairId, pairingIndex) {
    const pair = breedingPairs.find(item => item.id === pairId);

    if (!pair) {
        return;
    }

    pair.pairings = getPairings(pair);
    pair.pairings.splice(pairingIndex, 1);
    pair.pairingDate = pair.pairings[0]?.date || "";

    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
}

function getNextClutchId(laidDate) {
    const year = (laidDate || getTodayText()).slice(0, 4);
    const usedIds = new Set([
        ...clutches.map(clutch => String(clutch.id || "")),
        ...breedingPairs.map(pair => String(pair.clutchId || ""))
    ]);
    let clutchNumber = 1;
    let clutchId = `${year}-${String(clutchNumber).padStart(2, "0")}`;

    // Count-based numbering can collide when an older clutch has no year field
    // (or a record was imported). Advance to the first unused id instead.
    while (usedIds.has(clutchId)) {
        clutchNumber += 1;
        clutchId = `${year}-${String(clutchNumber).padStart(2, "0")}`;
    }

    return clutchId;
}

function openClosePairModal(pairId) {
    const pair = breedingPairs.find(item => item.id === pairId);
    const modal = document.getElementById("closePairModal");
    const text = document.getElementById("closePairModalText");
    const reason = document.getElementById("closePairReasonInput");

    if (!pair || !modal || !text || !reason) {
        return;
    }

    const retiredParentText = describeRetiredParents(pair);

    pendingClosePairId = pairId;
    text.textContent = `${getSnakeLabel(pair.femaleSnakeId || pair.femaleIndex)} x ${getSnakeLabel(pair.maleSnakeId || pair.maleIndex)}${retiredParentText ? ` \u2014 retired parent: ${retiredParentText}.` : ""}`;
    reason.value = "";
    modal.style.display = "block";
    reason.focus();
}

function closeClosePairModal() {
    const modal = document.getElementById("closePairModal");

    pendingClosePairId = "";

    if (modal) {
        modal.style.display = "none";
    }
}

function confirmClosePair() {
    const pairId = pendingClosePairId;
    const reason = document.getElementById("closePairReasonInput");
    const reasonText = reason ? reason.value.trim() : "";

    closeClosePairModal();

    if (pairId) {
        closePair(pairId, reasonText);
    }
}

function closePair(pairId, reason = "") {
    const pair = breedingPairs.find(item => item.id === pairId);

    if (!pair || pair.clutchId || pair.closedAt) {
        return;
    }

    const retiredParentText = describeRetiredParents(pair);
    const typedReason = String(reason || "").trim();

    pair.closedAt = getTodayText();
    pair.closedReason = typedReason
        || (retiredParentText ? `Retired parent: ${retiredParentText}` : "Closed manually");
    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
    renderPairHistory();
}

function reopenPair(pairId) {
    const pair = breedingPairs.find(item => item.id === pairId);

    if (!pair || pair.clutchId) {
        return;
    }

    pair.closedAt = "";
    pair.closedReason = "";
    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
    renderPairHistory();
}

function convertPairToClutch(pairId) {
    const pair = breedingPairs.find(item => item.id === pairId);

    if (!pair) {
        return;
    }

    if (!pair.eggsLaidDate) {
        alert("Enter an eggs laid date before converting to a clutch.");
        return;
    }

    if (pair.clutchId) {
        alert("This pair has already been converted to a clutch.");
        return;
    }

    const clutchId = getNextClutchId(pair.eggsLaidDate);

    clutches.push({
        id: clutchId,
        clutchToken: `tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        year: pair.eggsLaidDate.slice(0, 4),
        femaleSnakeId: pair.femaleSnakeId || "",
        maleSnakeId: pair.maleSnakeId || "",
        pairingDate: pair.pairingDate,
        pairings: getPairings(pair),
        ovulationObserved: Boolean(pair.ovulationObserved),
        ovulationDate: pair.ovulationDate,
        preLayShedDate: pair.preLayShedDate || "",
        laidDate: pair.eggsLaidDate,
        eggCount: pair.eggCount,
        hatchedDate: "",
        hatchlingCount: 0,
        convertedToSnakes: false
    });

    pair.clutchId = clutchId;
    saveStorageArray("clutches", clutches);
    saveStorageArray("breedingPairs", breedingPairs);
    renderBreedingPairs();
    renderPairHistory();
    renderClutches();
}

function goToBreedingOutcomes(clutchId) {
    window.location.href = `breedingOutcomes.html#clutch-${encodeURIComponent(clutchId)}`;
}

function getRetiredParents(pair) {
    return [
        window.SnakeData.getSnakeByReference(snakes, pair.femaleSnakeId || pair.femaleIndex),
        window.SnakeData.getSnakeByReference(snakes, pair.maleSnakeId || pair.maleIndex)
    ].filter(snake => snake && window.SnakeData.isRetiredSnake(snake));
}

function describeRetiredParents(pair) {
    return getRetiredParents(pair)
        .map(snake => `${snake.name || "Unnamed"} (${snake.status})`)
        .join(" and ");
}

function renderBreedingPairs() {
    const list = document.getElementById("breedingPairsList");
    const activePairs = breedingPairs.filter(pair => !pair.clutchId && !pair.closedAt);
    const convertedCount = breedingPairs.filter(pair => pair.clutchId).length;
    const closedCount = breedingPairs.filter(pair => !pair.clutchId && pair.closedAt).length;
    const historyNote = [
        convertedCount > 0
            ? `${convertedCount} converted pair${convertedCount === 1 ? "" : "s"} kept under Clutches`
            : "",
        closedCount > 0
            ? `${closedCount} closed pair${closedCount === 1 ? "" : "s"} kept under Pair History`
            : ""
    ].filter(Boolean).join(" \u00b7 ");

    if (activePairs.length === 0) {
        list.innerHTML = `<p class="empty-message">No active breeding pairs.${historyNote ? ` ${historyNote}.` : ""}</p>`;
        return;
    }

    const historyHtml = historyNote
        ? `<p class="empty-message">${historyNote}.</p>`
        : "";

    list.innerHTML = historyHtml + activePairs.map(pair => {
        const retiredParentText = describeRetiredParents(pair);

        return `
        <div class="breeding-card">
            <div>
                <h4>${getSnakeLabel(pair.femaleSnakeId || pair.femaleIndex)} x ${getSnakeLabel(pair.maleSnakeId || pair.maleIndex)}</h4>
                <p>Status: ${getPairStatus(pair)}</p>
                <p>
                    Purpose: ${getPairPurposeLabel(pair)}${pair.targetMorph
                        ? ` &middot; toward ${escapePairText(pair.targetMorph)}`
                        : ""}
                </p>
                <p>Pairings: ${getPairings(pair).length || "None recorded"}</p>
                ${getPairReadinessLine(pair)}
                ${getPairTimelineLine(pair)}
            </div>

            ${retiredParentText ? `
                <p class="pair-warning">
                    <strong>Retired parent:</strong> ${retiredParentText}. This pair is still
                    active; close it when it should leave the breeding list.
                </p>
            ` : ""}

            ${getPairNotices(pair)}

            <div class="breeding-event-list">
                ${getPairings(pair).length
                    ? getPairings(pair).map((pairing, index) => `
                        <div class="breeding-event-item">
                            <span>${pairing.date}</span>
                            <button type="button" class="gene-action-button"
                                onclick="removePairingDate('${pair.id}', ${index})">
                                Remove
                            </button>
                        </div>
                    `).join("")
                    : `<p class="empty-message">No pairing dates recorded.</p>`}
            </div>

            <div class="form-grid">
                <label class="form-field">
                    <span>Add Pairing Date</span>
                    <input type="date" id="pairingDate-${pair.id}">
                </label>

                <div class="form-field">
                    <span>&nbsp;</span>
                    <button type="button" class="gene-action-button" 
                        onclick="addPairingDate('${pair.id}')">
                        Add Pairing
                    </button>
                </div>

                <label class="form-field checkbox-field">
                    <span>Ovulation Observed</span>
                    <input type="checkbox" ${pair.ovulationObserved ? "checked" : ""}
                        onchange="updatePairField('${pair.id}', 'ovulationObserved', this.checked)">
                </label>

                <label class="form-field">
                    <span>Ovulation Date</span>
                    <input type="date" value="${pair.ovulationDate || ""}"
                        onchange="updatePairField('${pair.id}', 'ovulationDate', this.value)">
                </label>

                <label class="form-field">
                    <span>Pre-Lay Shed</span>
                    <input type="date" value="${pair.preLayShedDate || ""}"
                        onchange="updatePairField('${pair.id}', 'preLayShedDate', this.value)">
                </label>

                <label class="form-field">
                    <span>Eggs Laid</span>
                    <input type="date" value="${pair.eggsLaidDate || ""}"
                        onchange="updatePairField('${pair.id}', 'eggsLaidDate', this.value)">
                </label>

                <label class="form-field">
                    <span>Egg Count</span>
                    <input type="number" min="0" value="${pair.eggCount || ""}"
                        onchange="updatePairField('${pair.id}', 'eggCount', this.value)">
                </label>

                <label class="form-field">
                    <span>Purpose</span>
                    <select onchange="updatePairField('${pair.id}', 'purpose', this.value)">
                        <option value="sales" ${getPairPurpose(pair) === "sales" ? "selected" : ""}>Sales pairing</option>
                        <option value="project" ${getPairPurpose(pair) === "project" ? "selected" : ""}>Project pairing</option>
                    </select>
                </label>

                <label class="form-field">
                    <span>Target Morph</span>
                    <input type="text" value="${escapePairText(pair.targetMorph || "")}"
                        placeholder="e.g. Hurricane Cypress Pin Clown"
                        onchange="updatePairField('${pair.id}', 'targetMorph', this.value)">
                </label>
            </div>

            ${getPairPurpose(pair) === "project" ? pairProjectFields(pair) : ""}

            <div class="card-buttons">
                ${getTimelinePrintButton(pair, "pair")}

                <button type="button" class="archive-button" onclick="openClosePairModal('${pair.id}')">
                    Close Pair
                </button>

                <button type="button" class="edit-button" onclick="convertPairToClutch('${pair.id}')">
                    Convert To Clutch
                </button>
            </div>
        </div>
    `;
    }).join("");
}

function renderPairHistory() {
    const list = document.getElementById("pairHistoryList");

    if (!list) {
        return;
    }

    const closedPairs = breedingPairs.filter(pair => !pair.clutchId && pair.closedAt);

    if (closedPairs.length === 0) {
        list.innerHTML = `<p class="empty-message">No closed pairs yet.</p>`;
        return;
    }

    list.innerHTML = closedPairs.map(pair => {
        const retiredParentText = describeRetiredParents(pair);

        return `
            <div class="breeding-card closed-pair-card">
                <div>
                    <h4>${getSnakeLabel(pair.femaleSnakeId || pair.femaleIndex)} x ${getSnakeLabel(pair.maleSnakeId || pair.maleIndex)}</h4>
                    <p>Status: Closed${pair.closedAt ? ` on ${pair.closedAt}` : ""}</p>
                    <p>Reason: ${pair.closedReason || "Not recorded"}</p>
                    <p>Pairings: ${getPairings(pair).length || "None recorded"}</p>

                    ${retiredParentText ? `
                        <p class="pair-warning"><strong>Retired parent:</strong> ${retiredParentText}.</p>
                    ` : ""}
                </div>

                <div class="card-buttons">
                    <button type="button" class="edit-button" onclick="reopenPair('${pair.id}')">
                        Reopen Pair
                    </button>

                    ${pair.eggsLaidDate ? `
                        <button type="button" class="archive-button" onclick="convertPairToClutch('${pair.id}')">
                            Convert To Clutch
                        </button>
                    ` : ""}
                </div>
            </div>
        `;
    }).join("");
}

function renderClutches() {
    const list = document.getElementById("clutchList");

    if (clutches.length === 0) {
        list.innerHTML = `<p class="empty-message">No clutches yet.</p>`;
        return;
    }

    list.innerHTML = clutches.map(clutch => {
        const isHatched = Boolean(clutch.convertedToSnakes || clutch.hatchedDate);
        // A converted pair keeps its purpose and target on the pair record, so a
        // project started from a pairing can still be relabelled after the egg
        // date has passed.
        const linkedPair = breedingPairs.find(item => item.clutchId === clutch.id) || null;
        // The number to expect before hatching, the number that actually came
        // out afterwards. Twins mean the second can be larger than the eggs.
        const expected = clutch.expectedHatchlings;
        const hatchlingValue = isHatched
            ? String(clutch.hatchlingCount || 0)
            : (expected === undefined || expected === null || expected === "" ? "" : String(expected));

        return `
        <div class="breeding-card" id="clutchCard-${clutch.id}">
            <div>
                <h4>${clutch.id}</h4>
                <p>${getSnakeLabel(clutch.femaleSnakeId || clutch.femaleIndex)} x ${getSnakeLabel(clutch.maleSnakeId || clutch.maleIndex)}</p>
                <p>Pairings: ${Array.isArray(clutch.pairings) ? clutch.pairings.map(pairing => pairing.date).join(", ") : clutch.pairingDate || "Not recorded"}</p>
                <p>Ovulation: ${clutch.ovulationObserved ? "Observed" : "Not marked"}${clutch.ovulationDate ? ` on ${clutch.ovulationDate}` : ""}</p>
                <p>Pre-lay shed: ${clutch.preLayShedDate || "Not recorded"}</p>
                <p>Laid: ${clutch.laidDate || "Not recorded"} / Eggs: ${clutch.eggCount || 0}</p>
                ${linkedPair ? `<p>Purpose: ${getPairPurposeLabel(linkedPair)}${linkedPair.targetMorph
                    ? ` &middot; toward ${escapePairText(linkedPair.targetMorph)}`
                    : ""}</p>` : ""}
                <p>${clutch.convertedToSnakes
                    ? `Hatched ${clutch.hatchlingCount || 0} hatchlings on ${clutch.hatchedDate || "not recorded"}. Record kept as history.`
                    : clutch.laidDate
                        ? `Waiting to hatch. Expected around ${getExpectedHatchDate(clutch.laidDate)}`
                        : "Waiting to hatch"}</p>
            </div>

            <div class="form-grid">
                <label class="form-field">
                    <span>Hatch Date</span>
                    <input type="date" id="hatchDate-${clutch.id}" value="${clutch.hatchedDate || ""}"
                        ${clutch.convertedToSnakes ? "disabled" : ""}>
                </label>

                <label class="form-field">
                    <span>${isHatched ? "Hatchling Count" : "Hatchlings Expected"}</span>
                    <input type="number" min="0" id="hatchCount-${clutch.id}"
                        placeholder="${clutch.eggCount || 0} eggs"
                        value="${hatchlingValue}"
                        onchange="updateClutchHatchlingCount('${clutch.id}', this.value)">
                    <small class="empty-message">${isHatched ? "More than the eggs means twins." : "Leave blank to use the egg count."}</small>
                </label>

                ${linkedPair ? `
                <label class="form-field">
                    <span>Purpose</span>
                    <select onchange="updatePairField('${linkedPair.id}', 'purpose', this.value)">
                        <option value="sales" ${getPairPurpose(linkedPair) === "sales" ? "selected" : ""}>Sales pairing</option>
                        <option value="project" ${getPairPurpose(linkedPair) === "project" ? "selected" : ""}>Project pairing</option>
                    </select>
                </label>

                <label class="form-field">
                    <span>Target Morph</span>
                    <input type="text" value="${escapePairText(linkedPair.targetMorph || "")}"
                        placeholder="e.g. Hurricane Cypress Pin Clown"
                        onchange="updatePairField('${linkedPair.id}', 'targetMorph', this.value)">
                </label>
                ` : ""}
            </div>

            ${linkedPair && getPairPurpose(linkedPair) === "project" ? pairProjectFields(linkedPair) : ""}

            <div class="card-buttons">
                ${getTimelinePrintButton(clutch, "clutch")}

                <button type="button" class="edit-button" onclick="goToBreedingOutcomes('${clutch.id}')">
                    ${clutch.convertedToSnakes ? "View Outcomes" : "Record Hatch"}
                </button>

                <button type="button" class="archive-button" onclick="deleteClutch('${clutch.id}')">
                    Delete Clutch
                </button>
            </div>
        </div>
    `;
    }).join("");
}

// A converted pair is linked by clutchId, so deleting the clutch hands the pair
// back to the active list instead of leaving it pointing at a missing record.
function releasePairFromClutch(clutch) {
    let changed = false;

    breedingPairs.forEach(pair => {
        if (pair.clutchId && pair.clutchId === clutch.id) {
            pair.clutchId = "";
            changed = true;
        }
    });

    if (changed) {
        saveStorageArray("breedingPairs", breedingPairs);
    }
}

function updateClutchHatchlingCount(clutchId, value) {
    const clutch = clutches.find(item => item.id === clutchId);

    if (!clutch) {
        return;
    }

    const count = Math.min(60, Math.max(0, Math.round(Number(value)) || 0));

    if (clutch.convertedToSnakes || clutch.hatchedDate) {
        clutch.hatchlingCount = count;
    } else {
        clutch.expectedHatchlings = count;
    }

    saveStorageArray("clutches", clutches);
    renderClutches();
}

function deleteClutch(clutchId) {
    const clutch = clutches.find(item => item.id === clutchId);

    if (!clutch) {
        return;
    }

    const hatchlings = snakes.filter(snake => snake.clutchId === clutch.id);
    const lines = [
        `Delete clutch ${clutch.id}?`,
        "The clutch record is removed and its pair goes back to the active list.",
        "This cannot be undone."
    ];

    if (hatchlings.length > 0) {
        lines.splice(2, 0, `${hatchlings.length} hatchling record${hatchlings.length === 1 ? "" : "s"} came from this clutch.`);
    }

    if (!confirm(lines.join("\n\n"))) {
        return;
    }

    let removeHatchlings = false;

    if (hatchlings.length > 0) {
        removeHatchlings = confirm(
            `Also delete the ${hatchlings.length} hatchling record${hatchlings.length === 1 ? "" : "s"} from your collection?\n\n` +
            "OK deletes them. Cancel keeps them as animals in the collection."
        );
    }

    clutches = clutches.filter(item => item !== clutch);
    releasePairFromClutch(clutch);

    saveStorageArray("clutches", clutches);

    if (removeHatchlings) {
        const remaining = snakes.filter(snake => !hatchlings.includes(snake));

        snakes.length = 0;
        remaining.forEach(snake => snakes.push(snake));
        window.SnakeData.saveStorageArray("snakes", snakes);
    }

    renderBreedingPairs();
    renderPairHistory();
    renderClutches();
}

window.saveBreedingPair = saveBreedingPair;
window.updatePairField = updatePairField;
window.addPairingDate = addPairingDate;
window.removePairingDate = removePairingDate;
window.convertPairToClutch = convertPairToClutch;
window.closePair = closePair;
window.openClosePairModal = openClosePairModal;
window.closeClosePairModal = closeClosePairModal;
window.confirmClosePair = confirmClosePair;
window.reopenPair = reopenPair;
window.goToBreedingOutcomes = goToBreedingOutcomes;
window.updateClutchHatchlingCount = updateClutchHatchlingCount;
window.deleteClutch = deleteClutch;
window.printClutchTimeline = printClutchTimeline;

const closePairModal = document.getElementById("closePairModal");

if (closePairModal) {
    closePairModal.addEventListener("click", event => {
        if (event.target === closePairModal) {
            closeClosePairModal();
        }
    });
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeClosePairModal();
    }
});

window.addEventListener("afterprint", clearClutchTimelinePrint);

setupSnakeSelects();
migrateBreedingReferences();
ensureClutchTokens();

["femaleSelect", "maleSelect"].forEach(id => {
    const select = document.getElementById(id);
    if (select) select.addEventListener("change", renderPairCheck);
});

renderPairCheck();
renderBreedingPairs();
renderPairHistory();
renderClutches();
