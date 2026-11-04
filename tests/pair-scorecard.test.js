const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const context = { console };

context.window = context;
vm.createContext(context);
// The scorecard reuses the clutch maths from the Season Review, so the test
// loads the same two scripts the page does, in the same order.
["season-review-helpers.js", "pair-scorecard-helpers.js"].forEach(file => {
    vm.runInContext(
        fs.readFileSync(path.join(projectRoot, file), "utf8"),
        context,
        { filename: file }
    );
});

const scorecard = context.window.PairScorecard;

function female(id, name) {
    return { id, name, sex: "Female", status: "Breeder" };
}

function male(id, name) {
    return { id, name, sex: "Male", status: "Breeder" };
}

function hatchling(overrides = {}) {
    return {
        id: "hatch-1",
        name: "Hatchling",
        status: "Available",
        clutchId: "",
        salePrice: "",
        ...overrides
    };
}

const SNAKES = [
    female("female-1", "Nova"),
    male("male-1", "Onyx"),
    female("female-2", "Jade"),
    male("male-2", "Ash"),
    hatchling({ id: "h1", name: "Hatch One", clutchId: "2026-01", status: "Sold", salePrice: "150" }),
    hatchling({ id: "h2", name: "Hatch Two", clutchId: "2026-01", status: "Sold", salePrice: "150" }),
    hatchling({ id: "h3", name: "Hatch Three", clutchId: "2026-01", status: "Sold", salePrice: "150" }),
    hatchling({ id: "h4", name: "Hatch Four", clutchId: "2026-01", status: "Holdback" }),
    hatchling({ id: "h5", name: "Hatch Five", clutchId: "2026-01", status: "Available" }),
    hatchling({ id: "h6", name: "Old One", clutchId: "2025-01", status: "Sold", salePrice: "200" }),
    hatchling({ id: "h7", name: "Old Two", clutchId: "2025-01", status: "Sold", salePrice: "200" })
];

const PAIRS = [
    {
        id: "pair-1",
        femaleSnakeId: "female-1",
        maleSnakeId: "male-1",
        pairingDate: "2026-01-10",
        eggsLaidDate: "2026-02-01",
        eggCount: 6,
        clutchId: "2026-01"
    },
    {
        id: "pair-2",
        femaleSnakeId: "female-2",
        maleSnakeId: "male-2",
        pairingDate: "2025-01-10",
        eggsLaidDate: "2025-02-01",
        eggCount: 4,
        clutchId: ""
    },
    {
        id: "pair-3",
        femaleSnakeId: "female-2",
        maleSnakeId: "male-1",
        pairingDate: "2024-01-10",
        eggCount: 0,
        clutchId: "",
        closedAt: "2024-06-01",
        closedReason: "No eggs"
    }
];

const CLUTCHES = [
    {
        id: "2026-01",
        femaleSnakeId: "female-1",
        maleSnakeId: "male-1",
        year: "2026",
        laidDate: "2026-02-01",
        eggCount: 6,
        hatchedDate: "2026-03-28",
        hatchlingCount: 5,
        convertedToSnakes: true
    },
    {
        id: "2026-02",
        femaleSnakeId: "female-1",
        maleSnakeId: "male-1",
        year: "2026",
        laidDate: "2026-09-01",
        eggCount: 5,
        convertedToSnakes: false
    },
    {
        id: "2025-01",
        femaleSnakeId: "female-2",
        maleSnakeId: "male-2",
        year: "2025",
        laidDate: "2025-02-01",
        eggCount: 4,
        hatchedDate: "2025-03-28",
        hatchlingCount: 2,
        convertedToSnakes: true
    }
];

function build() {
    return scorecard.scorecard({ snakes: SNAKES, pairs: PAIRS, clutches: CLUTCHES });
}

function pairById(result, id) {
    return result.pairs.find(row => row.id === id);
}

test("grades follow the hatch rate bands", () => {
    assert.equal(scorecard.gradeFor(100).label, "A");
    assert.equal(scorecard.gradeFor(85).label, "A");
    assert.equal(scorecard.gradeFor(84.9).label, "B");
    assert.equal(scorecard.gradeFor(70).label, "B");
    assert.equal(scorecard.gradeFor(65).label, "C");
    assert.equal(scorecard.gradeFor(49).label, "D");
    assert.equal(scorecard.gradeFor(null).label, "\u2014");
});

test("a linked clutch scores the pairing that produced it", () => {
    const result = build();
    const pair = pairById(result, "pair-1");

    assert.equal(pair.hatchRate, 83.3);
    assert.equal(pair.grade.label, "B");
    assert.equal(pair.verdict.label, "Working");
    assert.equal(pair.clutches, 2);
    assert.equal(pair.completed, 1);
    assert.equal(pair.incubating, 1);
    assert.equal(pair.eggs, 11);
    assert.equal(pair.hatched, 5);
    assert.equal(pair.counts.sold, 3);
    assert.equal(pair.counts.retained, 1);
    assert.equal(pair.revenue, 450);
    assert.equal(pair.valuePerHatchling, 90);
    assert.equal(pair.hatchlingsPerClutch, 5);
});

test("one clutch earns a cautious note, not a reputation", () => {
    const result = build();
    const pair = pairById(result, "pair-1");

    assert.match(pair.verdict.note, /One clutch is a hint, not proof/);
});

test("a clutch with no pair link is still matched by its parents", () => {
    const result = build();
    const pair = pairById(result, "pair-2");

    assert.equal(pair.clutches, 1);
    assert.equal(pair.hatched, 2);
    assert.equal(pair.hatchRate, 50);
    assert.equal(pair.grade.label, "C");
    assert.equal(pair.verdict.label, "Patchy");
    assert.equal(pair.attention, true);
});

test("a closed pairing with no clutch is a result, not a blank", () => {
    const result = build();
    const pair = pairById(result, "pair-3");

    assert.equal(pair.verdict.label, "Closed without a clutch");
    assert.equal(pair.hatchRate, null);
    assert.equal(pair.grade.label, "\u2014");
    assert.equal(pair.attention, false);
});

test("clutch rows carry their own grade, unhatched eggs and per-hatchling value", () => {
    const result = build();
    const clutch = result.clutches.find(row => row.id === "2026-01");
    const incubating = result.clutches.find(row => row.id === "2026-02");

    assert.equal(clutch.grade.label, "B");
    assert.equal(clutch.unhatched, 1);
    assert.equal(clutch.valuePerHatchling, 90);
    assert.equal(clutch.counts.sold, 3);

    assert.equal(incubating.isHatched, false);
    assert.equal(incubating.grade.key, "none");
    assert.equal(incubating.revenue, 0);
});

test("the totals pool every clutch, and only hatched eggs count toward the rate", () => {
    const result = build();

    assert.equal(result.totals.pairs, 3);
    assert.equal(result.totals.clutches, 3);
    assert.equal(result.totals.incubating, 1);
    assert.equal(result.totals.eggs, 15);
    assert.equal(result.totals.completedEggs, 10);
    assert.equal(result.totals.hatched, 7);
    assert.equal(result.totals.unhatched, 3);
    assert.equal(result.totals.hatchRate, 70);
    assert.equal(result.totals.scoredPairs, 2);
    assert.equal(result.totals.workingPairs, 1);
    assert.equal(result.totals.revenue, 850);
    assert.equal(result.totals.counts.sold, 5);
});

test("the readout names the best pairing and the one to question", () => {
    const result = build();

    assert.match(result.insights.headline, /1 of 2 scored pairing/);
    assert.match(result.insights.detail, /Best: Nova x Onyx at 83.3%/);
    assert.match(result.insights.detail, /Weakest: Jade x Ash at 50%/);
    assert.equal(result.insights.bestPair.id, "pair-1");
    assert.equal(result.insights.weakestPair.id, "pair-2");
});

test("no hatched clutch means no grade, and the page says why", () => {
    const result = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [PAIRS[0]],
        clutches: [CLUTCHES[1]]
    });

    assert.equal(result.totals.hatchRate, null);
    assert.equal(result.pairs[0].hatchRate, null);
    assert.equal(result.pairs[0].verdict.label, "Waiting on eggs");
    assert.equal(result.insights.tone, "empty");
    assert.match(result.insights.headline, /No hatched clutch yet/);
});

test("an empty room gets a starting point, not a divide by zero", () => {
    const result = scorecard.scorecard({ snakes: [], pairs: [], clutches: [] });

    assert.equal(result.totals.clutches, 0);
    assert.equal(result.totals.hatchRate, null);
    assert.equal(result.insights.headline, "No pairings or clutches on record yet.");
});

test("pairs with a rate sort ahead of unproven and closed pairings", () => {
    const result = build();

    assert.deepEqual(
        result.pairs.map(row => row.id),
        ["pair-1", "pair-2", "pair-3"]
    );
});

test("value per clutch divides realised sales by hatched clutches", () => {
    const result = build();
    const pair = pairById(result, "pair-1");

    assert.equal(pair.revenuePerClutch, 450);
    assert.equal(pair.revenuePerEgg, 75);
    assert.equal(result.totals.valuePerClutch, 425);
    assert.equal(result.totals.completedClutches, 2);
});

test("pairings are sales pairings unless they are marked as a project", () => {
    const result = build();

    assert.equal(result.pairs[0].purpose, "sales");
    assert.equal(result.pairs[0].purposeLabel, "Sales pairing");
    assert.equal(result.totals.salesPairs, 3);
    assert.equal(result.totals.projectPairs, 0);
});

test("a project pairing is read on keepers, not sales", () => {
    const result = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [{
            id: "pair-project",
            femaleSnakeId: "female-1",
            maleSnakeId: "male-1",
            pairingDate: "2026-01-10",
            eggsLaidDate: "2026-02-01",
            eggCount: 6,
            clutchId: "2026-01",
            purpose: "project",
            targetMorph: "Hurricane Cypress Pin Clown"
        }],
        clutches: [CLUTCHES[0]]
    });
    const pair = result.pairs[0];

    assert.equal(pair.purpose, "project");
    assert.equal(pair.purposeLabel, "Project pairing");
    assert.equal(pair.targetMorph, "Hurricane Cypress Pin Clown");
    assert.equal(pair.revenue, 450);
    assert.equal(pair.counts.retained, 1);
    assert.match(pair.verdict.note, /Project pairing toward Hurricane Cypress Pin Clown/);
    assert.match(pair.verdict.note, /1 kept back toward the goal/);
    assert.match(pair.verdict.note, /Sales are the surplus, not the score/);
    assert.match(pair.verdict.note, /Worth another step toward the target/);
    assert.doesNotMatch(pair.verdict.note, /Worth another season/);
    assert.equal(result.totals.projectPairs, 1);
});

test("the readout names the project and what it is working toward", () => {
    const result = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [{
            id: "pair-project",
            femaleSnakeId: "female-1",
            maleSnakeId: "male-1",
            eggsLaidDate: "2026-02-01",
            eggCount: 6,
            clutchId: "2026-01",
            purpose: "project",
            targetMorph: "Hurricane Cypress Pin Clown"
        }],
        clutches: [CLUTCHES[0]]
    });

    assert.match(result.insights.detail, /Project: Nova x Onyx toward Hurricane Cypress Pin Clown/);
    assert.match(result.insights.detail, /1 kept back, sales are the surplus/);
});

test("a project with no keepers says so instead of implying progress", () => {
    const result = scorecard.scorecard({
        snakes: [SNAKES[0], SNAKES[1]],
        pairs: [{
            id: "pair-project",
            femaleSnakeId: "female-1",
            maleSnakeId: "male-1",
            eggsLaidDate: "2026-02-01",
            eggCount: 6,
            clutchId: "2026-01",
            purpose: "project"
        }],
        clutches: [{
            id: "2026-01",
            femaleSnakeId: "female-1",
            maleSnakeId: "male-1",
            laidDate: "2026-02-01",
            eggCount: 6,
            hatchedDate: "2026-03-28",
            hatchlingCount: 5,
            convertedToSnakes: true
        }]
    });

    assert.match(result.pairs[0].verdict.note, /No keepers selected from it yet/);
    assert.match(result.pairs[0].verdict.note, /the target morph/);
});

function projectPair(overrides = {}) {
    return {
        id: "pair-project",
        femaleSnakeId: "female-1",
        maleSnakeId: "male-1",
        pairingDate: "2026-01-10",
        eggsLaidDate: "2026-02-01",
        eggCount: 6,
        clutchId: "2026-01",
        purpose: "project",
        targetMorph: "Hurricane Cypress Pin Clown",
        projectStep: 1,
        projectOutcome: "partial",
        projectResult: "Hurricane Clown",
        projectMissing: "Cypress, Pin",
        projectNext: "breed-back",
        projectNextNote: "Keep him and breed back to the mother when he is up to size",
        ...overrides
    };
}

test("a partial step is judged on the morph, not the egg count", () => {
    const result = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [projectPair({ projectStep: 2 })],
        clutches: [CLUTCHES[0]]
    });
    const pair = result.pairs[0];

    assert.equal(pair.judged, true);
    assert.equal(pair.outcome, "partial");
    assert.equal(pair.outcomeLabel, "Partial");
    assert.equal(pair.verdict.key, "project-partial");
    assert.equal(pair.verdict.label, "Partial");
    assert.equal(pair.step, 2);
    assert.match(pair.verdict.note, /Step 2 moved the project forward, but not all the way to Hurricane Cypress Pin Clown/);
    assert.match(pair.verdict.note, /Hatched: Hurricane Clown/);
    assert.match(pair.verdict.note, /Still missing: Cypress, Pin/);
    assert.match(pair.verdict.note, /Next: Keep and breed back — Keep him and breed back to the mother/);
    // The hatch grade is still reported next to the project outcome.
    assert.equal(pair.hatchRate, 83.3);
});

test("a hit says so, and a miss says to try again", () => {
    const hit = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [projectPair({ projectOutcome: "hit", projectResult: "Hurricane Cypress Pin Clown", projectMissing: "", projectNext: "done" })],
        clutches: [CLUTCHES[0]]
    }).pairs[0];
    const missed = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [projectPair({ projectOutcome: "missed", projectResult: "Normals", projectMissing: "Everything", projectNext: "repeat" })],
        clutches: [CLUTCHES[0]]
    }).pairs[0];

    assert.equal(hit.verdict.label, "Goal hit");
    assert.match(hit.verdict.note, /Step 1 hit the goal: Hurricane Cypress Pin Clown/);
    assert.match(hit.verdict.note, /Next: Project complete/);

    assert.equal(missed.verdict.label, "Missed");
    assert.match(missed.verdict.note, /produced nothing to carry toward/);
    assert.match(missed.verdict.note, /Next: Repeat this pairing/);
});

test("an unjudged project keeps the hatch-rate verdict", () => {
    const result = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [projectPair({ projectOutcome: "pending", projectNext: "undecided" })],
        clutches: [CLUTCHES[0]]
    });
    const pair = result.pairs[0];

    assert.equal(pair.judged, false);
    assert.equal(pair.verdict.label, "Working");
    assert.equal(pair.verdict.key, "working");
    assert.match(pair.verdict.note, /Worth another step toward the target/);
});

test("pairings with the same target morph roll up into one project, in step order", () => {
    const result = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [
            projectPair({ id: "step-2", projectStep: 2 }),
            projectPair({ id: "step-1", clutchId: "", projectStep: 1, projectOutcome: "missed", projectResult: "Normals", projectMissing: "Everything", projectNext: "repeat" }),
            projectPair({ id: "other", clutchId: "", projectStep: 1, targetMorph: "Banana Clown", projectOutcome: "hit", projectResult: "Banana Clown", projectNext: "done" })
        ],
        clutches: [CLUTCHES[0]]
    });

    assert.equal(result.projects.length, 2);

    const target = result.projects.find(project => project.target === "Hurricane Cypress Pin Clown");

    assert.equal(target.count, 2);
    assert.equal(target.steps.map(step => step.step).join(","), "1,2");
    assert.equal(target.misses, 1);
    assert.equal(target.partials, 1);
    assert.equal(target.status, "partial");
    assert.equal(target.statusLabel, "Partial");
    assert.equal(target.keepers, 1);
    assert.equal(target.latest.id, "step-2");

    const other = result.projects.find(project => project.target === "Banana Clown");

    assert.equal(other.status, "hit");
    assert.equal(other.statusLabel, "Goal hit");
});

test("project outcome totals count judged steps only", () => {
    const result = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [
            projectPair({ id: "p1", projectOutcome: "hit" }),
            projectPair({ id: "p2", projectOutcome: "partial" }),
            projectPair({ id: "p3", projectOutcome: "missed" }),
            projectPair({ id: "p4", projectOutcome: "pending" })
        ],
        clutches: [CLUTCHES[0]]
    });

    assert.equal(result.totals.projectPairs, 4);
    assert.equal(result.totals.projectSteps, 3);
    assert.equal(result.totals.projectHits, 1);
    assert.equal(result.totals.projectPartials, 1);
    assert.equal(result.totals.projectMisses, 1);
});

test("the readout quotes the judged project step and its next move", () => {
    const result = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [projectPair({ projectStep: 2 })],
        clutches: [CLUTCHES[0]]
    });

    assert.match(result.insights.detail, /Project: Nova x Onyx toward Hurricane Cypress Pin Clown, step 2 — partial \(Hurricane Clown\); next: Keep and breed back\./);
});

test("outcome and next-move values fall back safely", () => {
    assert.equal(scorecard.normalizeOutcome("").key, "pending");
    assert.equal(scorecard.normalizeOutcome("nonsense").key, "pending");
    assert.equal(scorecard.normalizeNext("").key, "undecided");
    assert.equal(scorecard.normalizeNext("NONSENSE").key, "undecided");

    const step = scorecard.projectStep({ projectStep: "-4", projectOutcome: "hit", projectNext: "done" });

    assert.equal(step.step, null);
    assert.equal(step.nextLabel, "Project complete");
});

test("a step remembers the keeper and what the next step needs", () => {
    const result = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [projectPair({
            nextKeeperId: "h4",
            nextNeeds: "Yellow Belly or Banana Het Clown"
        })],
        clutches: [CLUTCHES[0]]
    });
    const pair = result.pairs[0];
    const step = result.projects[0].steps[0];

    assert.equal(pair.nextKeeper, "Hatch Four");
    assert.equal(pair.nextNeeds, "Yellow Belly or Banana Het Clown");
    assert.equal(step.nextKeeper, "Hatch Four");
    assert.equal(step.nextNeeds, "Yellow Belly or Banana Het Clown");
});

test("a keeper outside the clutch still resolves by its collection record", () => {
    const result = scorecard.scorecard({
        snakes: SNAKES,
        pairs: [projectPair({ nextKeeperId: "female-2" })],
        clutches: [CLUTCHES[0]]
    });

    assert.equal(result.pairs[0].nextKeeper, "Jade");
});
