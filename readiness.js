// Pairing readiness helpers.
//
// The collection grows faster than anyone can remember every hatch date and
// weight. These checks turn the record on the page into a short, explainable
// answer: is this snake physically ready to be paired, and if not, what is
// missing? They are guidance, not a block. The breeding page still allows an
// experienced keeper to pair a snake that does not meet every rule.
(function () {
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Conservative defaults for ball pythons. Females carry the larger cost,
    // so they need three years and 1500 g; males mature earlier and smaller.
    const READINESS_RULES = {
        Female: {
            minWeight: 1500,
            minAgeDays: 1095,
            minAgeLabel: "3 years"
        },
        Male: {
            minWeight: 700,
            minAgeDays: 548,
            minAgeLabel: "18 months"
        }
    };

    const INACTIVE_STATUSES = ["Sold", "Archived", "Deceased"];

    // A female needs a full recovery window after laying before she will build
    // follicles again. Six months is the conservative end of the usual 5-6
    // month range; adjust this constant if your program uses a shorter rest.
    const POST_LAY_HOLD_MONTHS = 6;

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function parseDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));

        if (!match) {
            return null;
        }

        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function dateText(date) {
        if (!date) {
            return "";
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function todayText(now = new Date()) {
        return dateText(now instanceof Date ? now : new Date(now));
    }

    function daysBetween(fromValue, toValue) {
        const from = parseDate(fromValue);
        const to = parseDate(toValue);

        if (!from || !to) {
            return null;
        }

        return Math.round((to.getTime() - from.getTime()) / DAY_MS);
    }

    function addMonths(value, months) {
        const date = parseDate(value);

        if (!date) {
            return "";
        }

        const day = date.getDate();

        // Move from the first of the month so a 31st does not roll into the
        // following month, then clamp to the target month's last day.
        date.setDate(1);
        date.setMonth(date.getMonth() + Number(months || 0));
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(day, lastDay));

        return dateText(date);
    }

    function formatAge(days) {
        const value = Number(days);

        if (!Number.isFinite(value) || value < 0) {
            return "Unknown age";
        }

        if (value >= 365) {
            return `${(value / 365).toFixed(1)} yr`;
        }

        if (value >= 60) {
            return `${Math.floor(value / 30.44)} mo`;
        }

        return `${Math.floor(value)} day${Math.floor(value) === 1 ? "" : "s"}`;
    }

    function formatWeight(weight) {
        const value = Number(weight);

        return Number.isFinite(value) && value > 0 ? `${value}g` : "No weight";
    }

    function isActiveSnake(snake) {
        if (!snake) {
            return false;
        }

        if (window.SnakeData && typeof window.SnakeData.isActiveSnake === "function") {
            return window.SnakeData.isActiveSnake(snake);
        }

        return !INACTIVE_STATUSES.includes(text(snake.status));
    }

    function normalizeSex(value) {
        const lower = text(value).toLowerCase();

        if (lower === "female") {
            return "Female";
        }

        if (lower === "male") {
            return "Male";
        }

        return text(value) || "Unknown";
    }

    function getReadinessRules(sex) {
        return READINESS_RULES[normalizeSex(sex)] || null;
    }

    function isSameFemale(record, snake, snakes) {
        const femaleId = text(record && record.femaleSnakeId);
        const snakeId = text(snake && snake.id);

        if (femaleId && snakeId && femaleId === snakeId) {
            return true;
        }

        // Older pair records may only hold the position in the snakes array.
        const index = Number(record && record.femaleIndex);

        if (!Number.isInteger(index) || index < 0 || !Array.isArray(snakes)) {
            return false;
        }

        const indexed = snakes[index];

        return Boolean(indexed && (indexed === snake || (snakeId && text(indexed.id) === snakeId)));
    }

    function getLatestLayDate(snake, options = {}) {
        if (!snake || normalizeSex(snake.sex) !== "Female") {
            return "";
        }

        const snakes = Array.isArray(options.snakes) ? options.snakes : [];
        const pairs = Array.isArray(options.breedingPairs) ? options.breedingPairs : [];
        const clutches = Array.isArray(options.clutches) ? options.clutches : [];
        const dates = [
            ...pairs
                .filter(pair => isSameFemale(pair, snake, snakes))
                .map(pair => text(pair.eggsLaidDate)),
            ...clutches
                .filter(clutch => isSameFemale(clutch, snake, snakes))
                .map(clutch => text(clutch.laidDate))
        ].filter(date => parseDate(date));

        return dates.sort().slice(-1)[0] || "";
    }

    function getPostLayRecovery(snake, today, options = {}) {
        const lastLayDate = getLatestLayDate(snake, options);

        if (!lastLayDate) {
            return null;
        }

        const holdUntil = addMonths(lastLayDate, POST_LAY_HOLD_MONTHS);
        const daysLeft = daysBetween(today, holdUntil);
        const active = daysLeft !== null && daysLeft > 0;

        return {
            lastLayDate,
            holdUntil,
            daysLeft,
            active,
            months: POST_LAY_HOLD_MONTHS
        };
    }

    function check(code, label, state, detail) {
        return {
            code,
            label,
            state,
            detail: text(detail)
        };
    }

    function getPairingReadiness(snake, options = {}) {
        const settings = typeof options === "string" ? { today: options } : (options || {});
        const today = settings.today || todayText();
        const subject = snake && typeof snake === "object" ? snake : {};
        const sex = normalizeSex(subject.sex);
        const rules = getReadinessRules(sex);
        const checks = [];
        const weight = Number(subject.weight);

        if (rules) {
            checks.push(check("sex", `Sex: ${sex}`, "pass", `${rules.minWeight}g and ${rules.minAgeLabel} minimum`));
        } else {
            checks.push(check("sex", "Sex not recorded", "fail", "Set the snake to Female or Male first."));
        }

        if (isActiveSnake(subject)) {
            checks.push(check("active", "Active record", "pass", subject.status ? `Status: ${subject.status}` : ""));
        } else {
            checks.push(check(
                "active",
                "Record is not active",
                "fail",
                subject.status ? `Status: ${subject.status}` : "Sold, archived and deceased snakes cannot be paired."
            ));
        }

        const ageDays = daysBetween(subject.hatchDate, today);
        const hatchYear = Number(subject.hatchYear);
        const hasHatchYear = Number.isInteger(hatchYear) && hatchYear >= 1900;
        let ageBlocksStatus = false;
        let ageSource = "none";

        if (subject.hatchDate) {
            ageSource = "date";

            if (ageDays === null) {
                ageBlocksStatus = true;
                checks.push(check("age", "Hatch date is invalid", "fail", text(subject.hatchDate)));
            } else if (ageDays < 0) {
                ageBlocksStatus = true;
                checks.push(check("age", "Hatch date is in the future", "fail", text(subject.hatchDate)));
            } else if (rules && ageDays < rules.minAgeDays) {
                ageBlocksStatus = true;
                const monthsShort = Math.ceil((rules.minAgeDays - ageDays) / 30.44);

                checks.push(check(
                    "age",
                    `Too young (${formatAge(ageDays)})`,
                    "fail",
                    `${rules.minAgeLabel} minimum; about ${monthsShort} more month${monthsShort === 1 ? "" : "s"}.`
                ));
            } else {
                checks.push(check(
                    "age",
                    `Age ${formatAge(ageDays)}`,
                    "pass",
                    rules ? `${rules.minAgeLabel} minimum` : "Set sex to check its minimum."
                ));
            }
        } else if (hasHatchYear) {
            ageSource = "year";

            // A year-only record has a range: January 1 is the oldest it can
            // be and December 31 is the youngest. Using the younger end for
            // the pass check is the conservative choice.
            const maxAgeDays = daysBetween(`${hatchYear}-01-01`, today);
            const minAgeDays = daysBetween(`${hatchYear}-12-31`, today);

            if (maxAgeDays === null || maxAgeDays < 0) {
                ageBlocksStatus = true;
                checks.push(check(
                    "age",
                    "Hatch year is in the future",
                    "fail",
                    `Hatch year ${hatchYear}.`
                ));
            } else if (rules && maxAgeDays < rules.minAgeDays) {
                ageBlocksStatus = true;
                checks.push(check(
                    "age",
                    `Too young (hatch year ${hatchYear})`,
                    "fail",
                    `Even a January hatch would be under the ${rules.minAgeLabel} minimum.`
                ));
            } else if (!rules) {
                checks.push(check(
                    "age",
                    `Hatch year ${hatchYear}`,
                    "pass",
                    "Set sex to check its minimum."
                ));
            } else if (minAgeDays >= rules.minAgeDays) {
                checks.push(check(
                    "age",
                    `Age ~${formatAge(minAgeDays)} (${hatchYear})`,
                    "pass",
                    `Estimated from hatch year; ${rules.minAgeLabel} minimum.`
                ));
            } else {
                checks.push(check(
                    "age",
                    `Age estimate near minimum (${hatchYear})`,
                    "warn",
                    `Between ${formatAge(minAgeDays)} and ${formatAge(maxAgeDays)} old; verify the year or use weight.`
                ));
            }
        } else {
            // Older records often have no hatch date or year. Do not make the
            // status label a gate: a heavy, healthy Holdback or Juvenile should
            // still turn up in the breedable list so the keeper can inspect and
            // correct the record. Weight and health checks still apply.
            checks.push(check(
                "age",
                "Hatch age not recorded",
                "warn",
                "Enter a hatch date or hatch year; weight and health checks still apply."
            ));
        }

        const statusLabel = text(subject.status);
        const matureStatus = ["adult", "breeder"].includes(statusLabel.toLowerCase());

        if (isActiveSnake(subject) && !matureStatus && !ageBlocksStatus) {
            checks.push(check(
                "status",
                statusLabel ? `Status says ${statusLabel}` : "Status not set",
                "warn",
                "Update it to Adult or Breeder once maturity is confirmed."
            ));
        }

        if (!Number.isFinite(weight) || weight <= 0) {
            checks.push(check(
                "weight",
                "Weight missing",
                "fail",
                rules ? `Needed to confirm the ${rules.minWeight}g minimum.` : "Needed to confirm breeding condition."
            ));
        } else if (rules && weight < rules.minWeight) {
            checks.push(check(
                "weight",
                `Underweight (${formatWeight(weight)})`,
                "fail",
                `${rules.minWeight}g minimum; ${rules.minWeight - weight}g to go.`
            ));
        } else {
            checks.push(check(
                "weight",
                `Weight ${formatWeight(weight)}`,
                "pass",
                rules ? `${rules.minWeight}g minimum` : "Set sex to check its minimum."
            ));
        }

        const postLay = getPostLayRecovery(subject, today, settings);

        if (postLay) {
            if (postLay.active) {
                checks.push(check(
                    "post-lay-hold",
                    "Post-lay recovery hold",
                    "fail",
                    `Last laid ${postLay.lastLayDate}; hold until ${postLay.holdUntil} (${postLay.daysLeft} day${postLay.daysLeft === 1 ? "" : "s"} left).`
                ));
            } else {
                checks.push(check(
                    "post-lay-hold",
                    "Post-lay recovery complete",
                    "pass",
                    `Last laid ${postLay.lastLayDate}; hold ended ${postLay.holdUntil}.`
                ));
            }
        }

        if (window.SnakeHealth) {
            const health = window.SnakeHealth;
            const quarantine = health.getQuarantineStatus(subject, today);

            if (quarantine.active) {
                checks.push(check("quarantine", "In quarantine", "fail", quarantine.label));
            } else if (quarantine.state === "scheduled") {
                checks.push(check("quarantine", "Quarantine scheduled", "warn", quarantine.label));
            } else {
                checks.push(check("quarantine", "Not in quarantine", "pass", ""));
            }

            const openFollowUps = health.getOpenFollowUps(subject, today);

            if (openFollowUps.length > 0) {
                checks.push(check(
                    "follow-up",
                    "Follow-up due",
                    "fail",
                    openFollowUps.map(item => item.status.label).join(" · ")
                ));
            }

            const severeEvents = health.getHealthHistory(subject)
                .filter(entry => text(entry.severity) === "Severe" && !entry.resolvedDate);

            if (severeEvents.length > 0) {
                checks.push(check(
                    "severe",
                    "Severe health event unresolved",
                    "fail",
                    severeEvents.map(entry => [entry.date, entry.type].filter(Boolean).join(" ")).join(" · ")
                ));
            }

            const regurgitation = health.getLatestRegurgitation(subject, today);

            if (regurgitation) {
                checks.push(check(
                    "regurgitation",
                    "Recent regurgitation",
                    "fail",
                    `${regurgitation.date}. Let the digestive tract settle before pairing.`
                ));
            }

            const weightTrend = health.getWeightTrend(subject, today);

            if (weightTrend && weightTrend.changePercent <= -5) {
                checks.push(check(
                    "weight-loss",
                    `Weight down ${Math.abs(weightTrend.changePercent).toFixed(1)}%`,
                    "warn",
                    `${weightTrend.baseline.weight}g → ${weightTrend.latest.weight}g`
                ));
            }

            const refusals = health.getRecentRefusals(subject, today);

            if (refusals.length >= 2) {
                checks.push(check(
                    "refusals",
                    `${refusals.length} refusals in 21 days`,
                    "warn",
                    "Offer a smaller meal and check temperatures before pairing."
                ));
            }
        }

        if (subject.feedingHold && text(subject.feedingHold.reason)) {
            checks.push(check(
                "feeding-hold",
                "On a feeding hold",
                "warn",
                [subject.feedingHold.reason, subject.feedingHold.since].filter(Boolean).join(" since ")
            ));
        }

        const blockers = checks
            .filter(item => item.state === "fail")
            .map(item => ({ code: item.code, label: item.label, detail: item.detail }));
        const warnings = checks
            .filter(item => item.state === "warn")
            .map(item => ({ code: item.code, label: item.label, detail: item.detail }));
        const ready = blockers.length === 0;

        return {
            ready,
            state: ready ? "ready" : "not-ready",
            label: ready ? "Ready to pair" : "Not ready",
            summary: ready
                ? "Ready to pair"
                : `Not ready: ${blockers.map(item => item.label).join(" · ")}`,
            sex,
            rules,
            ageDays,
            ageSource,
            hatchYear: hasHatchYear ? hatchYear : null,
            weight: Number.isFinite(weight) && weight > 0 ? weight : null,
            postLay,
            checks,
            blockers,
            warnings
        };
    }

    function getReadinessBadge(snake, options = {}) {
        const readiness = getPairingReadiness(snake, options);

        if (readiness.ready) {
            return {
                label: "Ready to pair",
                className: "readiness-badge-ready",
                title: [readiness.summary]
                    .concat(readiness.warnings.map(item => item.label))
                    .join(" · ")
            };
        }

        if (!options.showNotReady) {
            return null;
        }

        return {
            label: "Not ready",
            className: "readiness-badge-not",
            title: readiness.blockers
                .map(item => [item.label, item.detail].filter(Boolean).join(": "))
                .join(" · ")
        };
    }

    window.SnakeReadiness = {
        READINESS_RULES,
        POST_LAY_HOLD_MONTHS,
        todayText,
        parseDate,
        daysBetween,
        addMonths,
        formatAge,
        getReadinessRules,
        normalizeSex,
        getLatestLayDate,
        getPostLayRecovery,
        getPairingReadiness,
        getReadinessBadge
    };
})();
