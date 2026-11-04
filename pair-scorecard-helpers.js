// pair-scorecard-helpers.js
// The scorecard side of the breeding records: which pairings actually produce
// hatchlings, which clutches hatched well, and where the money came from.
//
// It reads the same records as the Breeding page and the Season Review, and it
// reuses SeasonReview.summarizeClutch so a clutch can never score differently
// on two pages. It is all-time by design: a pairing earns its grade from every
// clutch on record, not just the current season.
//
// A grade is only ever the healthy hatch rate: eggs in, healthy hatchlings out.
// Nothing here invents a score from weights, and both the raw hatch count and
// the defect count stay on the card so the keeper can see what the grade is
// built on. A hatchling with a recorded defect (shark mouth, no eyes, kink, bug
// eyes, small eyes) did hatch, but it is not an animal the pairing produced
// cleanly, so it does not count toward the grade.

(function () {
    const GRADES = [
        { key: "a", label: "A", min: 85, note: "85% or more of the eggs produced a healthy hatchling." },
        { key: "b", label: "B", min: 70, note: "70% to 84% of the eggs produced a healthy hatchling." },
        { key: "c", label: "C", min: 50, note: "50% to 69% of the eggs produced a healthy hatchling." },
        { key: "d", label: "D", min: 0, note: "Fewer than half the eggs produced a healthy hatchling." }
    ];
    // The line between a pairing that is earning its food and one that needs a
    // decision. It is the same 70% that earns a B.
    const WORKING_SCORE = 70;
    // An old clutch with parents recorded but no pair link is still that
    // pairing's result. The fallback only reaches this far in days, so a pair
    // from one season cannot swallow a clutch from the next.
    const MATCH_WINDOW_DAYS = 400;

    // Not every pairing is a sale. A project pairing is a step toward a target
    // morph: most of its hatchlings are kept back to breed on, and only the
    // surplus is sold. Judging it on sales alone would call a working project a
    // failure, so the purpose decides how the money is read.
    const PURPOSES = {
        sales: {
            key: "sales",
            label: "Sales pairing",
            note: "Hatchlings are produced to sell, so sales per clutch is the money that matters."
        },
        project: {
            key: "project",
            label: "Project pairing",
            note: "A step toward a target morph. Keepers carry the project; sales are the surplus."
        }
    };

    function normalizePurpose(value) {
        return text(value).toLowerCase() === "project" ? "project" : "sales";
    }

    // A project pairing is a step: it either reached the target, moved toward it,
    // or produced nothing worth keeping. That judgement is separate from the
    // hatch rate, because a healthy clutch can still miss the morph you wanted.
    const PROJECT_OUTCOMES = [
        { key: "pending", label: "Not judged yet", rank: 0 },
        { key: "hit", label: "Goal hit", rank: 3 },
        { key: "partial", label: "Partial", rank: 2 },
        { key: "missed", label: "Missed", rank: 1 }
    ];

    // What the keeper does next. "Breed back" is the common partial result: keep
    // the animal that carries part of the goal and pair it back to the parent.
    const PROJECT_NEXT = [
        { key: "undecided", label: "Not decided", rank: 0 },
        { key: "breed-back", label: "Keep and breed back", rank: 1 },
        { key: "repeat", label: "Repeat this pairing", rank: 2 },
        { key: "new-approach", label: "Try a different approach", rank: 3 },
        { key: "done", label: "Project complete", rank: 4 }
    ];

    function normalizeOutcome(value) {
        const key = text(value).toLowerCase();

        return PROJECT_OUTCOMES.find(outcome => outcome.key === key) || PROJECT_OUTCOMES[0];
    }

    function normalizeNext(value) {
        const key = text(value).toLowerCase();

        return PROJECT_NEXT.find(next => next.key === key) || PROJECT_NEXT[0];
    }

    function projectStep(pair) {
        const step = Math.max(0, Math.round(number(pair && pair.projectStep)));
        const outcome = normalizeOutcome(pair && pair.projectOutcome);
        const next = normalizeNext(pair && pair.projectNext);

        return {
            step: step > 0 ? step : null,
            outcome: outcome.key,
            outcomeLabel: outcome.label,
            judged: outcome.key !== "pending",
            result: text(pair && pair.projectResult),
            missing: text(pair && pair.projectMissing),
            next: next.key,
            nextLabel: next.key === "undecided" ? "" : next.label,
            nextNote: text(pair && pair.projectNextNote)
        };
    }

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function number(value) {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : 0;
    }

    function roundPercent(value) {
        return Math.round((Number(value) || 0) * 10) / 10;
    }

    function roundMoney(value) {
        return Math.round((Number(value) || 0) * 100) / 100;
    }

    function roundOne(value) {
        return Math.round((Number(value) || 0) * 10) / 10;
    }

    function gradeFor(score) {
        if (score === null || score === undefined) {
            return { key: "none", label: "—", note: "No hatched clutch to score yet." };
        }

        return GRADES.find(grade => score >= grade.min) || GRADES[GRADES.length - 1];
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

    function dayGap(left, right) {
        const first = parseDate(left);
        const second = parseDate(right);

        if (!first || !second) {
            return null;
        }

        return Math.abs(Math.round((first - second) / (1000 * 60 * 60 * 24)));
    }

    function findSnake(snakes, reference) {
        if (!reference && reference !== 0) {
            return null;
        }

        if (typeof reference === "number") {
            return snakes[reference] || null;
        }

        return snakes.find(snake => String(snake && snake.id || "") === String(reference)) || null;
    }

    // Old records carry a snake id on new rows and a plain index on older ones,
    // so parents are compared by the snake they point at, never the raw value.
    function snakeKey(snakes, reference) {
        const snake = findSnake(snakes, reference);

        if (snake && text(snake.id)) {
            return text(snake.id);
        }

        return text(reference);
    }

    function parentKey(record, snakes) {
        const female = snakeKey(snakes, record && (record.femaleSnakeId || record.femaleIndex));
        const male = snakeKey(snakes, record && (record.maleSnakeId || record.maleIndex));

        return female && male ? `${female}|${male}` : "";
    }

    function recordDate(record) {
        return text(record && (record.laidDate || record.eggsLaidDate || record.pairingDate)).slice(0, 10);
    }

    // Direct links (the Breeding page writes pair.clutchId) win. What is left
    // is matched on the parents, nearest date first, so imported or older
    // clutches still show up under the pairing that produced them.
    function assignClutches(pairs, clutches, snakes) {
        const byClutchId = new Map();
        const assigned = new Map();

        pairs.forEach(pair => {
            const clutchId = text(pair && pair.clutchId);

            if (clutchId) {
                byClutchId.set(clutchId, pair);
            }
        });

        const used = new Set();

        clutches.forEach(clutch => {
            const direct = byClutchId.get(text(clutch && clutch.id));

            if (direct) {
                const key = text(direct.id) || `pair-${pairs.indexOf(direct)}`;

                assigned.set(key, [...(assigned.get(key) || []), clutch]);
                used.add(clutch);
            }
        });

        // Any pair can take an unlinked clutch: the same parents can have more
        // than one pair record, and the nearest date decides which one owns it.
        const pool = pairs;

        clutches.forEach(clutch => {
            if (used.has(clutch) || !text(clutch && clutch.id)) {
                return;
            }

            const key = parentKey(clutch, snakes);

            if (!key) {
                return;
            }

            const laid = recordDate(clutch);
            let best = null;
            let bestGap = null;

            pool.forEach(pair => {
                if (parentKey(pair, snakes) !== key) {
                    return;
                }

                const gap = laid && recordDate(pair) ? dayGap(laid, recordDate(pair)) : null;

                if (gap !== null && gap > MATCH_WINDOW_DAYS) {
                    return;
                }

                const distance = gap === null ? Infinity : gap;

                if (!best || distance < bestGap) {
                    best = pair;
                    bestGap = distance;
                }
            });

            if (best) {
                const group = text(best.id) || `pair-${pairs.indexOf(best)}`;

                assigned.set(group, [...(assigned.get(group) || []), clutch]);
            }
        });

        return assigned;
    }

    function countPairings(pair) {
        const pairings = Array.isArray(pair && pair.pairings)
            ? pair.pairings.filter(item => parseDate(item && item.date)).length
            : 0;

        return pairings || (parseDate(pair && pair.pairingDate) ? 1 : 0);
    }

    // "Kinked x2, Shark mouth" for a card or note line. Counted from the
    // hatchling summaries, so the same animal is never counted twice.
    function defectBreakdown(rows) {
        const counts = new Map();

        rows.forEach(row => {
            (row.hatchlings || []).forEach(hatchling => {
                (hatchling.defects || []).forEach(label => {
                    counts.set(label, (counts.get(label) || 0) + 1);
                });
            });
        });

        return [...counts.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
    }

    function defectText(breakdown, separator = ", ") {
        return (breakdown || [])
            .map(item => (item.count > 1 ? `${item.label} x${item.count}` : item.label))
            .join(separator);
    }

    function defectSentence(rows) {
        const defective = rows.reduce((sum, row) => sum + (row.defective || 0), 0);

        if (defective <= 0) {
            return "";
        }

        const hatched = rows.reduce((sum, row) => sum + row.hatched, 0);
        const names = defectText(defectBreakdown(rows));

        return ` ${defective} of ${hatched} hatchling${hatched === 1 ? "" : "s"} had a recorded defect (${names}); the grade counts healthy hatchlings only.`;
    }

    function clutchRow(clutch, snakes) {
        const R = window.SeasonReview;
        const row = R.summarizeClutch(clutch, snakes);
        // cleanRate comes from the season review when it is there. The fallback
        // keeps an older cached script scoring the same way rather than
        // grading a clutch on hatchlings it now knows are defective.
        const defective = row.defective === undefined
            ? (row.hatchlings || []).filter(hatchling => hatchling.defective).length
            : row.defective;
        const healthy = Math.max(0, row.hatched - defective);
        const cleanRate = row.cleanRate === undefined
            ? (row.isHatched && row.eggs > 0 ? roundPercent((healthy / row.eggs) * 100) : null)
            : row.cleanRate;

        return {
            ...row,
            healthy,
            defective,
            cleanRate,
            defectRate: row.defectRate === undefined
                ? (row.hatched > 0 ? roundPercent((defective / row.hatched) * 100) : null)
                : row.defectRate,
            defectBreakdown: defectBreakdown([row]),
            grade: gradeFor(cleanRate),
            unhatched: row.unhatched,
            valuePerHatchling: row.isHatched && row.hatched > 0 ? roundMoney(row.revenue / row.hatched) : null
        };
    }

    function buildCounts(rows) {
        const counts = { retained: 0, forSale: 0, growing: 0, sold: 0, lost: 0 };

        rows.forEach(row => {
            Object.keys(counts).forEach(key => {
                counts[key] += row.counts[key] || 0;
            });
        });

        return counts;
    }

    // A project's note has to say what the money is not measuring, otherwise a
    // low sales figure reads as failure when the keepers are the whole point.
    // Once the step is judged, the note leads with the project result and the
    // next move, because that is the decision the keeper is making.
    function withProjectNote(verdict, pair, rows, step) {
        if (normalizePurpose(pair && pair.purpose) !== "project") {
            return verdict;
        }

        const target = text(pair && pair.targetMorph) || "the target morph";

        if (step && step.judged) {
            const stepText = step.step ? `Step ${step.step}` : "This step";
            const parts = [];

            if (step.outcome === "hit") {
                parts.push(`${stepText} hit the goal: ${target}.`);
            } else if (step.outcome === "partial") {
                parts.push(`${stepText} moved the project forward, but not all the way to ${target}.`);
            } else {
                parts.push(`${stepText} produced nothing to carry toward ${target}.`);
            }

            if (step.result) {
                parts.push(`Hatched: ${step.result}.`);
            }

            if (step.missing) {
                parts.push(`Still missing: ${step.missing}.`);
            }

            parts.push(`Next: ${step.nextLabel || "not decided yet"}${step.nextNote ? ` — ${step.nextNote}` : ""}.`);

            return {
                ...verdict,
                key: `project-${step.outcome}`,
                label: step.outcomeLabel,
                note: parts.join(" "),
                project: step
            };
        }

        const kept = rows
            .filter(row => row.isHatched)
            .reduce((sum, row) => sum + (row.counts.retained || 0), 0);
        const keeperLine = kept > 0
            ? `${kept} kept back toward the goal so far.`
            : "No keepers selected from it yet.";
        // The grade advice is written for sales pairings; a project repeats a
        // step rather than a season, so the advice is reworded to fit.
        const advice = verdict.note
            .replace(" Repeat this pairing.", " Repeat it as the next step in the project.")
            .replace(" Worth another season.", " Worth another step toward the target.");

        return {
            ...verdict,
            note: `${advice} Project pairing toward ${target}: ${keeperLine} Sales are the surplus, not the score.`,
            project: step
        };
    }

    function verdictFor(pair, rows) {
        const status = text(pair && pair.closedAt) ? "closed" : "active";
        const completed = rows.filter(row => row.isHatched);
        const incubating = rows.filter(row => !row.isHatched);
        const pendingEggs = rows.length === 0 ? Math.max(0, Math.round(number(pair && pair.eggCount))) : 0;

        if (rows.length === 0) {
            if (status === "closed") {
                return {
                    key: "closed",
                    label: "Closed without a clutch",
                    note: "This pairing never produced a clutch. That is the result, not a missing one."
                };
            }

            if (pendingEggs > 0) {
                return {
                    key: "pending",
                    label: "Eggs recorded, no clutch yet",
                    note: "Convert the pair to a clutch so the eggs can be scored and the hatchlings counted."
                };
            }

            return {
                key: "none",
                label: "No clutch yet",
                note: "Nothing to score until a clutch is on record."
            };
        }

        if (completed.length === 0) {
            const count = incubating.length;

            return {
                key: "waiting",
                label: "Waiting on eggs",
                note: `${count} clutch${count === 1 ? "" : "es"} incubating. A grade lands when the eggs hatch.`
            };
        }

        // Only healthy hatchlings count: a deformed animal still hatched, but
        // the pairing did not produce a usable one.
        const defective = completed.reduce((sum, row) => sum + (row.defective || 0), 0);
        const healthy = Math.max(0, completed.reduce((sum, row) => sum + row.hatched, 0) - defective);
        const score = completed.length > 0 && completed.some(row => row.eggs > 0)
            ? roundPercent(
                (healthy
                    / completed.reduce((sum, row) => sum + row.eggs, 0)) * 100
            )
            : null;

        if (score === null) {
            return {
                key: "unknown",
                label: "Egg count missing",
                note: "Hatchlings are on record but no eggs were counted, so there is no rate to grade."
            };
        }

        const sample = completed.length === 1
            ? " One clutch is a hint, not proof; the grade gets firmer with a second."
            : ` Across ${completed.length} hatched clutches.`;
        const defects = defectSentence(completed);

        if (score >= 85) {
            return { key: "working", label: "Working", note: `${GRADES[0].note}${defects}${sample} Repeat this pairing.` };
        }

        if (score >= WORKING_SCORE) {
            return { key: "working", label: "Working", note: `${GRADES[1].note}${defects}${sample} Worth another season.` };
        }

        if (score >= 50) {
            return { key: "patchy", label: "Patchy", note: `${GRADES[2].note}${defects}${sample} Check incubation and pairing timing before repeating it.` };
        }

        return { key: "weak", label: "Not working", note: `${GRADES[3].note}${defects}${sample} Look at the incubator, the parents and the pairing dates before trying again.` };
    }

    function pairRow(pair, rows, snakes) {
        const completed = rows.filter(row => row.isHatched);
        const incubating = rows.filter(row => !row.isHatched);
        const counts = buildCounts(completed);
        const eggs = rows.reduce((sum, row) => sum + row.eggs, 0);
        const completedEggs = completed.reduce((sum, row) => sum + row.eggs, 0);
        const hatched = completed.reduce((sum, row) => sum + row.hatched, 0);
        const defective = completed.reduce((sum, row) => sum + (row.defective || 0), 0);
        const healthy = Math.max(0, hatched - defective);
        const revenue = roundMoney(completed.reduce((sum, row) => sum + row.revenue, 0));
        const hatchScore = completedEggs > 0 ? roundPercent((hatched / completedEggs) * 100) : null;
        const score = completedEggs > 0 ? roundPercent((healthy / completedEggs) * 100) : null;
        const defectRate = hatched > 0 ? roundPercent((defective / hatched) * 100) : null;
        const female = findSnake(snakes, pair && (pair.femaleSnakeId || pair.femaleIndex));
        const male = findSnake(snakes, pair && (pair.maleSnakeId || pair.maleIndex));
        const lastLaid = rows
            .map(row => row.laidDate)
            .filter(Boolean)
            .sort((left, right) => right.localeCompare(left))[0] || "";
        const purpose = normalizePurpose(pair && pair.purpose);
        const step = projectStep(pair);
        const verdict = withProjectNote(verdictFor(pair, rows), pair, rows, step);
        // The next generation is planned on the step that produced the keeper:
        // which animal is held back, and what still has to be added.
        const keeperId = text(pair && pair.nextKeeperId);
        const keeperHatchling = completed
            .flatMap(row => row.hatchlings)
            .find(hatchling => text(hatchling.id) === keeperId) || null;
        const keeperSnake = keeperId ? findSnake(snakes, keeperId) : null;
        const nextKeeper = text(keeperHatchling && keeperHatchling.name)
            || text(keeperSnake && keeperSnake.name);
        // The keeper still carries the project, but the defect travels with it:
        // a kinked keeper is a decision, not an oversight.
        const nextKeeperDefects = keeperHatchling && Array.isArray(keeperHatchling.defects)
            ? keeperHatchling.defects
            : (keeperSnake && window.SnakeDefects ? window.SnakeDefects.labels(keeperSnake) : []);

        return {
            id: text(pair && pair.id),
            label: window.SeasonReview.pairLabel(pair, snakes),
            femaleName: text(female && female.name),
            maleName: text(male && male.name),
            femaleId: text(female && female.id) || text(pair && pair.femaleSnakeId),
            maleId: text(male && male.id) || text(pair && pair.maleSnakeId),
            purpose,
            purposeLabel: PURPOSES[purpose].label,
            purposeNote: PURPOSES[purpose].note,
            targetMorph: text(pair && pair.targetMorph),
            step: step.step,
            outcome: step.outcome,
            outcomeLabel: step.outcomeLabel,
            judged: step.judged,
            result: step.result,
            missing: step.missing,
            next: step.next,
            nextLabel: step.nextLabel,
            nextNote: step.nextNote,
            nextKeeperId: keeperId,
            nextKeeper,
            nextKeeperDefects,
            nextNeeds: text(pair && pair.nextNeeds),
            project: step,
            status: text(pair && pair.closedAt) ? "closed" : "active",
            closedAt: text(pair && pair.closedAt).slice(0, 10),
            closedReason: text(pair && pair.closedReason),
            pairings: countPairings(pair),
            clutches: rows.length,
            completed: completed.length,
            incubating: incubating.length,
            eggs,
            completedEggs,
            hatched,
            healthy,
            defective,
            defectRate,
            defectBreakdown: defectBreakdown(completed),
            hatchRate: hatchScore,
            cleanRate: score,
            hatchlingsPerClutch: completed.length > 0 ? roundOne(hatched / completed.length) : null,
            counts,
            revenue,
            // Money per clutch is the honest per-pairing figure the ledger can
            // support: costs are collection-wide, so this is sales, never profit.
            revenuePerClutch: completed.length > 0 ? roundMoney(revenue / completed.length) : null,
            revenuePerEgg: completedEggs > 0 ? roundMoney(revenue / completedEggs) : null,
            valuePerHatchling: hatched > 0 ? roundMoney(revenue / hatched) : null,
            lastLaidDate: lastLaid,
            pendingEggs: rows.length === 0 ? Math.max(0, Math.round(number(pair && pair.eggCount))) : 0,
            grade: gradeFor(score),
            verdict,
            attention: score !== null && score < WORKING_SCORE
        };
    }

    function sortPairs(left, right) {
        const rank = row => (row.hatchRate !== null ? 0 : (row.verdict.key === "waiting" ? 1 : (row.status === "closed" ? 3 : 2)));

        return rank(left) - rank(right)
            || (right.hatchRate === null ? 0 : right.hatchRate) - (left.hatchRate === null ? 0 : left.hatchRate)
            || right.hatched - left.hatched
            || String(right.lastLaidDate).localeCompare(String(left.lastLaidDate))
            || left.label.localeCompare(right.label);
    }

    function emptyTotals() {
        return {
            pairs: 0,
            scoredPairs: 0,
            workingPairs: 0,
            salesPairs: 0,
            projectPairs: 0,
            projectSteps: 0,
            projectHits: 0,
            projectPartials: 0,
            projectMisses: 0,
            clutches: 0,
            completedClutches: 0,
            incubating: 0,
            eggs: 0,
            completedEggs: 0,
            hatched: 0,
            healthy: 0,
            defective: 0,
            defectBreakdown: [],
            unhatched: 0,
            hatchRate: null,
            cleanRate: null,
            defectRate: null,
            hatchlingsPerClutch: null,
            counts: { retained: 0, forSale: 0, growing: 0, sold: 0, lost: 0 },
            revenue: 0,
            valuePerClutch: null
        };
    }

    // Pairings that name the same target morph are steps of one project. The
    // target string is the project key on purpose: it is the thing the keeper
    // typed, it needs no extra record to maintain, and two spellings simply read
    // as two projects until they are made to match.
    function buildProjects(pairRows) {
        const groups = new Map();

        pairRows.filter(row => row.purpose === "project").forEach(row => {
            const key = text(row.targetMorph).replace(/\s+/g, " ").toLowerCase() || "untitled";

            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    target: text(row.targetMorph) || "Unnamed target",
                    steps: []
                });
            }

            groups.get(key).steps.push(row);
        });

        return [...groups.values()].map(project => {
            const steps = [...project.steps].sort((left, right) =>
                (left.step === null ? 999 : left.step) - (right.step === null ? 999 : right.step)
                || String(left.lastLaidDate).localeCompare(String(right.lastLaidDate))
            );
            const judged = steps.filter(step => step.judged);
            const hits = steps.filter(step => step.outcome === "hit").length;
            const partials = steps.filter(step => step.outcome === "partial").length;
            const misses = steps.filter(step => step.outcome === "missed").length;
            const latest = judged[judged.length - 1] || steps[steps.length - 1] || null;
            const status = hits > 0 ? "hit" : (latest && latest.judged ? latest.outcome : "pending");

            return {
                key: project.key,
                target: project.target,
                steps,
                count: steps.length,
                keepers: steps.reduce((sum, step) => sum + step.counts.retained, 0),
                defective: steps.reduce((sum, step) => sum + (step.defective || 0), 0),
                hits,
                partials,
                misses,
                latest,
                status,
                statusLabel: hits > 0
                    ? "Goal hit"
                    : (latest && latest.judged ? latest.outcomeLabel : "Not judged yet"),
                lastDate: latest ? latest.lastLaidDate : ""
            };
        }).sort((left, right) =>
            String(right.lastDate).localeCompare(String(left.lastDate))
            || left.target.localeCompare(right.target)
        );
    }

    function buildInsights(pairRows, totals) {
        const scored = pairRows.filter(row => row.cleanRate !== null);
        const bestPair = [...scored].sort((left, right) =>
            right.cleanRate - left.cleanRate
            || right.healthy - left.healthy
            || String(right.lastLaidDate).localeCompare(String(left.lastLaidDate))
        )[0] || null;
        const weakestPair = [...scored].sort((left, right) =>
            left.cleanRate - right.cleanRate
            || left.healthy - right.healthy
        )[0] || null;
        const waitingPairs = pairRows.filter(row => row.verdict.key === "waiting").length;
        const noClutchPairs = pairRows.filter(row => row.verdict.key === "none" || row.verdict.key === "closed").length;

        if (totals.pairs === 0 && totals.clutches === 0) {
            return {
                tone: "empty",
                headline: "No pairings or clutches on record yet.",
                detail: "Add a pairing on the Breeding page. Once its clutch hatches, this page grades the pairing and the clutch.",
                bestPair: null,
                weakestPair: null,
                waitingPairs: 0,
                noClutchPairs: 0
            };
        }

        if (scored.length === 0) {
            return {
                tone: "empty",
                headline: "No hatched clutch yet, so no pairing has a grade.",
                detail: `${totals.clutches} clutch${totals.clutches === 1 ? "" : "es"} on record${totals.incubating > 0 ? `, ${totals.incubating} still incubating` : ""}. The scorecard fills in as eggs hatch.`,
                bestPair: null,
                weakestPair: null,
                waitingPairs,
                noClutchPairs
            };
        }

        const working = totals.workingPairs;
        const projectPair = pairRows
            .filter(row => row.purpose === "project" && row.judged)
            .sort((left, right) =>
                (PROJECT_OUTCOMES.find(outcome => outcome.key === right.outcome) || PROJECT_OUTCOMES[0]).rank
                - (PROJECT_OUTCOMES.find(outcome => outcome.key === left.outcome) || PROJECT_OUTCOMES[0]).rank
                || (right.step || 0) - (left.step || 0)
            )[0]
            || pairRows.find(row => row.purpose === "project")
            || null;
        const parts = [
            bestPair
                ? `Best: ${bestPair.label} at ${bestPair.cleanRate}% healthy (${bestPair.healthy} healthy from ${bestPair.completedEggs} eggs).`
                : "",
            weakestPair && weakestPair.cleanRate < WORKING_SCORE
                ? `Weakest: ${weakestPair.label} at ${weakestPair.cleanRate}% healthy — the pairing to question first.`
                : "",
            totals.defective > 0
                ? `${totals.defective} of ${totals.hatched} hatchlings had a recorded defect (${defectText(totals.defectBreakdown)}); the grade counts healthy hatchlings only.`
                : "",
            projectPair
                ? (projectPair.judged
                    ? `Project: ${projectPair.label} toward ${projectPair.targetMorph || "its target"}${projectPair.step ? `, step ${projectPair.step}` : ""} — ${projectPair.outcomeLabel.toLowerCase()}${projectPair.result ? ` (${projectPair.result})` : ""}; next: ${projectPair.nextLabel || "not decided"}.`
                    : `Project: ${projectPair.label} toward ${projectPair.targetMorph || "its target"} — ${projectPair.counts.retained} kept back, sales are the surplus.`)
                : "",
            waitingPairs > 0 ? `${waitingPairs} pairing${waitingPairs === 1 ? "" : "s"} still waiting on eggs.` : ""
        ].filter(Boolean);

        return {
            tone: working === 0 ? "down" : (working === scored.length ? "positive" : "mixed"),
            headline: `${working} of ${scored.length} scored pairing${scored.length === 1 ? "" : "s"} ${working === 1 ? "produces" : "produce"} healthy hatchlings at ${WORKING_SCORE}% or better.`,
            detail: parts.join(" "),
            bestPair,
            weakestPair,
            waitingPairs,
            noClutchPairs
        };
    }

    function scorecard(options = {}) {
        const snakes = Array.isArray(options.snakes) ? options.snakes : [];
        const pairs = Array.isArray(options.pairs) ? options.pairs.filter(Boolean) : [];
        const clutches = Array.isArray(options.clutches) ? options.clutches.filter(Boolean) : [];

        if (!window.SeasonReview || typeof window.SeasonReview.summarizeClutch !== "function") {
            return {
                available: false,
                pairs: [],
                clutches: [],
                totals: emptyTotals(),
                insights: {
                    tone: "empty",
                    headline: "The season review tools did not load.",
                    detail: "The scorecard reuses the clutch maths from the Season Review page, so it cannot score anything without it.",
                    bestPair: null,
                    weakestPair: null,
                    waitingPairs: 0,
                    noClutchPairs: 0
                }
            };
        }

        const rows = clutches.map(clutch => clutchRow(clutch, snakes));
        const rowsByClutch = new Map(clutches.map((clutch, index) => [clutch, rows[index]]));
        const assignments = assignClutches(pairs, clutches, snakes);
        const pairRows = pairs.map((pair, index) => {
            const key = text(pair.id) || `pair-${index}`;
            const owned = (assignments.get(key) || []).map(clutch => rowsByClutch.get(clutch)).filter(Boolean);

            return pairRow(pair, owned, snakes);
        }).sort(sortPairs);

        const totals = emptyTotals();

        totals.pairs = pairRows.length;
        totals.clutches = rows.length;

        rows.forEach(row => {
            totals.eggs += row.eggs;
            totals.hatched += row.hatched;
            totals.defective += row.defective || 0;
            totals.unhatched += row.unhatched;
            totals.revenue += row.revenue;

            if (row.isHatched) {
                totals.completedEggs += row.eggs;
            } else {
                totals.incubating += 1;
            }

            Object.keys(totals.counts).forEach(key => {
                totals.counts[key] += row.counts[key] || 0;
            });
        });

        totals.revenue = roundMoney(totals.revenue);
        totals.healthy = Math.max(0, totals.hatched - totals.defective);
        totals.defectBreakdown = defectBreakdown(rows);
        totals.scoredPairs = pairRows.filter(row => row.cleanRate !== null).length;
        totals.workingPairs = pairRows.filter(row => row.cleanRate !== null && row.cleanRate >= WORKING_SCORE).length;
        totals.salesPairs = pairRows.filter(row => row.purpose === "sales").length;
        totals.projectPairs = pairRows.filter(row => row.purpose === "project").length;
        totals.projectSteps = pairRows.filter(row => row.purpose === "project" && row.judged).length;
        totals.projectHits = pairRows.filter(row => row.purpose === "project" && row.outcome === "hit").length;
        totals.projectPartials = pairRows.filter(row => row.purpose === "project" && row.outcome === "partial").length;
        totals.projectMisses = pairRows.filter(row => row.purpose === "project" && row.outcome === "missed").length;
        totals.completedClutches = totals.clutches - totals.incubating;
        totals.valuePerClutch = totals.completedClutches > 0
            ? roundMoney(totals.revenue / totals.completedClutches)
            : null;
        totals.hatchRate = totals.completedEggs > 0
            ? roundPercent((totals.hatched / totals.completedEggs) * 100)
            : null;
        totals.cleanRate = totals.completedEggs > 0
            ? roundPercent((totals.healthy / totals.completedEggs) * 100)
            : null;
        totals.defectRate = totals.hatched > 0
            ? roundPercent((totals.defective / totals.hatched) * 100)
            : null;
        totals.hatchlingsPerClutch = totals.clutches - totals.incubating > 0
            ? roundOne(totals.hatched / (totals.clutches - totals.incubating))
            : null;

        const sortedClutches = [...rows].sort((left, right) =>
            String(right.laidDate || right.hatchedDate).localeCompare(String(left.laidDate || left.hatchedDate))
            || String(left.id).localeCompare(String(right.id))
        );

        return {
            available: true,
            pairs: pairRows,
            projects: buildProjects(pairRows),
            clutches: sortedClutches,
            totals,
            insights: buildInsights(pairRows, totals)
        };
    }

    window.PairScorecard = {
        GRADES,
        PURPOSES,
        PROJECT_OUTCOMES,
        PROJECT_NEXT,
        WORKING_SCORE,
        MATCH_WINDOW_DAYS,
        normalizePurpose,
        normalizeOutcome,
        normalizeNext,
        projectStep,
        defectBreakdown,
        defectText,
        buildProjects,
        gradeFor,
        pairRow,
        clutchRow,
        verdictFor,
        assignClutches,
        scorecard
    };
})();
