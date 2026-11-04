// sales-helpers.js
// The sale side of a snake record: whether it is for sale, who has it on hold,
// what they have paid, and what is still owed.
//
// A deposit is cash received but not a sale. The Finance page counts it as
// "Hold deposits" while the animal is held, then folds it into the sale price
// when the snake is marked Sold, so the same money is never counted twice.
//
// Everything here is pure: pages pass snakes in and get plain objects back.

(function () {
    const HOLD_STATUS = "On Hold";
    const SALE_STATUSES = ["Available", "On Hold"];
    const SOLD_STATUS = "Sold";
    const RETIRED_STATUSES = ["Archived", "Deceased"];
    const DUE_SOON_DAYS = 7;
    // A hold is not released automatically. After this many days past the
    // pickup date it is flagged as expired, and the keeper decides whether the
    // deposit is forfeited, transferred or returned.
    const HOLD_EXPIRY_DAYS = 30;

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function roundMoney(value) {
        return Math.round((Number(value) || 0) * 100) / 100;
    }

    function money(value) {
        if (value === "" || value === null || value === undefined) {
            return 0;
        }

        return roundMoney(value);
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

    function dateText(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return "";
        }

        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function todayText() {
        return dateText(new Date());
    }

    function daysBetween(fromValue, toValue) {
        const from = parseDate(fromValue);
        const to = parseDate(toValue);

        if (!from || !to) {
            return null;
        }

        return Math.round((to - from) / (1000 * 60 * 60 * 24));
    }

    // "in 12 days", "today", "3 days late" — the phrasing a keeper uses at the
    // rack, not a date they have to count themselves.
    function describeDays(days) {
        if (days === null || days === undefined) {
            return "";
        }

        if (days === 0) {
            return "today";
        }

        if (days > 0) {
            return `in ${days} day${days === 1 ? "" : "s"}`;
        }

        return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late`;
    }

    function isSold(snake) {
        return text(snake && snake.status) === SOLD_STATUS;
    }

    function isRetired(snake) {
        return RETIRED_STATUSES.includes(text(snake && snake.status));
    }

    function isForSale(snake) {
        return SALE_STATUSES.includes(text(snake && snake.status));
    }

    function normalizeGraceDays(value) {
        const days = Math.round(Number(value));

        return days > 0 ? days : HOLD_EXPIRY_DAYS;
    }

    function getHold(snake, today = todayText(), graceDays = HOLD_EXPIRY_DAYS) {
        const status = text(snake && snake.status);
        const grace = normalizeGraceDays(graceDays);
        const deposit = money(snake && snake.holdDeposit);
        const sold = status === SOLD_STATUS;
        // Once sold, the final sale price is the truth. Before that, the agreed
        // price on the hold is what the buyer was promised.
        const agreedPrice = sold
            ? (money(snake && snake.salePrice) || money(snake && snake.holdPrice))
            : (money(snake && snake.holdPrice) || money(snake && snake.salePrice));
        const depositDate = text(snake && snake.holdDepositDate).slice(0, 10);
        const dueDate = text(snake && snake.holdDueDate).slice(0, 10);
        const buyer = text(snake && snake.holdBuyer);
        // A price alone is an asking price, not a hold. A buyer, a deposit or a
        // pickup date is what makes the animal promised to someone.
        const hasHoldDetails = Boolean(buyer) || deposit > 0 || Boolean(dueDate);
        const active = !sold && !isRetired(snake) && (status === HOLD_STATUS || hasHoldDetails);
        const balance = agreedPrice > 0 ? Math.max(0, roundMoney(agreedPrice - deposit)) : 0;
        const daysLeft = active && parseDate(dueDate) ? daysBetween(today, dueDate) : null;
        const overdue = Boolean(active && daysLeft !== null && daysLeft < 0);
        const paymentPlan = Boolean(snake && snake.holdPaymentPlan);
        const daysPastDue = overdue ? Math.abs(daysLeft) : 0;
        const expired = Boolean(active && !paymentPlan && daysLeft !== null && daysLeft <= -grace);

        return {
            status,
            buyer,
            agreedPrice,
            deposit,
            depositDate,
            dueDate,
            note: text(snake && snake.holdNote),
            active,
            sold,
            paymentPlan,
            hasPrice: agreedPrice > 0,
            hasDeposit: deposit > 0,
            balance,
            daysLeft,
            overdue,
            daysPastDue,
            expired,
            dueSoon: Boolean(active && !overdue && daysLeft !== null && daysLeft <= DUE_SOON_DAYS)
        };
    }

    function formatMoneyShort(value, options = {}) {
        const format = typeof options.formatMoney === "function"
            ? options.formatMoney
            : amount => `$${roundMoney(amount).toFixed(2)}`;

        // A badge is narrow: $400.00 reads as $400 unless cents matter.
        return format(value).replace(/\.00(?=\D*$)/, "");
    }

    // The pill shown on a collection card or table row. Null means "no sale
    // badge belongs here" (a breeder, holdback, archived animal, and so on).
    function getSaleBadge(snake, options = {}) {
        const today = options.today || todayText();
        const hold = getHold(snake, today, options.graceDays);

        if (hold.sold) {
            // The status already says Sold; the badge adds the money at a glance.
            return {
                label: hold.hasPrice ? formatMoneyShort(hold.agreedPrice, options) : "No price",
                className: "sale-badge-sold",
                title: hold.hasPrice
                    ? `Sold for ${formatMoneyShort(hold.agreedPrice, options)}`
                    : "Marked Sold without a sale price"
            };
        }

        if (hold.active) {
            const parts = [];

            if (hold.buyer) {
                parts.push(`Held for ${hold.buyer}`);
            }

            if (hold.hasPrice) {
                parts.push(`${formatMoneyShort(hold.deposit, options)} of ${formatMoneyShort(hold.agreedPrice, options)} paid`);
            } else if (hold.hasDeposit) {
                parts.push(`${formatMoneyShort(hold.deposit, options)} deposit received`);
            }

            if (hold.balance > 0) {
                parts.push(`${formatMoneyShort(hold.balance, options)} balance`);
            }

            if (hold.dueDate) {
                parts.push(`Due ${hold.dueDate} (${describeDays(hold.daysLeft)})`);
            } else {
                parts.push("No pickup date set");
            }

            if (hold.paymentPlan) {
                parts.push("Payment plan agreed");
            }

            return {
                label: hold.expired ? "Hold expired" : hold.overdue ? "Hold overdue" : "On hold",
                className: hold.expired
                    ? "sale-badge-expired"
                    : hold.overdue
                        ? "sale-badge-overdue"
                        : "sale-badge-hold",
                title: parts.join(" \u00b7 ")
            };
        }

        if (text(snake && snake.status) === "Available") {
            return {
                label: hold.hasPrice ? `For sale \u00b7 ${formatMoneyShort(hold.agreedPrice, options)}` : "For sale",
                className: "sale-badge-available",
                title: hold.hasPrice ? "Available with an asking price" : "Available with no asking price recorded"
            };
        }

        return null;
    }

    // The paragraph under the hold fields on a snake record.
    function getSaleSummary(snake, options = {}) {
        const today = options.today || todayText();
        const hold = getHold(snake, today, options.graceDays);
        const fmt = value => formatMoneyShort(value, options);

        if (hold.sold) {
            return hold.hasPrice
                ? `Sold for ${fmt(hold.agreedPrice)}${hold.buyer ? ` to ${hold.buyer}` : ""}. The deposit is part of the sale price.`
                : "Marked Sold. Add the sale price to put it in the money ledger.";
        }

        if (hold.active) {
            const parts = [];

            if (hold.buyer) {
                parts.push(`Held for ${hold.buyer}`);
            }

            if (hold.hasPrice) {
                parts.push(`${fmt(hold.deposit)} of ${fmt(hold.agreedPrice)} paid`);
            } else if (hold.hasDeposit) {
                parts.push(`${fmt(hold.deposit)} deposit received, no agreed price`);
            } else {
                parts.push("No deposit recorded");
            }

            if (hold.hasPrice) {
                parts.push(`${fmt(hold.balance)} balance`);
            }

            if (hold.dueDate) {
                parts.push(hold.overdue
                    ? `pickup was due ${hold.dueDate} (${describeDays(hold.daysLeft)})`
                    : `pickup by ${hold.dueDate} (${describeDays(hold.daysLeft)})`);
            } else {
                parts.push("no pickup date set");
            }

            if (hold.paymentPlan) {
                parts.push("payment plan agreed");
            }

            const summary = parts.join(" \u00b7 ");

            return hold.expired ? `Hold expired \u2014 ${summary}. Decide the deposit in Finances \u2192 Holds.` : summary;
        }

        if (text(snake && snake.status) === "Available") {
            return hold.hasPrice
                ? `For sale at ${fmt(hold.agreedPrice)}. No hold recorded.`
                : "For sale. No asking price recorded yet.";
        }

        return "";
    }

    // ---- Released holds ----------------------------------------------------

    function holdHistory(snake) {
        return Array.isArray(snake && snake.holdHistory)
            ? snake.holdHistory.filter(entry => entry && typeof entry === "object")
            : [];
    }

    function describeDisposition(disposition) {
        const key = text(disposition);

        if (key === "return") {
            return "returned";
        }

        if (key === "transfer") {
            return "transferred";
        }

        return "forfeited";
    }

    // One line per released hold, so a record keeps the story of every deposit
    // even after the working hold fields are cleared.
    function getReleasedHoldLines(snake, options = {}) {
        const fmt = value => formatMoneyShort(value, options);

        return holdHistory(snake).map(entry => {
            const parts = [];
            const buyer = text(entry.buyer);
            const deposit = money(entry.deposit);
            const transferTo = text(entry.transferTo);
            const releasedDate = text(entry.releasedDate).slice(0, 10);

            if (buyer) {
                parts.push(buyer);
            }

            if (deposit > 0) {
                parts.push(`${fmt(deposit)} deposit`);
            }

            parts.push(describeDisposition(entry.disposition));

            if (transferTo) {
                parts.push(`to ${transferTo}`);
            }

            if (releasedDate) {
                parts.push(`released ${releasedDate}`);
            }

            return parts.join(" \u00b7 ");
        });
    }

    // Ends a hold without pretending it was a sale. The deposit and buyer stay
    // in holdHistory so the ledger can keep counting the cash and the record
    // still explains where the animal went.
    function releaseHold(snake, options = {}) {
        if (!snake) {
            return null;
        }

        const today = options.today || todayText();
        const hold = getHold(snake, today);

        if (!hold.active) {
            return null;
        }

        const disposition = ["forfeit", "transfer", "return"].includes(options.disposition)
            ? options.disposition
            : "forfeit";
        const entry = {
            buyer: hold.buyer,
            agreedPrice: hold.agreedPrice,
            deposit: hold.deposit,
            depositDate: hold.depositDate,
            dueDate: hold.dueDate,
            note: hold.note,
            paymentPlan: hold.paymentPlan,
            releasedDate: today,
            disposition,
            transferTo: disposition === "transfer" ? text(options.transferTo) : "",
            refunded: disposition === "return"
        };

        return {
            ...snake,
            status: "Available",
            holdBuyer: "",
            holdPrice: "",
            holdDeposit: "",
            holdDepositDate: "",
            holdDueDate: "",
            holdNote: "",
            holdPaymentPlan: false,
            holdHistory: [...holdHistory(snake), entry]
        };
    }

    // Adds time to a hold that is still running. Extending an already-late hold
    // counts from today, so a single click always clears the overdue flag.
    function extendHold(snake, options = {}) {
        if (!snake) {
            return null;
        }

        const today = options.today || todayText();
        const hold = getHold(snake, today);

        if (!hold.active) {
            return null;
        }

        const days = Number(options.days) > 0 ? Math.round(Number(options.days)) : HOLD_EXPIRY_DAYS;
        const due = parseDate(hold.dueDate);
        const todayDate = parseDate(today);
        const base = due && todayDate && due > todayDate ? hold.dueDate : today;
        const shifted = parseDate(base);

        if (!shifted) {
            return null;
        }

        shifted.setDate(shifted.getDate() + days);

        return { ...snake, holdDueDate: dateText(shifted) };
    }

    function listHolds(snakes, options = {}) {
        const today = options.today || todayText();
        const holds = (snakes || [])
            .map(snake => ({ snake, hold: getHold(snake, today, options.graceDays) }))
            .filter(item => item.hold.active)
            .sort((left, right) => {
                if (left.hold.expired !== right.hold.expired) {
                    return left.hold.expired ? -1 : 1;
                }

                if (left.hold.overdue !== right.hold.overdue) {
                    return left.hold.overdue ? -1 : 1;
                }

                return String(left.hold.dueDate || "9999").localeCompare(String(right.hold.dueDate || "9999"))
                    || String(left.snake.name || "").localeCompare(String(right.snake.name || ""));
            });

        return {
            holds,
            depositTotal: roundMoney(holds.reduce((sum, item) => sum + item.hold.deposit, 0)),
            balanceTotal: roundMoney(holds.reduce((sum, item) => sum + item.hold.balance, 0)),
            overdueCount: holds.filter(item => item.hold.overdue).length,
            expiredCount: holds.filter(item => item.hold.expired).length
        };
    }

    // The dashboard slice: anything late, expired or inside the pickup warning
    // window, plus enough context to say what is coming after that.
    function listHoldReminders(snakes, options = {}) {
        const summary = listHolds(snakes, options);
        const reminders = summary.holds.filter(item => item.hold.overdue || item.hold.dueSoon);
        const nextDue = summary.holds.find(item => item.hold.dueDate
            && item.hold.daysLeft !== null
            && item.hold.daysLeft > DUE_SOON_DAYS) || null;

        return {
            holds: reminders,
            activeCount: summary.holds.length,
            expiredCount: reminders.filter(item => item.hold.expired).length,
            overdueCount: reminders.filter(item => item.hold.overdue).length,
            dueSoonCount: reminders.filter(item => item.hold.dueSoon).length,
            undatedCount: summary.holds.filter(item => !item.hold.dueDate).length,
            nextDue
        };
    }

    window.SaleHolds = {
        HOLD_STATUS,
        SALE_STATUSES,
        SOLD_STATUS,
        DUE_SOON_DAYS,
        HOLD_EXPIRY_DAYS,
        normalizeGraceDays,
        parseDate,
        dateText,
        todayText,
        daysBetween,
        describeDays,
        isSold,
        isRetired,
        isForSale,
        getHold,
        getSaleBadge,
        getSaleSummary,
        holdHistory,
        describeDisposition,
        getReleasedHoldLines,
        releaseHold,
        extendHold,
        listHolds,
        listHoldReminders
    };
})();
