// Goal Planner: work backwards from a dream morph to the animals you need.
//
// Type in what you want to breed (e.g. "Batman"), and the planner:
//   1. translates each word of the goal into genes and combo names from the
//      gene catalog,
//   2. scans your whole collection to count how many animals already carry
//      each piece,
//   3. shows what you still need to source,
//   4. lets you map the path as steps: any pairing between two snakes you own,
//      between a snake you own and an animal you still need, or two animals
//      you need.
//
// Pairing math reuses the morph calculator engine, so chance percentages are
// the same ones the Morph Calculator page reports.

const snakes = window.SnakeData.loadSnakesWithIds([]);

let goals = window.SnakeData.readStorageArray("breedingGoals", []);

let activeGoalId = "";

const goalInput = document.getElementById("goalInput");
const goalCreationPanel = document.getElementById("goalCreationPanel");
const goalList = document.getElementById("goalList");
const goalDetailSection = document.getElementById("goalDetailSection");
const goalDetail = document.getElementById("goalDetail");

function saveGoals() {
    window.SnakeData.saveStorageArray("breedingGoals", goals);
}

function createGoal() {
    const goalText = goalInput.value.trim();

    if (!goalText) {
        alert("Enter the morph you want to breed.");
        return;
    }

    const pieces = decodeGoalPieces(goalText);

    if (pieces.length === 0) {
        alert(`Could not match "${goalText}" to any gene or combo name. Add the genes to the gene catalog first, or list the genes the morph is made of.`);
        return;
    }

    const goal = {
        id: `goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        goalText,
        pieces,
        steps: []
    };

    goals.push(goal);
    saveGoals();

    goalInput.value = "";
    goalCreationPanel.style.display = "none";
    goalCreationPanel.innerHTML = "";

    renderGoalList();
    renderGoalDetail(goal.id);
    goalDetailSection.scrollIntoView({ behavior: "smooth" });
}

function toggleGoalCreation() {
    const goalText = goalInput.value.trim();

    if (!goalText) {
        alert("Enter the morph you want to breed.");
        return;
    }

    const pieces = decodeGoalPieces(goalText);

    if (pieces.length === 0) {
        alert(`Could not match "${goalText}" to any gene or combo name. Add the genes to the gene catalog first, or list the genes the morph is made of.`);
        return;
    }

    if (goalCreationPanel.style.display !== "none") {
        goalCreationPanel.style.display = "none";
        return;
    }

    const snakeMatches = buildSnakeMatches(pieces);

    // Row: how much of each piece you already have.
    const pieceRows = pieces.map((piece, index) => {
        const gene = window.GeneTools.findGene(piece.gene);
        const label = getPieceLabel(piece, gene);
        const visualCount = snakeMatches.filter(entry => entry.matches[index] === "Visual").length;
        const carrierCount = snakeMatches.filter(entry => entry.matches[index] === "Het").length;
        const holders = visualCount + carrierCount;

        const holderText = holders === 0
            ? "No animals carry this gene yet."
            : `You have ${visualCount} visual${visualCount === 1 ? "" : "s"} and ${carrierCount} het${carrierCount === 1 ? "" : "s"} on hand.`;

        return `
            <div class="goal-piece-preview">
                <span class="goal-chip">${escapeHtml(label)}</span>
                <span class="goal-hint">${escapeHtml(holderText)}</span>
            </div>
        `;
    }).join("");

    goalCreationPanel.innerHTML = `
        <div class="goal-detail-header">
            <h4>Planning to breed: ${escapeHtml(goalText)}</h4>
            <p class="goal-hint">Goal broken into ${pieces.length} gene piece${pieces.length === 1 ? "" : "s"} (change this later by editing your gene catalog or creating the goal):</p>
            ${pieceRows}
            <button class="goal-add-step" onclick="createGoal()">Create this goal</button>
        </div>
    `;
    goalCreationPanel.style.display = "block";
}

function deleteGoal(goalId) {
    if (!confirm("Remove this goal and its path from the planner?")) {
        return;
    }

    goals = goals.filter(goal => goal.id !== goalId);

    if (activeGoalId === goalId) {
        activeGoalId = "";
        goalDetailSection.style.display = "none";
        goalDetail.innerHTML = "";
    }

    saveGoals();
    renderGoalList();
}

function getGoal(goalId) {
    return goals.find(goal => goal.id === goalId);
}

// ---- Goal decoding

function decodeGoalPieces(goalText) {
    const wanted = [];
    const lowerText = goalText.toLowerCase();
    const usedSpans = [];

    // 1. Try long combo names from the shared combo table (e.g. Batman,
    //    BEL (Blue Eyed Leucistic), Killer Bee).
    Object.entries(window.GeneTools.comboNames)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([geneKey, comboLabel]) => {
            const lowerLabel = comboLabel.toLowerCase();
            const index = lowerText.indexOf(lowerLabel);

            if (index === -1) {
                return;
            }

            const overlaps = usedSpans.some(span =>
                index < span.end && index + lowerLabel.length > span.start
            );

            if (overlaps) {
                return;
            }

            usedSpans.push({ start: index, end: index + lowerLabel.length });

            geneKey.split(",").forEach(part => {
                const geneName = part.trim();

                if (geneName && !wanted.some(piece => piece.gene === geneName)) {
                    const gene = window.GeneTools.findGene(geneName);

                    wanted.push({
                        gene: geneName,
                        copies: 1,
                        recessive: gene?.type === "recessive"
                    });
                }
            });
        });

    // 2. Then match remaining words to exact (or unique prefix) gene names.
    goalText
        .split(/[,\s]+/)
        .filter(Boolean)
        .forEach(word => {
            const lowerWord = word.toLowerCase();
            const inSpan = usedSpans.some(span => {
                const before = lowerText.slice(0, lowerText.indexOf(lowerWord));
                const after = lowerText.indexOf(lowerWord) + lowerWord.length;

                return before.length >= span.start - 1 && after <= span.end + 1;
            });

            if (inSpan) {
                return;
            }

            const exact = window.GeneTools.catalog.find(gene =>
                gene.name.toLowerCase() === lowerWord
            );
            const prefixMatches = exact
                ? []
                : window.GeneTools.catalog.filter(gene =>
                    gene.name.toLowerCase().startsWith(lowerWord)
                );

            const gene = exact || (prefixMatches.length === 1 ? prefixMatches[0] : null);

            if (gene && !wanted.some(piece => piece.gene === gene.name)) {
                wanted.push({
                    gene: gene.name,
                    copies: 1,
                    recessive: gene.type === "recessive"
                });
            }
        });

    return wanted;
}

function getPieceLabel(piece, gene) {
    if (!gene) {
        return piece.gene;
    }

    if (gene.type === "recessive") {
        return `${piece.gene} (Visual / Het)`;
    }

    return piece.gene;
}

// ---- Collection scanning

function getSnakeGeneCount(snake, piece) {
    const gene = window.GeneTools.findGene(piece.gene);
    const geneRecord = (snake.genes || []).find(geneRecord =>
        geneRecord.name.toLowerCase() === piece.gene.toLowerCase()
    );

    if (!geneRecord) {
        return "None";
    }

    if (gene?.type === "recessive") {
        return geneRecord.copies === 2 ? "Visual" : "Het";
    }

    return geneRecord.copies === 2 ? "Visual" : "Visual";
}

function buildSnakeMatches(pieces) {
    return snakes.map(snake =>
        ({ snake, matches: pieces.map(piece => getSnakeGeneCount(snake, piece)) })
    );
}

// ---- Slot helper: owned animals vs animals you still need

function slotLabel(slot) {
    if (slot.type === "snake") {
        const snake = window.SnakeData.getSnakeByReference(snakes, slot.snakeId);

        if (!snake) {
            return slot.label || "Missing snake";
        }

        return `${snake.name || "Unnamed"} + ${window.SnakeData.getSnakeIdentityText(snake)}`;
    }

    return `Needed: ${slot.label}`;
}

function slotGenes(slot) {
    if (slot.type === "snake") {
        const snake = window.SnakeData.getSnakeByReference(snakes, slot.snakeId);

        return snake ? (snake.genes || []) : [];
    }

    return inferSlotGenes(slot.label);
}

// Guess which genes an animal "you need" carries based on its label text (e.g.
// "Mojave Het Clown NI animal" or "Super Pastel"). Visual forms count as 2
// copies, het forms as 1.
function inferSlotGenes(label) {
    const text = String(label).toLowerCase();
    const genes = [];

    window.GeneTools.catalog.forEach(gene => {
        const plainName = gene.name.toLowerCase();
        const superName = (gene.superName || `super ${plainName}`).toLowerCase();

        if (text.includes(superName) && superName !== plainName) {
            genes.push({ name: gene.name, copies: 2, type: gene.type });
            return;
        }

        if (text.includes(`super ${plainName}`)) {
            genes.push({ name: gene.name, copies: 2, type: gene.type });
            return;
        }

        if (text.includes(`${plainName} visual`)) {
            genes.push({ name: gene.name, copies: 2, type: gene.type });
            return;
        }

        if (text.includes(`${plainName} het`)) {
            genes.push({ name: gene.name, copies: 1, type: "recessive" });
            return;
        }

        if (text.includes(plainName)) {
            genes.push({ name: gene.name, copies: 1, type: gene.type });
        }
    });

    // Combo-name labels (e.g. someone types "BEL (Blue Eyed Leucistic) NI").
    Object.entries(window.GeneTools.comboNames).forEach(([geneKey, comboLabel]) => {
        if (text.includes(comboLabel.toLowerCase())) {
            geneKey.split(",").forEach(part => {
                const geneName = part.trim();

                if (geneName && !genes.some(gene => gene.name === geneName)) {
                    const gene = window.GeneTools.findGene(geneName);

                    genes.push({
                        name: geneName,
                        copies: 1,
                        type: gene ? gene.type : "codom"
                    });
                }
            });
        }
    });

    return genes;
}

// ---- Path steps

function slotValueToSlot(selectValue) {
    if (!selectValue) {
        return null;
    }

    if (selectValue.startsWith("snake:")) {
        return { type: "snake", snakeId: selectValue.slice(6), label: "" };
    }

    if (selectValue.startsWith("need:")) {
        return { type: "need", label: selectValue.slice(5) };
    }

    return null;
}

function addStep(goalId, femaleValue, maleValue) {
    const goal = getGoal(goalId);

    if (!goal) {
        return;
    }

    const female = slotValueToSlot(femaleValue);
    const male = slotValueToSlot(maleValue);

    if (!female || !male) {
        alert("Choose both a female and a male for this step.");
        return;
    }

    goal.steps.push({
        id: `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        done: false,
        notes: "",
        female,
        male
    });

    saveGoals();
    renderGoalDetail(goalId);
}

function toggleStepDone(goalId, stepId) {
    const goal = getGoal(goalId);
    const step = goal?.steps.find(item => item.id === stepId);

    if (!goal || !step) {
        return;
    }

    step.done = !step.done;
    saveGoals();
    renderGoalDetail(goalId);
}

function removeStep(goalId, stepId) {
    const goal = getGoal(goalId);

    if (!goal) {
        return;
    }

    goal.steps = goal.steps.filter(step => step.id !== stepId);
    saveGoals();
    renderGoalDetail(goalId);
}

function editStepNotes(goalId, stepId) {
    const goal = getGoal(goalId);
    const step = goal?.steps.find(item => item.id === stepId);

    if (!goal || !step) {
        return;
    }

    const result = prompt("Step notes (prices, breeder contacts, deadlines):", step.notes || "");

    if (result === null) {
        return;
    }

    step.notes = result.trim();
    saveGoals();
    renderGoalDetail(goalId);
}

// ---- Pairing simulations

function outcomePieceHits(outcome, pieces) {
    return pieces.map(piece => {
        const record = outcome.geneDetails.find(gene =>
            gene.name.toLowerCase() === piece.gene.toLowerCase()
        );
        const present = Boolean(record) && record.copies !== 0;
        const full = Boolean(record) && (piece.recessive ? record.copies === 2 : record.copies >= 1);

        return { present, full };
    });
}

function evaluatePairing(femaleSlot, maleSlot, pieces) {
    let outcomes = [];

    try {
        outcomes = window.MorphCalculator.calculatePairing(
            slotGenes(femaleSlot),
            slotGenes(maleSlot)
        ) || [];
    } catch (error) {
        outcomes = [];
    }

    const hits = outcomes.map(outcome => outcomePieceHits(outcome, pieces));

    const goalProbability = outcomes.reduce((sum, outcome, index) =>
        hits[index].every(hit => hit.full) ? sum + outcome.probability : sum, 0);

    const partialProbability = outcomes.reduce((sum, outcome, index) =>
        !hits[index].every(hit => hit.full) && hits[index].some(hit => hit.present)
            ? sum + outcome.probability
            : sum, 0);

    let bestIndex = -1;
    let bestFullCount = -1;
    let bestPresentCount = -1;

    hits.forEach((hitGroup, index) => {
        const fullCount = hitGroup.filter(hit => hit.full).length;
        const presentCount = hitGroup.filter(hit => hit.present).length;

        if (fullCount > bestFullCount
            || (fullCount === bestFullCount
                && presentCount > bestPresentCount)) {
            bestFullCount = fullCount;
            bestPresentCount = presentCount;
            bestIndex = index;
        }
    });

    return {
        bestOutcome: bestIndex >= 0 ? outcomes[bestIndex] : null,
        bestFullCount: Math.max(bestFullCount, 0),
        bestPresentCount: Math.max(bestPresentCount, 0),
        goalProbability,
        partialProbability,
        outcomes
    };
}

function formatMismatch(evaluation, pieces) {
    if (!evaluation.bestOutcome) {
        return "";
    }

    const missing = evaluation.bestOutcome.geneDetails
        .filter(gene => {
            const piece = pieces.find(item =>
                item.gene.toLowerCase() === gene.name.toLowerCase()
            );

            if (!piece) {
                return false;
            }

            return gene.copies === 0 || (piece.recessive && gene.copies !== 2);
        })
        .map(gene => gene.label);

    if (missing.length === 0) {
        return "";
    }

    return `Best pairing still missing: ${missing.join(", ")}`;
}

function formatWarnings(outcome) {
    if (!outcome || outcome.warnings.length === 0) {
        return "";
    }

    return `Warning: ${outcome.warnings.join(" ")}`;
}

// ---- Rendering: goal list

function openGoal(goalId) {
    activeGoalId = goalId;
    renderGoalDetail(goalId);
}

function renderGoalList() {
    if (goals.length === 0) {
        goalList.innerHTML = `<p class="empty-message">No goals yet. Type a morph above to start planning.</p>`;
        return;
    }

    goalList.innerHTML = goals.map(goal => {
        const achieved = goalIdAchieved(goal);

        return `
            <div class="goal-card ${goal.id === activeGoalId ? "goal-card-active" : ""}">
                <button class="goal-card-button" onclick="openGoal('${goal.id}')">
                    <span class="goal-card-name">${escapeHtml(goal.goalText)}${achieved ? " 🏆" : ""}</span>
                    <span class="goal-card-meta">${goal.steps.length} step${goal.steps.length === 1 ? "" : "s"}</span>
                </button>
                <button class="goal-card-remove" onclick="deleteGoal('${goal.id}')" title="Remove goal">&#10005;</button>
            </div>
        `;
    }).join("");
}

function goalIdAchieved(goal) {
    return goal.steps.some(step =>
        step.done && evaluatePairing(step.female, step.male, goal.pieces).goalProbability > 0
    );
}

// ---- Rendering: goal detail

function buildSlotOptions(pieces, kind) {
    const sex = kind === "female" ? "Female" : "Male";
    const options = [];

    snakes
        .filter(snake => snake.sex === sex || snake.sex === "Unknown")
        .forEach(snake => {
            options.push(`
                <option value="snake:${snake.id}">
                    ${escapeHtml(`${snake.name || "Unnamed"} + ${window.SnakeData.getSnakeIdentityText(snake)}`)}
                </option>
            `);
        });

    options.push(`<option value="need:NI animal">NI animal</option>`);
    options.push(`<option value="need:Buy new animal">Need to buy</option>`);
    pieces.forEach(piece => {
        options.push(`<option value="need:Het ${piece.gene} NI">${escapeHtml(`Need to buy Het ${piece.gene} NI animal`)}</option>`);
        options.push(`<option value="need:Visual ${piece.gene} NI">${escapeHtml(`Need to buy Visual ${piece.gene} NI animal`)}</option>`);
    });

    return options.join("");
}

function buildStepCard(goal, step, index) {
    const evaluation = evaluatePairing(step.female, step.male, goal.pieces);
    const best = evaluation.bestOutcome;
    const mismatch = formatMismatch(evaluation, goal.pieces);
    const warning = formatWarnings(best);
    const predictions = (evaluation.outcomes || [])
        .slice(0, 8)
        .map(outcome => {
            // Skip gene breakdowns that just repeat the morph name.
            const breakdown = outcome.genes.filter(gene => gene !== outcome.morphName);

            return `
            <div class="goal-prediction-row">
                <span class="goal-chip">${escapeHtml(outcome.morphName)}</span>
                <span class="goal-prediction-chance">${(outcome.probability * 100).toFixed(1)}%</span>
            </div>
            ${breakdown.length > 0 ? `<div class="goal-hint">${escapeHtml(breakdown.join(" · "))}</div>` : ""}
        `;
        }).join("");

    return `
        <div class="goal-step-card ${step.done ? "goal-step-done" : ""}">
            <div class="goal-step-header">
                <span class="goal-step-title">Step ${index + 1}: ${escapeHtml(slotLabel(step.female))} &times; ${escapeHtml(slotLabel(step.male))}</span>
                <span class="goal-step-toggle">
                    <button class="goal-add-step ${step.done ? "" : "goal-step-not-done"}" onclick="toggleStepDone('${goal.id}', '${step.id}')">${step.done ? "Done &#10003;" : "Mark done"}</button>
                    <button class="goal-add-step" onclick="editStepNotes('${goal.id}', '${step.id}')">Notes</button>
                    <button class="goal-card-remove-inline" onclick="removeStep('${goal.id}', '${step.id}')" title="Remove step">&#10005;</button>
                </span>
            </div>
            ${evaluation.goalProbability > 0
            ? `<p class="goal-go"><strong>This step can produce the goal!</strong> Chance: ${(evaluation.goalProbability * 100).toFixed(1)}% of the clutch.</p>`
            : ""}
            ${mismatch ? `<p class="goal-warn">${escapeHtml(mismatch)}</p>` : ""}
            ${warning ? `<p class="goal-warn">${escapeHtml(warning)}</p>` : ""}
            ${step.notes ? `<p class="goal-hint">Notes: ${escapeHtml(step.notes)}</p>` : ""}
            <div class="goal-predictions">${predictions}</div>
        </div>
    `;
}

function renderGoalDetail(goalId) {
    const goal = getGoal(goalId);

    if (!goal) {
        return;
    }

    activeGoalId = goalId;
    goalDetailSection.style.display = "block";

    const pieces = goal.pieces;
    const snakeMatches = buildSnakeMatches(pieces);

    // Collection scan table: piece -> Visual / Het counts + labels.
    const scanRows = pieces.map((piece, index) => {
        const gene = window.GeneTools.findGene(piece.gene);
        const visualEntries = snakeMatches.filter(entry => entry.matches[index] === "Visual");
        const hetEntries = snakeMatches.filter(entry => entry.matches[index] === "Het");

        const visuals = visualEntries.map(entry =>
            window.SnakeData.getSnakeIdentityText(entry.snake)
        );
        const hets = hetEntries.map(entry =>
            window.SnakeData.getSnakeIdentityText(entry.snake)
        );

        return `
            <tr>
                <td>${escapeHtml(getPieceLabel(piece, gene))}</td>
                <td>${visuals.length > 0 ? escapeHtml(visuals.join(", ")) : "None"}</td>
                <td>${hets.length > 0 ? escapeHtml(hets.join(", ")) : (gene?.type === "recessive" ? "None" : "n/a")}</td>
            </tr>
        `;
    }).join("");

    // Path mapped so far.
    const stepsHtml = goal.steps.length > 0
        ? goal.steps.map((step, index) => buildStepCard(goal, step, index)).join("")
        : `<p class="empty-message">No steps mapped yet. Add the first pairing below, or let the planner suggest pairings.</p>`;

    // New-step chooser.
    const chooserHtml = `
        <div class="goal-step-form">
            <label class="form-field">
                <span class="goal-label-small">Female</span>
                <select id="goalFemaleSelect-${goal.id}">
                    <option value="">-- Choose female --</option>
                    ${buildSlotOptions(pieces, "female")}
                </select>
            </label>
            <label class="form-field">
                <span class="goal-label-small">Male</span>
                <select id="goalMaleSelect-${goal.id}">
                    <option value="">-- Choose male --</option>
                    ${buildSlotOptions(pieces, "male")}
                </select>
            </label>
            <button class="goal-add-step" onclick="addStepFromSelects('${goal.id}')">Add pairing step</button>
        </div>
    `;

    const achieved = goalIdAchieved(goal);

    goalDetail.innerHTML = `
        <div class="goal-detail-header">
            <h4>Goal: ${escapeHtml(goal.goalText)}</h4>
            ${achieved ? `<p class="goal-go"><strong>&#127942; Goal achieved!</strong> One of your marked-done steps can produce this morph.</p>` : ""}
        </div>

        <table class="data-table goal-scan-table">
            <thead>
                <tr><th>Gene piece needed</th><th>Visual animals you have</th><th>Het animals you have</th></tr>
            </thead>
            <tbody>${scanRows}</tbody>
        </table>

        <h5>Path mapped so far</h5>
        ${stepsHtml}

        <h5>Add a pairing step</h5>
        ${chooserHtml}

        <button class="goal-add-step" onclick="generatePathIdeas('${goal.id}')">Suggest pairings from your collection</button>
        <div id="goalIdeas-${goal.id}" class="goal-ideas-list"></div>
    `;

    renderGoalList();
}

function addStepFromSelects(goalId) {
    const femaleSelect = document.getElementById(`goalFemaleSelect-${goalId}`);
    const maleSelect = document.getElementById(`goalMaleSelect-${goalId}`);

    if (!femaleSelect || !maleSelect) {
        return;
    }

    addStep(goalId, femaleSelect.value, maleSelect.value);
}

function generatePathIdeas(goalId) {
    const goal = getGoal(goalId);
    const ideasContainer = document.getElementById(`goalIdeas-${goalId}`);

    if (!goal || !ideasContainer) {
        return;
    }

    const females = snakes.filter(snake => snake.sex === "Female" || snake.sex === "Unknown");
    const males = snakes.filter(snake => snake.sex === "Male" || snake.sex === "Unknown");
    const ideas = [];

    females.forEach(female => {
        males.forEach(male => {
            if (female.id === male.id) {
                return;
            }

            const femaleSlot = { type: "snake", snakeId: female.id, label: "" };
            const maleSlot = { type: "snake", snakeId: male.id, label: "" };
            const evaluation = evaluatePairing(femaleSlot, maleSlot, goal.pieces);

            ideas.push({
                female,
                male,
                femaleSlot,
                maleSlot,
                chance: evaluation.goalProbability,
                partial: evaluation.partialProbability,
                best: evaluation.bestOutcome,
                bestFullCount: evaluation.bestFullCount,
                pieceCount: goal.pieces.length
            });
        });
    });

    if (ideas.length === 0) {
        ideasContainer.innerHTML = `<p class="empty-message">No breedable pairing found in your collection (need at least one Female and one Male).</p>`;
        return;
    }

    ideas.sort((a, b) => b.chance - a.chance || b.partial - a.partial);

    const top = ideas
        .filter(idea => idea.chance > 0 || idea.partial > 0 || idea.bestFullCount >= 0)
        .slice(0, 6);

    if (top.length === 0) {
        ideasContainer.innerHTML = `<p class="empty-message">No pairing in your collection moves toward this goal (or none has expected genes). Try adding a needed animal to the path above.</p>`;
        return;
    }

    ideasContainer.innerHTML = top.map(idea => `
        <div class="goal-idea-card">
            <div class="goal-step-header">
                <span class="goal-step-title">${escapeHtml(window.SnakeData.getSnakeIdentityText(idea.female))} &times; ${escapeHtml(window.SnakeData.getSnakeIdentityText(idea.male))}</span>
                <button class="goal-add-step" onclick="addStepFromIdea('${goalId}', '${idea.female.id}', '${idea.male.id}')">Use this pairing</button>
            </div>
            <p class="goal-hint">
                ${idea.chance > 0
            ? `Direct chance of the goal: <strong>${(idea.chance * 100).toFixed(1)}%</strong> per egg.`
            : idea.partial > 0
                ? `${(idea.partial * 100).toFixed(1)}% of the clutch makes partial progress (carriers/supers).`
                : `Moves ${idea.bestFullCount} of ${idea.pieceCount} pieces into the clutch.`}
                ${idea.best && idea.best.genes.length ? ` Top outcome: ${escapeHtml(idea.best.morphName)} (${(idea.best.probability * 100).toFixed(1)}%).` : ""}
            </p>
        </div>
    `).join("");
}

function addStepFromIdea(goalId, femaleId, maleId) {
    addStep(goalId, `snake:${femaleId}`, `snake:${maleId}`);
}

// ---- Utilities

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

window.addEventListener("DOMContentLoaded", () => {
    goals.forEach(goal => {
        goal.pieces = (goal.pieces || []).map(piece => ({
            ...piece,
            recessive: window.GeneTools.findGene(piece.gene)?.type === "recessive"
        }));
    });
    saveGoals();

    goalInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            createGoal();
        }
    });

    renderGoalList();
});

window.GoalPlanner = {
    createGoal,
    toggleGoalCreation,
    deleteGoal,
    openGoal,
    addStepFromSelects,
    addStepFromIdea,
    toggleStepDone,
    removeStep,
    editStepNotes,
    generatePathIdeas
};
