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

function getLiveSnakes() { return window.SnakeData.loadSnakesWithIds([]); }

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

function getStoneLabel() {
    const liveSnakes = getLiveSnakes();
    const stone = window.SnakeData.getSnakeByReference(liveSnakes, "stone");
    return stone ? window.SnakeData.getSnakeIdentityText(stone) : null;
}

function getStones() {
    const labels = new Set();
    const liveSnakes = getLiveSnakes();
    liveSnakes.forEach(snake => {
        const gene = window.SnakeData.getSnakeByReference(liveSnakes, snake);
        labels.add(Object.keys(gene));
    });
    return labels;
}

function getStonesLabel() {
    const stones = getStones();
    let label = "";
    stones.forEach(c => {
        const other = "";
        return label + " " + (label ? " " : "") + c;
    });
    return label;
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
    const liveSnakes = getLiveSnakes();
    return liveSnakes.map(snake =>
        ({ snake, matches: pieces.map(piece => getSnakeGeneCount(snake, piece)) })
    );
}

// ---- Next-step hint: simplest owned cross (or buy) that creates progress on a piece.

function getVisualCount(piece, snakeMatches) {
    return snakeMatches.filter(entry => entry.matches[piece._idx] === "Visual").length;
}

function getHetCount(piece, snakeMatches) {
    return snakeMatches.filter(entry => entry.matches[piece._idx] === "Het").length;
}

function getVisualSnakes(piece, snakeMatches) {
    return snakeMatches.filter(entry => entry.matches[piece._idx] === "Visual").map(entry => entry.snake);
}

function getHetSnakes(piece, snakeMatches) {
    return snakeMatches.filter(entry => entry.matches[piece._idx] === "Het").map(entry => entry.snake);
}

// Carriers that are only possible hets water down the per-egg odds, so the
// hint has to say which ones still have something to prove.
function getUnprovenHetNames(piece, snakeMatches) {
    return getHetSnakes(piece, snakeMatches)
        .filter(snake => {
            const record = (snake.genes || []).find(gene =>
                gene.name.toLowerCase() === piece.gene.toLowerCase()
            );

            return window.GeneTools.getPossibleHetOdds(record || {}) !== null;
        })
        .map(snake => snake.name);
}

function formatUnprovenCaveat(piece, snakeMatches) {
    const unproven = getUnprovenHetNames(piece, snakeMatches);

    if (unproven.length === 0) {
        return "";
    }

    const names = unproven.join(" and ");

    return ` ${names} ${unproven.length === 1 ? "is" : "are"} still an unproven het, so the real odds sit lower until that proves out.`;
}

function nextStepHint(piece, snakeMatches) {
    const recessive = window.GeneTools.findGene(piece.gene)?.type === "recessive";
    const visuals = getVisualSnakes(piece, snakeMatches);
    const hets = getHetSnakes(piece, snakeMatches);

    // For co-doms, any animal that carries the gene already shows it visually
    // (1 copy = visual, 2 copies = super). There is no hidden "carrier" state.
    const codomAnimals = recessive
        ? []
        : visuals.concat(hets);

    if (recessive) {
        // visual x het throws visuals (50% per egg for a simple recessive).
        if (visuals.length > 0 && hets.length > 0) {
            const hetNames = hets.map(s => s.name).join(" and ");
            return `You have ${visuals.length} ${piece.gene} visual${visuals.length === 1 ? "" : "s"} on hand. Visual x ${hetNames} (a ${piece.gene} het) can make more visuals (50% per egg).${formatUnprovenCaveat(piece, snakeMatches)}`;
        }

        if (visuals.length > 0) {
            return `You have ${visuals.length} ${piece.gene} visual${visuals.length === 1 ? "" : "s"} on hand.`;
        }

        if (hets.length === 0) {
            return `No ${piece.gene} carriers yet. Need to buy or breed a ${piece.gene} het first.`;
        }

        if (hets.length >= 2) {
            const names = hets.map(s => s.name).join(" and ");
            return `Breed 2 ${piece.gene} hets to get a visual (25% per egg). Your hets: ${names}.${formatUnprovenCaveat(piece, snakeMatches)}`;
        }

        return `Only 1 ${piece.gene} het on hand. Need 1 more ${piece.gene} carrier before a het cross can make a visual.`;
    }

    // Co-dom: 1 copy = visual, 2 copies = super.
    if (codomAnimals.length > 0) {
        return `You have ${codomAnimals.length} ${piece.gene} animal${codomAnimals.length === 1 ? "" : "s"} on hand (visual or super).`;
    }

    return `No ${piece.gene} animals yet. Need to buy or breed a ${piece.gene} visual (1 copy) first.`;
}

// ---- Holdbacks: the hatchling a step tells you to keep
//
// A step can name one of its own outcomes as the animal to hold back ("keep a
// Clown Visual Leopard"). That planned animal is stored on the step and can be
// picked as a parent in later steps, which is how a real multi-generation path
// gets mapped. Nothing is created in the collection until it actually hatches.

function getGoalHoldbacks(goal) {
    return (goal.steps || [])
        .map((step, index) => ({ step, index, holdback: step.holdback }))
        .filter(entry => Boolean(entry.holdback));
}

function findHoldback(holdbackId) {
    for (const goal of goals) {
        const found = getGoalHoldbacks(goal).find(entry => entry.holdback.id === holdbackId);

        if (found) {
            return { goal, ...found };
        }
    }

    return null;
}

function getHoldbackGenes(holdback) {
    if (holdback.promotedSnakeId) {
        const snake = window.SnakeData.getSnakeByReference(getLiveSnakes(), holdback.promotedSnakeId);

        if (snake) {
            return snake.genes || [];
        }
    }

    return holdback.genes || [];
}

// ---- Slot helper: owned animals vs animals you still need

function slotLabel(slot) {
    if (slot.type === "snake") {
        const liveSnakes = getLiveSnakes();
        const snake = window.SnakeData.getSnakeByReference(liveSnakes, slot.snakeId);

        if (!snake) {
            return slot.label || "Missing snake";
        }

        return getSnakeLine(snake);
    }

    if (slot.type === "holdback") {
        const found = findHoldback(slot.holdbackId);

        if (!found) {
            return `${slot.label || "Planned holdback"} (holdback removed)`;
        }

        if (found.holdback.promotedSnakeId) {
            const snake = window.SnakeData.getSnakeByReference(getLiveSnakes(), found.holdback.promotedSnakeId);

            if (snake) {
                return getSnakeLine(snake);
            }
        }

        return `Planned: ${found.holdback.label} (from Step ${found.index + 1})`;
    }

    return `Needed: ${slot.label}`;
}

function slotGenes(slot) {
    if (slot.type === "snake") {
        const snakesLive = window.SnakeData.loadSnakesWithIds([]);
        const snake = window.SnakeData.getSnakeByReference(snakesLive, slot.snakeId);

        return snake ? (snake.genes || []) : [];
    }

    if (slot.type === "holdback") {
        const found = findHoldback(slot.holdbackId);

        return found ? getHoldbackGenes(found.holdback) : [];
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

    if (selectValue.startsWith("holdback:")) {
        return { type: "holdback", holdbackId: selectValue.slice(9), label: "" };
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
        const recessive = window.GeneTools.findGene(piece.gene)?.type === "recessive";
        const present = Boolean(record) && record.copies !== 0;
        const full = Boolean(record) && (recessive ? record.copies === 2 : record.copies >= 1);

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

    const normalizedPieces = (pieces || []).map(piece => ({
        ...piece,
        recessive: window.GeneTools.findGene(piece.gene)?.type === "recessive"
    }));

    const hits = outcomes.map(outcome => outcomePieceHits(outcome, normalizedPieces));

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

// Orders every outcome of a pairing by how close it lands to the goal, so a
// step card shows the outcome that produces the goal (or the nearest miss)
// first instead of burying it under multi-gene combos.
function rankOutcomesForGoal(outcomes, pieces) {
    return (outcomes || [])
        .map(outcome => {
            const hits = outcomePieceHits(outcome, pieces || []);

            return {
                outcome,
                hits,
                fullCount: hits.filter(hit => hit.full).length,
                presentCount: hits.filter(hit => hit.present).length,
                isGoal: hits.length > 0 && hits.every(hit => hit.full)
            };
        })
        .sort((a, b) =>
            Number(b.isGoal) - Number(a.isGoal)
            || b.fullCount - a.fullCount
            || b.presentCount - a.presentCount
            || b.outcome.probability - a.outcome.probability
            || a.outcome.morphCount - b.outcome.morphCount
            || a.outcome.morphName.localeCompare(b.outcome.morphName)
        );
}

// Outcomes that land on the same goal pieces are one animal to a breeder, not
// several rolls: "Clown + Leopard" split across Enchi/Lesser variations is
// still a 25% chance of holding one back, so each group adds its outcomes up.
// Only the groups that reach the most pieces are returned.
function getClosestTiers(ranked, pieces) {
    const nonGoal = ranked.filter(item => !item.isGoal);

    if (nonGoal.length === 0) {
        return null;
    }

    const bestFullCount = Math.max(...nonGoal.map(item => item.fullCount));
    const groups = new Map();

    // With no piece at full strength yet, carriers are the closest thing this
    // pairing makes, so those group by which goal genes they at least carry.
    const keyFor = item => item.hits
        .map((hit, index) => ((bestFullCount > 0 ? hit.full : hit.present) ? pieces[index].gene : ""))
        .filter(Boolean)
        .join(" + ") || "none";

    nonGoal
        .filter(item => item.fullCount === bestFullCount)
        .forEach(item => {
            const key = keyFor(item);

            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    entry: item,
                    outcomes: [],
                    chance: 0,
                    fullCount: bestFullCount,
                    presentCount: item.presentCount
                });
            }

            const group = groups.get(key);
            group.outcomes.push(item);
            group.chance += item.outcome.probability;
        });

    return Array.from(groups.values())
        .sort((a, b) =>
            b.chance - a.chance
            || b.outcomes.length - a.outcomes.length
            || a.key.localeCompare(b.key)
        );
}

// "Reached" pieces are named the way the calculator does ("Clown Visual"),
// and a piece that is there but short of the goal says how short it is.
function describeMissing(entry, pieces) {
    return pieces
        .map((piece, index) => {
            const hit = entry.hits[index];

            if (hit.full) {
                return "";
            }

            return hit.present
                ? `${piece.gene} (het only)`
                : `${piece.gene} (absent)`;
        })
        .filter(Boolean)
        .join(", ");
}

function formatClosest(tiers, pieces) {
    if (!tiers || tiers.length === 0) {
        return "";
    }

    if (tiers[0].fullCount === 0) {
        if (tiers[0].presentCount === 0) {
            return `This pairing passes none of the goal genes: ${pieces.map(piece => piece.gene).join(", ")}.`;
        }

        return `Closest this pairing gets: ${formatClosestGroups(tiers, pieces, "as carriers only")} — no goal visuals in this clutch yet.`;
    }

    return `Closest this pairing gets: ${formatClosestGroups(tiers, pieces)}.`;
}

function formatClosestGroups(tiers, pieces, prefix = "") {
    const groups = tiers.slice(0, 2).map(group => {
        const chance = (group.chance * 100).toFixed(1);
        const spread = group.outcomes.length > 1
            ? ` across ${group.outcomes.length} outcome variations`
            : "";
        // The carriers-only wording already says the pieces fall short.
        const missing = prefix ? "" : ` (missing ${describeMissing(group.entry, pieces)})`;
        const reached = prefix ? `${group.key} ${prefix}` : group.key;

        return `${reached} at ${chance}% per egg${spread}${missing}`;
    });

    return groups.join("; or ");
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

function snakeMovesGoalForward(snake, pieces) {
    return pieces.some(piece => {
        const count = getSnakeGeneCount(snake, piece);
        if (count === "None") {
            return false;
        }

        const recessive = window.GeneTools.findGene(piece.gene)?.type === "recessive";
        if (recessive) {
            return count === "Het" || count === "Visual";
        }

        return count === "Visual";
    });
}

function buildSlotOptions(goal, kind) {
    const pieces = goal.pieces;
    const sex = kind === "female" ? "Female" : "Male";
    const options = [];
    const liveSnakes = getLiveSnakes();

    liveSnakes
        .filter(snake => (snake.sex === sex || snake.sex === "Unknown") && snakeMovesGoalForward(snake, pieces))
        .forEach(snake => {
            options.push(`
                <option value="snake:${snake.id}">
                    ${escapeHtml(getSnakeLine(snake))}
                </option>
            `);
        });

    // Holdbacks from earlier steps: sex is still yours to pick when the clutch
    // hatches, so they can fill either slot at roughly half the listed odds.
    getGoalHoldbacks(goal).forEach(entry => {
        const holdback = entry.holdback;

        options.push(`
                <option value="holdback:${holdback.id}">
                    Hold back from Step ${entry.index + 1}: ${escapeHtml(holdback.label)} — ${(holdback.chance * 100).toFixed(1)}% per egg (${(getHoldbackVariationChance(holdback) * 100).toFixed(1)}% any variation), about half that as a ${sex.toLowerCase()}
                </option>
            `);
    });

    options.push(`<option value="need:NI animal">NI animal</option>`);
    options.push(`<option value="need:Buy new animal">Need to buy</option>`);
    pieces.forEach(piece => {
        options.push(`<option value="need:Het ${piece.gene} NI">Need to buy Het ${piece.gene} (any sex)</option>`);
        options.push(`<option value="need:Visual ${piece.gene} NI">Need to buy Visual ${piece.gene} (any sex)</option>`);
    });

    return options.join("");
}

const PREDICTION_LIMIT = 8;

// The genotype of one outcome, ready to store as a snake's genes or as a
// planned holdback's genes.
function getOutcomeGenotype(outcome) {
    return (outcome.geneDetails || []).map(gene => {
        const catalogGene = window.GeneTools.findGene(gene.name);
        const genotype = {
            name: gene.name,
            copies: gene.copies,
            type: catalogGene ? catalogGene.type : gene.type
        };

        // A possible het stays a possible het down the chain.
        if (gene.hetOdds !== undefined && gene.hetOdds !== null && gene.hetOdds < 1) {
            genotype.hetOdds = gene.hetOdds;
        }

        return genotype;
    });
}

// Same goal pieces reached, different extras: an Enchi Leopard Clown is still
// the animal you meant to hold back, so both numbers get reported.
function getVariationChance(ranked, entry, pieces) {
    const keyFor = item => item.hits
        .map((hit, index) => (hit.full ? pieces[index].gene : ""))
        .filter(Boolean)
        .join(" + ");
    const key = keyFor(entry);

    return ranked
        .filter(item => keyFor(item) === key)
        .reduce((sum, item) => sum + item.outcome.probability, 0);
}

function getHoldbackVariationChance(holdback) {
    return Number(holdback.variationChance) || holdback.chance;
}

function genotypeSignature(genes) {
    return (genes || [])
        .map(gene => `${gene.name}:${gene.copies}:${gene.hetOdds === undefined ? "" : gene.hetOdds}`)
        .sort()
        .join("|");
}

function buildPredictionRow(entry, rankedIndex, goal, step) {
    // Skip gene breakdowns that just repeat the morph name.
    const breakdown = entry.outcome.genes.filter(gene => gene !== entry.outcome.morphName);
    const kept = Boolean(step.holdback)
        && genotypeSignature(getOutcomeGenotype(entry.outcome)) === genotypeSignature(step.holdback.genes);

    return `
            <div class="goal-prediction-row ${entry.isGoal ? "goal-prediction-hit" : ""}">
                <span class="goal-chip">${escapeHtml(entry.outcome.morphName)}</span>
                <span class="goal-prediction-chance">${(entry.outcome.probability * 100).toFixed(1)}%</span>
                ${entry.isGoal ? `<span class="goal-prediction-badge">goal</span>` : ""}
                ${kept ? `<span class="goal-prediction-badge">holding back</span>` : ""}
                <button class="goal-keep-button" onclick="keepHoldback('${goal.id}', '${step.id}', ${rankedIndex})">Keep one</button>
            </div>
            ${breakdown.length > 0 ? `<div class="goal-hint">${escapeHtml(breakdown.join(" · "))}</div>` : ""}
        `;
}

function buildStepCard(goal, step, index) {
    const evaluation = evaluatePairing(step.female, step.male, goal.pieces);
    const ranked = rankOutcomesForGoal(evaluation.outcomes, goal.pieces);
    const goalEntryCount = ranked.filter(entry => entry.isGoal).length;
    // When the step can already hit the goal the goal rows say it, so the
    // closest-miss line is only worth showing when it cannot.
    const closestTiers = getClosestTiers(ranked, goal.pieces);
    const mismatch = evaluation.goalProbability > 0 ? "" : formatClosest(closestTiers, goal.pieces);
    const warning = formatWarnings(evaluation.bestOutcome);
    const visiblePredictions = ranked.slice(0, PREDICTION_LIMIT);
    const hiddenPredictions = ranked.slice(PREDICTION_LIMIT);
    const predictions = visiblePredictions
        .map((entry, offset) => buildPredictionRow(entry, offset, goal, step))
        .join("");
    const morePredictions = hiddenPredictions.length > 0
        ? `
            <details class="goal-predictions-more">
                <summary>Show all ${ranked.length} possible outcomes</summary>
                <div class="goal-predictions">${hiddenPredictions
                    .map((entry, offset) => buildPredictionRow(entry, offset + PREDICTION_LIMIT, goal, step))
                    .join("")}</div>
            </details>
        `
        : "";
    const holdbackLine = step.holdback
        ? `
            <p class="goal-hint goal-holdback-line">
                Holding back: <strong>${escapeHtml(step.holdback.label)}</strong> — ${(step.holdback.chance * 100).toFixed(1)}% per egg, or
                ${(getHoldbackVariationChance(step.holdback) * 100).toFixed(1)}% if any variation of the same genes will do.
                Pick the sex you need when it hatches, then breed it in a later step.
                ${step.holdback.promotedSnakeId
            ? ` <span class="goal-prediction-badge">in collection</span>`
            : `<button class="goal-add-step" onclick="promoteHoldback('${goal.id}', '${step.id}')">Add as a real snake</button>`}
                <button class="goal-add-step" onclick="clearHoldback('${goal.id}', '${step.id}')">Clear</button>
            </p>
        `
        : "";

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
            ? `<p class="goal-go"><strong>This step can produce the goal!</strong> Chance: ${(evaluation.goalProbability * 100).toFixed(1)}% of the clutch${goalEntryCount > 1 ? ` across ${goalEntryCount} outcomes` : ""}.</p>`
            : ""}
            ${mismatch ? `<p class="goal-warn">${escapeHtml(mismatch)}</p>` : ""}
            ${warning ? `<p class="goal-warn">${escapeHtml(warning)}</p>` : ""}
            ${step.notes ? `<p class="goal-hint">Notes: ${escapeHtml(step.notes)}</p>` : ""}
            ${holdbackLine}
            <div class="goal-predictions">${predictions}</div>
            ${morePredictions}
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

    // Collection scan table: piece -> Visual / Het counts + labels. The next-step
    // hint reads pieces by _idx, so every piece has to carry one.
    pieces.forEach((piece, index) => { piece._idx = index; });

        const scanRows = pieces.map((piece, index) => {
            const gene = window.GeneTools.findGene(piece.gene);
            const visualEntries = snakeMatches.filter(entry => entry.matches[index] === "Visual");
            const hetEntries = snakeMatches.filter(entry => entry.matches[index] === "Het");

            const visuals = visualEntries.map(entry =>
                getSnakeLine(entry.snake)
            );
            const hets = hetEntries.map(entry =>
                getSnakeLine(entry.snake)
            );

            const hint = nextStepHint(piece, snakeMatches);

            return `
            <tr>
                <td>${escapeHtml(getPieceLabel(piece, gene))}</td>
                <td>${visuals.length > 0 ? escapeHtml(visuals.join(", ")) : "None"}</td>
                <td>${hets.length > 0 ? escapeHtml(hets.join(", ")) : (gene?.type === "recessive" ? "None" : "n/a")}</td>
                <td>${escapeHtml(hint)}</td>
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
                    ${buildSlotOptions(goal, "female")}
                </select>
            </label>
            <label class="form-field">
                <span class="goal-label-small">Male</span>
                <select id="goalMaleSelect-${goal.id}">
                    <option value="">-- Choose male --</option>
                    ${buildSlotOptions(goal, "male")}
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
                <tr><th>Gene piece needed</th><th>Visual animals you have</th><th>Het animals you have</th><th>Next step</th></tr>
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

    const liveSnakes = getLiveSnakes();
    const females = liveSnakes.filter(snake => snake.sex === "Female" || snake.sex === "Unknown");
    const males = liveSnakes.filter(snake => snake.sex === "Male" || snake.sex === "Unknown");
    const ideas = [];

    females.forEach(female => {
        males.forEach(male => {
            if (female.id === male.id) {
                return;
            }

            const femaleSlot = { type: "snake", snakeId: female.id, label: "" };
            const maleSlot = { type: "snake", snakeId: male.id, label: "" };
            const evaluation = evaluatePairing(femaleSlot, maleSlot, goal.pieces);
            const ranked = rankOutcomesForGoal(evaluation.outcomes, goal.pieces);
            const goalEntries = ranked.filter(entry => entry.isGoal);

            ideas.push({
                female,
                male,
                femaleSlot,
                maleSlot,
                chance: evaluation.goalProbability,
                partial: evaluation.partialProbability,
                best: evaluation.bestOutcome,
                bestFullCount: evaluation.bestFullCount,
                pieceCount: goal.pieces.length,
                bestPresentCount: evaluation.bestPresentCount,
                goalCount: goalEntries.length,
                closest: evaluation.goalProbability > 0
                    ? ""
                    : formatClosest(getClosestTiers(ranked, goal.pieces), goal.pieces)
            });
        });
    });

    if (ideas.length === 0) {
        ideasContainer.innerHTML = `<p class="empty-message">No breedable pairing found in your collection (need at least one Female and one Male).</p>`;
        return;
    }

    ideas.sort((a, b) => b.chance - a.chance || b.partial - a.partial || b.bestFullCount - a.bestFullCount || b.bestPresentCount - a.bestPresentCount);

    const top = ideas
        .filter(idea => idea.chance > 0 || idea.partial > 0 || idea.bestFullCount > 0)
        .slice(0, 8);


    if (top.length === 0) {
        ideasContainer.innerHTML = `<p class="empty-message">No pairing in your collection moves toward this goal (or none has expected genes). Try adding a needed animal to the path above.</p>`;
        return;
    }

    ideasContainer.innerHTML = top.map(idea => `
        <div class="goal-idea-card">
            <div class="goal-step-header">
                <span class="goal-step-title">${escapeHtml(getSnakeLine(idea.female))} &times; ${escapeHtml(getSnakeLine(idea.male))}</span>
                <button class="goal-add-step" onclick="addStepFromIdea('${goalId}', '${idea.female.id}', '${idea.male.id}')">Use this pairing</button>
            </div>
            <p class="goal-hint">
                ${idea.chance > 0
            ? `Direct chance of the goal: <strong>${(idea.chance * 100).toFixed(1)}%</strong> per egg.`
            : idea.closest
                ? escapeHtml(idea.closest)
                : `Moves ${idea.bestFullCount} of ${idea.pieceCount} pieces into the clutch.`}
            </p>
            ${idea.closest ? "" : `
            <p class="goal-hint">
                Piece check: ${idea.bestFullCount > 0
            ? `${idea.bestFullCount} of ${idea.pieceCount} required pieces are fully present in the top outcome.`
            : idea.bestPresentCount > 0
                ? `${idea.bestPresentCount} of ${idea.pieceCount} required pieces show up as partials (hets/supers); none reach a full presence yet.`
                : `None of your ${idea.pieceCount} required pieces are present in the top outcome.`}
            </p>`}
        </div>
    `).join("");
        
    if (top.length > 1 && top[0].chance === 0 && top[0].partial === 0) {
        ideasContainer.insertAdjacentHTML("beforeend", `<p class="goal-hint">
            None of these pairings can reach the goal in one step. The best options move the most pieces toward being carriers first.
        </p>`);
    }
}

function addStepFromIdea(goalId, femaleId, maleId) {
    addStep(goalId, `snake:${femaleId}`, `snake:${maleId}`);
}

// ---- Holdback actions

function keepHoldback(goalId, stepId, rankedIndex) {
    const goal = getGoal(goalId);
    const step = goal?.steps.find(item => item.id === stepId);

    if (!goal || !step) {
        return;
    }

    // Same pairing, same pieces, same order: the row the button pointed at is
    // the row this index still holds.
    const ranked = rankOutcomesForGoal(
        evaluatePairing(step.female, step.male, goal.pieces).outcomes,
        goal.pieces
    );
    const entry = ranked[rankedIndex];

    if (!entry) {
        return;
    }

    step.holdback = {
        id: step.holdback?.id || `hold-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        label: entry.outcome.morphName,
        chance: entry.outcome.probability,
        variationChance: getVariationChance(ranked, entry, goal.pieces),
        genes: getOutcomeGenotype(entry.outcome),
        sourceStepId: step.id,
        createdAt: new Date().toISOString()
    };

    saveGoals();
    renderGoalDetail(goalId);
}

function clearHoldback(goalId, stepId) {
    const goal = getGoal(goalId);
    const step = goal?.steps.find(item => item.id === stepId);

    if (!goal || !step) {
        return;
    }

    delete step.holdback;
    saveGoals();
    renderGoalDetail(goalId);
}

// The planned animal only becomes a real record once it hatches, and steps that
// already breed with it follow the real record from then on.
function promoteHoldback(goalId, stepId) {
    const goal = getGoal(goalId);
    const step = goal?.steps.find(item => item.id === stepId);
    const holdback = step?.holdback;

    if (!goal || !step || !holdback) {
        return;
    }

    const answer = prompt(`Name this animal. It is added to your collection as a ${holdback.label}.`, holdback.label);

    if (answer === null) {
        return;
    }

    const name = answer.trim() || holdback.label;
    const snakes = window.SnakeData.loadSnakesWithIds([]);
    const snake = {
        id: window.SnakeData.createSnakeId({ name, ID: "", morph: holdback.label }, snakes.length),
        name,
        ID: "",
        morph: holdback.label,
        binNumber: "",
        sex: "Unknown",
        status: "Holdback",
        weight: "",
        lastFed: "",
        feedingIntervalDays: 7,
        feederSize: "",
        image: "Images/TheSnakeRoom.jpg",
        genes: holdback.genes.map(gene => ({ ...gene }))
    };

    snakes.push(snake);
    window.SnakeData.saveStorageArray("snakes", snakes);

    holdback.promotedSnakeId = snake.id;
    saveGoals();
    renderGoalDetail(goalId);
    alert(`${name} is in your collection as a Holdback. Set its sex, photo and bin on the Collection page.`);
}

// ---- Utilities

function getSnakeLine(snake) {
    const geneNames = (snake.genes || [])
        .map(g => g.name)
        .filter(Boolean);

    const geneLine = geneNames.join(", ");

    return `${snake.name || snake.ID || "Unknown snake"} — ${geneLine || "no genes"}`;
}

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
    generatePathIdeas,
    keepHoldback,
    clearHoldback,
    promoteHoldback
};
