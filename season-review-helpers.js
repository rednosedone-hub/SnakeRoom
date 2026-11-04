// season-review-helpers.js
// What actually happened in one breeding season: the eggs, the hatchlings,
// where they went, and the money beside them.
//
// The review keeps production and cash apart on purpose. An animal kept back
// is an asset in the room, not a sale, so it can never appear as revenue —
// which is exactly why a holdback-heavy season can show a cash loss while it
// is doing what it was meant to do. The verdict says so in words rather than
// letting a negative net read as a failed season.

(function () {
    const GROUPS = [
        {
            key: "retained",
            label: "Kept back",
            statuses: ["Holdback", "Breeder"],
            note: "Marked Holdback or Breeder for your own plans."
        },
        {
            key: "forSale",
            label: "For sale",
            statuses: ["Available", "On Hold"],
            note: "Listed or promised, waiting for a buyer."
        },
        {
            key: "growing",
            label: "Growing out",
            statuses: ["Hatchling", "Juvenile", "Sub-Adult", "Adult"],
            note: "Still too young, or too early to decide."
        },
        {
            key: "sold",
            label: "Sold",
            statuses: ["Sold"],
            note: "Left the room and brought money in."
        },
        {
            key: "lost",
            label: "Lost",
            statuses: ["Archived", "Deceased"],
            note: "Archived or deceased."
        }
    ];

    // Same categories the Finances page totals, in the order a keeper reads
    // them: money in first, then what it cost.
    const MONEY_ROWS = [
        { key: "snake-sale", label: "Snake sales" },
        { key: "hold-deposit", label: "Hold deposits" },
        { key: "show-revenue", label: "Show revenue" },
        { key: "snake-purchase", label: "Snake purchases" },
        { key: "hold-refund", label: "Deposit refunds" },
        { key: "feeders", label: "Feeder orders" },
        { key: "show-cost", label: "Show costs" },
        { key: "supplies", label: "Supplies" },
        { key: "vet", label: "Vet" },
        { key: "shipping", label: "Shipping" },
        { key: "other", label: "Other" }
    ];

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function roundMoney(value) {
        return Math.round((Number(value) || 0) * 100) / 100;
    }

    function roundPercent(value) {
        return Math.round((Number(value) || 0) * 10) / 10;
    }

    function yearOf(value) {
        const match = /^(\d{4})/.exec(text(value));

        return match ? Number(match[1]) : null;
    }

    function currentYear() {
        return new Date().getFullYear();
    }

    function groupForStatus(status) {
        const clean = text(status);

        return GROUPS.find(group => group.statuses.includes(clean)) || GROUPS[2];
    }

    // References are ids on new records and indexes on older ones, the same
    // rule the rest of the breeding pages use.
    function findSnake(snakes, reference) {
        if (!reference && reference !== 0) {
            return null;
        }

        if (typeof reference === "number") {
            return snakes[reference] || null;
        }

        return snakes.find(snake => String(snake.id || "") === String(reference)) || null;
    }

    function snakeName(snake) {
        return snake ? text(snake.name) || "Unnamed" : "Unknown";
    }

    function pairLabel(clutch, snakes) {
        const female = findSnake(snakes, clutch.femaleSnakeId || clutch.femaleIndex);
        const male = findSnake(snakes, clutch.maleSnakeId || clutch.maleIndex);

        return `${snakeName(female)} x ${snakeName(male)}`;
    }

    // The season a clutch belongs to: when it was laid, or when it hatched if
    // the laid date was never recorded, or the year the clutch was created in.
    function clutchYear(clutch) {
        return yearOf(clutch && clutch.laidDate)
            || yearOf(clutch && clutch.hatchedDate)
            || yearOf(clutch && clutch.year);
    }

    function isHatchedClutch(clutch) {
        return Boolean(clutch && (clutch.convertedToSnakes || clutch.hatchedDate));
    }

    function hatchlingsOf(clutch, snakes) {
        const token = text(clutch && clutch.clutchToken);
        const id = text(clutch && clutch.id);

        return (snakes || []).filter(snake => {
            if (!snake) {
                return false;
            }

            const snakeToken = text(snake.clutchToken);

            if (token && snakeToken) {
                return snakeToken === token;
            }

            return Boolean(id) && text(snake.clutchId) === id;
        });
    }

    // A price on an Available snake is an asking price, not a sale. It counts
    // only once the animal is marked Sold or carries a sale date.
    function realizedSale(snake) {
        if (!snake) {
            return null;
        }

        const finance = window.SnakeFinance;
        const sale = finance && finance.getSnakeSale
            ? finance.getSnakeSale(snake)
            : { amount: Number(snake.salePrice) || 0, date: text(snake.saleDate).slice(0, 10) };
        const amount = roundMoney(sale.amount);

        if (amount <= 0) {
            return null;
        }

        const markedSold = text(snake.status) === "Sold";

        return markedSold || Boolean(sale.date)
            ? { amount, date: text(sale.date).slice(0, 10) }
            : null;
    }

    // The defect catalog is optional here: the season review must still read a
    // record without the defect helpers on the page.
    function defectLabels(snake) {
        if (window.SnakeDefects) {
            return window.SnakeDefects.labels(snake);
        }

        return (Array.isArray(snake && snake.defects) ? snake.defects : [])
            .map(value => text(value))
            .filter(Boolean);
    }

    function summarizeHatchling(snake) {
        const name = text(snake.name) || "Unnamed";
        const morph = text(snake.morph);
        const identity = text(snake.ID);
        const clutch = text(snake.clutchId);
        const defects = defectLabels(snake);

        return {
            id: text(snake.id),
            name,
            // The morph field now carries a hatchling's clutch id, and older
            // records repeated the name there. Neither is a morph worth showing
            // under that heading; the genes hold the real morph.
            morph: morph && morph !== name && morph !== identity && morph !== clutch ? morph : "",
            sex: text(snake.sex) || "Unknown",
            status: text(snake.status) || "No status",
            hatchDate: text(snake.hatchDate).slice(0, 10),
            bin: text(snake.binNumber),
            defects,
            defective: defects.length > 0
        };
    }

    function summarizeClutch(clutch, snakes) {
        const hatchlings = hatchlingsOf(clutch, snakes);
        const counts = { retained: 0, forSale: 0, growing: 0, sold: 0, lost: 0 };
        let revenue = 0;
        let saleCount = 0;
        let soldWithoutPrice = 0;

        hatchlings.forEach(snake => {
            counts[groupForStatus(snake.status).key] += 1;

            const sale = realizedSale(snake);

            if (sale) {
                revenue += sale.amount;
                saleCount += 1;
            } else if (text(snake.status) === "Sold") {
                soldWithoutPrice += 1;
            }
        });

        const isHatched = isHatchedClutch(clutch);
        const eggs = Math.max(0, Math.round(Number(clutch.eggCount) || 0));
        const declared = Math.max(0, Math.round(Number(clutch.hatchlingCount) || 0));
        const hatched = isHatched ? Math.max(declared, hatchlings.length) : 0;
        const summarized = hatchlings.map(summarizeHatchling);
        // A clutch that hatched but produced deformed animals did not really
        // hatch as well as the raw count says. Both numbers stay on the row so
        // the scorecard never hides the difference.
        const defective = isHatched
            ? summarized.filter(hatchling => hatchling.defective).length
            : 0;
        const healthy = Math.max(0, hatched - defective);

        return {
            id: text(clutch.id),
            clutchToken: text(clutch.clutchToken),
            pair: pairLabel(clutch, snakes),
            laidDate: text(clutch.laidDate).slice(0, 10),
            hatchedDate: text(clutch.hatchedDate).slice(0, 10),
            isHatched,
            eggs,
            hatched,
            hatchRate: isHatched && eggs > 0 ? roundPercent((hatched / eggs) * 100) : null,
            healthy,
            defective,
            cleanRate: isHatched && eggs > 0 ? roundPercent((healthy / eggs) * 100) : null,
            defectRate: isHatched && hatched > 0 ? roundPercent((defective / hatched) * 100) : null,
            unhatched: isHatched ? Math.max(0, eggs - hatched) : 0,
            counts,
            hatchlings: summarized,
            revenue: roundMoney(revenue),
            saleCount,
            soldWithoutPrice
        };
    }

    function listYears(clutches, options = {}) {
        const years = new Set(clutches.map(clutchYear).filter(Boolean));
        const fallback = Number(options.currentYear) || currentYear();

        years.add(fallback);

        return [...years].sort((left, right) => right - left);
    }

    function defaultYear(clutches, years) {
        const withClutches = clutches.map(clutchYear).filter(Boolean).sort((left, right) => right - left);

        return withClutches[0] || years[0] || currentYear();
    }

    function moneyFor(options, year) {
        const finance = window.SnakeFinance;

        if (!finance || !finance.getEvents) {
            return null;
        }

        const snakes = options.snakes || [];
        const expenses = options.expenses || [];
        const expos = options.expos || [];
        const events = finance.filterEventsByYear(finance.getEvents(snakes, expenses, expos), year);
        const totals = finance.summarize(events);
        const category = key => totals.byCategory[key] || { in: 0, out: 0 };
        const feeding = finance.getFeederUsage
            ? finance.getFeederUsage(snakes, options.feederPrices || {}, String(year))
            : { total: 0 };
        const spendCount = events.filter(event => event.direction === "out").length;
        const revenueCount = events.filter(event => event.direction === "in").length;

        return {
            revenue: roundMoney(totals.revenue),
            spend: roundMoney(totals.spend),
            net: roundMoney(totals.net),
            revenueCount,
            spendCount,
            sales: roundMoney(category("snake-sale").in),
            showRevenue: roundMoney(category("show-revenue").in),
            purchases: roundMoney(category("snake-purchase").out),
            feederOrders: roundMoney(category("feeders").out),
            showCosts: roundMoney(category("show-cost").out),
            otherCosts: roundMoney(
                category("supplies").out
                + category("vet").out
                + category("shipping").out
                + category("hold-refund").out
                + category("other").out
            ),
            feederEstimate: roundMoney(feeding.total),
            rows: MONEY_ROWS.map(row => ({
                key: row.key,
                label: row.label,
                in: roundMoney(category(row.key).in),
                out: roundMoney(category(row.key).out)
            }))
        };
    }

    function review(options = {}) {
        const snakes = Array.isArray(options.snakes) ? options.snakes : [];
        const clutches = Array.isArray(options.clutches) ? options.clutches : [];
        const listedYears = listYears(clutches);
        const requested = Number(options.year);
        // An explicit year in the URL wins even when no clutch has landed yet,
        // so an empty season can be opened deliberately.
        const requestedYear = Number.isInteger(requested) && requested >= 1900 && requested <= 2100
            ? requested
            : null;
        const year = requestedYear || defaultYear(clutches, listedYears);
        const years = requestedYear && !listedYears.includes(requestedYear)
            ? [...listedYears, requestedYear].sort((left, right) => right - left)
            : listedYears;
        const rows = clutches
            .filter(clutch => clutchYear(clutch) === year)
            .map(clutch => summarizeClutch(clutch, snakes))
            .sort((left, right) =>
                String(right.laidDate || right.hatchedDate).localeCompare(String(left.laidDate || left.hatchedDate))
            );

        const counts = { retained: 0, forSale: 0, growing: 0, sold: 0, lost: 0 };
        const totals = {
            clutches: rows.length,
            waiting: rows.filter(row => !row.isHatched).length,
            eggs: 0,
            completedEggs: 0,
            hatched: 0,
            unhatched: 0,
            counts,
            revenue: 0,
            saleCount: 0,
            soldWithoutPrice: 0
        };

        rows.forEach(row => {
            totals.eggs += row.eggs;
            totals.hatched += row.hatched;
            totals.unhatched += row.unhatched;
            totals.revenue += row.revenue;
            totals.saleCount += row.saleCount;
            totals.soldWithoutPrice += row.soldWithoutPrice;

            if (row.isHatched) {
                totals.completedEggs += row.eggs;
            }

            Object.keys(counts).forEach(key => {
                counts[key] += row.counts[key];
            });
        });

        totals.revenue = roundMoney(totals.revenue);
        totals.hatchRate = totals.completedEggs > 0
            ? roundPercent((totals.hatched / totals.completedEggs) * 100)
            : null;

        const kept = rows
            .flatMap(row => row.hatchlings.filter(hatchling =>
                groupForStatus(hatchling.status).key === "retained"
            ))
            .sort((left, right) => String(right.hatchDate).localeCompare(String(left.hatchDate)));
        const liveHatchlings = counts.retained + counts.forSale + counts.growing;
        // A plan without the money tools must not read cash at all: the
        // verdict would otherwise explain a number the page refuses to show.
        const money = options.includeMoney === false ? null : moneyFor(options, year);
        const breakEven = money && liveHatchlings > 0
            ? roundMoney(money.spend / liveHatchlings)
            : null;

        return {
            year,
            years,
            clutches: rows,
            totals,
            kept,
            liveHatchlings,
            money,
            breakEven,
            disposition: GROUPS.map(group => ({
                key: group.key,
                label: group.label,
                note: group.note,
                count: counts[group.key]
            }))
        };
    }

    function plural(count, singular, pluralWord) {
        return `${count} ${count === 1 ? singular : (pluralWord || `${singular}s`)}`;
    }

    // The sentence at the top of the page. It has one job: a cash loss while
    // animals are kept back is a choice, not a failure, and the page should say
    // that before showing any number that looks like one.
    function verdict(result, options = {}) {
        const format = typeof options.formatMoney === "function"
            ? options.formatMoney
            : value => `$${(Number(value) || 0).toFixed(2)}`;
        const totals = result.totals;
        const money = result.money;
        const counts = totals.counts;
        const live = result.liveHatchlings;
        const priceNote = totals.soldWithoutPrice > 0
            ? ` ${plural(totals.soldWithoutPrice, "sold animal")} ${totals.soldWithoutPrice === 1 ? "has" : "have"} no sale price recorded, so the sales figure is low.`
            : "";

        if (totals.clutches === 0) {
            return {
                tone: "empty",
                headline: `No clutches on record for ${result.year}.`,
                detail: "A season review fills in once a clutch is laid. The money section still counts sales and costs recorded this year."
            };
        }

        if (!money) {
            return {
                tone: "breeding",
                headline: `${plural(totals.hatched, "hatchling")} from ${plural(totals.eggs, "egg")} in ${result.year}.`,
                detail: `${counts.retained > 0 ? `${plural(counts.retained, "animal")} kept back` : "Nothing marked Holdback or Breeder yet"}${counts.sold > 0 ? `, ${plural(counts.sold, "sale")}` : ""}. Money is left out because the money tools are not on this plan.`
            };
        }

        // An empty year must not read as "$0.00 up": nothing has been spent
        // or earned yet, which is a different statement.
        if (money.revenueCount + money.spendCount === 0) {
            return {
                tone: "empty",
                headline: `${plural(totals.hatched, "hatchling")} from ${plural(totals.eggs, "egg")} in ${result.year}.`,
                detail: `${counts.retained > 0
                    ? `${plural(counts.retained, "animal")} ${counts.retained === 1 ? "is" : "are"} marked Holdback or Breeder.`
                    : "Nothing is marked Holdback or Breeder yet."} No money is recorded for ${result.year}, so there is no cash result to report yet.${priceNote}`
            };
        }

        if (money.net < 0 && live > 0) {
            const keptLine = counts.retained > 0
                ? `${plural(counts.retained, "animal")} ${counts.retained === 1 ? "is" : "are"} marked Holdback or Breeder for your own plans`
                : `${plural(live, "animal")} ${live === 1 ? "is" : "are"} still growing out or listed`;
            const soldLine = totals.saleCount > 0
                ? `, and ${plural(totals.saleCount, "sale")} brought in ${format(money.sales)}`
                : "";
            const eggLine = totals.unhatched > 0
                ? ` ${plural(totals.unhatched, "egg")} did not hatch.`
                : "";

            return {
                tone: "investing",
                headline: `${format(Math.abs(money.net))} down in cash, with ${plural(live, "animal")} from this season staying in the room.`,
                detail: `That is a cash result, not a verdict on the season. Animals you keep are never sold, so they cannot show up as revenue. ${keptLine}${soldLine}.${eggLine}${priceNote}`
            };
        }

        if (money.net >= 0 && live > 0) {
            return {
                tone: "positive",
                headline: `${format(money.net)} up in cash, with ${plural(live, "animal")} still in the room.`,
                detail: `Sales brought in ${format(money.revenue)} against ${format(money.spend)} of costs. The ${plural(live, "animal")} kept back ${live === 1 ? "is" : "are"} not counted as revenue — no sale is recorded on them yet.${priceNote}`
            };
        }

        if (money.net >= 0) {
            return {
                tone: "positive",
                headline: `${format(money.net)} up in cash.`,
                detail: `Sales brought in ${format(money.revenue)} against ${format(money.spend)} of costs, and no animal from this season is still in the room.${priceNote}`
            };
        }

        return {
            tone: "down",
            headline: `${format(Math.abs(money.net))} down in cash.`,
            detail: `Costs came to ${format(money.spend)} against ${format(money.revenue)} of sales, and no animal from this season is still in the room to carry that forward.${priceNote}`
        };
    }

    window.SeasonReview = {
        GROUPS,
        MONEY_ROWS,
        yearOf,
        groupForStatus,
        pairLabel,
        clutchYear,
        isHatchedClutch,
        hatchlingsOf,
        realizedSale,
        summarizeClutch,
        listYears,
        review,
        verdict
    };
})();
