const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const context = { console };

context.window = context;
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(projectRoot, "sales-helpers.js"), "utf8"),
    context,
    { filename: "sales-helpers.js" }
);

const sales = context.window.SaleHolds;
const TODAY = "2026-11-03";

function snake(overrides = {}) {
    return {
        name: "Luna",
        status: "On Hold",
        holdBuyer: "Sam",
        holdPrice: "400",
        holdDeposit: "150",
        holdDepositDate: "2026-10-20",
        holdDueDate: "2026-11-15",
        ...overrides
    };
}

test("a hold knows what was paid, what is owed and when it is due", () => {
    const hold = sales.getHold(snake(), TODAY);

    assert.equal(hold.active, true);
    assert.equal(hold.agreedPrice, 400);
    assert.equal(hold.deposit, 150);
    assert.equal(hold.balance, 250);
    assert.equal(hold.daysLeft, 12);
    assert.equal(hold.overdue, false);
    assert.equal(hold.dueSoon, false);
});

test("a passed pickup date reads as overdue", () => {
    const hold = sales.getHold(snake({ holdDueDate: "2026-10-30" }), TODAY);

    assert.equal(hold.overdue, true);
    assert.equal(hold.daysLeft, -4);
    assert.equal(sales.describeDays(hold.daysLeft), "4 days late");

    const badge = sales.getSaleBadge(snake({ holdDueDate: "2026-10-30" }), { today: TODAY });

    assert.equal(badge.label, "Hold overdue");
    assert.equal(badge.className, "sale-badge-overdue");
    assert.match(badge.title, /4 days late/);
});

test("a pickup due today is not late", () => {
    const hold = sales.getHold(snake({ holdDueDate: TODAY }), TODAY);

    assert.equal(hold.overdue, false);
    assert.equal(hold.daysLeft, 0);
    assert.equal(sales.describeDays(0), "today");
});

test("an available snake shows a for-sale badge with its asking price", () => {
    const badge = sales.getSaleBadge({
        name: "Nova",
        status: "Available",
        salePrice: "500"
    }, { today: TODAY });

    assert.equal(badge.label, "For sale \u00b7 $500");
    assert.equal(badge.className, "sale-badge-available");
});

test("an available snake without a price still reads for sale", () => {
    const badge = sales.getSaleBadge({ name: "Nova", status: "Available" }, { today: TODAY });

    assert.equal(badge.label, "For sale");
    assert.match(badge.title, /no asking price/);
});

test("a holdback is not for sale even with a price recorded", () => {
    const badge = sales.getSaleBadge({
        name: "Nova",
        status: "Holdback",
        salePrice: "500"
    }, { today: TODAY });

    assert.equal(badge, null);
});

test("a sold snake shows its sale, not an active hold", () => {
    const sold = sales.getHold(snake({ status: "Sold", saleDate: "2026-10-01" }), TODAY);
    const badge = sales.getSaleBadge(snake({ status: "Sold", saleDate: "2026-10-01" }), { today: TODAY });
    const summary = sales.getSaleSummary(snake({ status: "Sold", saleDate: "2026-10-01" }), { today: TODAY });

    assert.equal(sold.active, false);
    assert.equal(badge.label, "$400");
    assert.match(badge.title, /Sold for \$400/);
    assert.match(summary, /deposit is part of the sale price/);
});

test("the final sale price wins over an out-of-date agreed price", () => {
    const sold = snake({ status: "Sold", saleDate: "2026-11-01", salePrice: "375" });
    const hold = sales.getHold(sold, TODAY);
    const summary = sales.getSaleSummary(sold, { today: TODAY });

    assert.equal(hold.agreedPrice, 375);
    assert.equal(sales.getSaleBadge(sold, { today: TODAY }).label, "$375");
    assert.match(summary, /Sold for \$375/);
});

test("the hold summary says the balance and the pickup date", () => {
    const summary = sales.getSaleSummary(snake(), { today: TODAY });

    assert.match(summary, /Held for Sam/);
    assert.match(summary, /\$150(\.00)? of \$400(\.00)? paid/);
    assert.match(summary, /\$250(\.00)? balance/);
    assert.match(summary, /pickup by 2026-11-15 \(in 12 days\)/);
});

test("a hold expires only after 30 full days past the pickup date", () => {
    const atThirty = sales.getHold(snake({ holdDueDate: "2026-10-04" }), TODAY);
    const atTwentyNine = sales.getHold(snake({ holdDueDate: "2026-10-05" }), TODAY);
    const badge = sales.getSaleBadge(snake({ holdDueDate: "2026-10-01" }), { today: TODAY });

    assert.equal(atThirty.daysPastDue, 30);
    assert.equal(atThirty.expired, true);
    assert.equal(atTwentyNine.daysPastDue, 29);
    assert.equal(atTwentyNine.expired, false);
    assert.equal(badge.label, "Hold expired");
    assert.equal(badge.className, "sale-badge-expired");
});

test("the expiry grace period can be shorter or longer than 30 days", () => {
    const late = snake({ holdDueDate: "2026-10-01" });
    const longer = sales.getHold(late, TODAY, 45);
    const badge = sales.getSaleBadge(late, { today: TODAY, graceDays: 45 });
    const list = sales.listHolds([late], { today: TODAY, graceDays: 45 });

    assert.equal(sales.getHold(late, TODAY, 30).expired, true);
    assert.equal(longer.expired, false);
    assert.equal(longer.overdue, true);
    assert.equal(badge.label, "Hold overdue");
    assert.equal(list.expiredCount, 0);
});

test("a payment plan keeps a late hold from being marked expired", () => {
    const hold = sales.getHold(snake({ holdDueDate: "2026-10-01", holdPaymentPlan: true }), TODAY);

    assert.equal(hold.overdue, true);
    assert.equal(hold.expired, false);
    assert.match(sales.getSaleSummary(snake({ holdDueDate: "2026-10-01", holdPaymentPlan: true }), { today: TODAY }), /payment plan agreed/);
});

test("releasing a hold archives it and puts the snake back up for sale", () => {
    const released = sales.releaseHold(snake(), {
        today: TODAY,
        disposition: "forfeit"
    });

    assert.equal(released.status, "Available");
    assert.equal(released.holdBuyer, "");
    assert.equal(released.holdDeposit, "");
    assert.equal(released.holdDueDate, "");
    assert.equal(sales.getHold(released, TODAY).active, false);
    assert.equal(released.holdHistory.length, 1);
    assert.equal(released.holdHistory[0].deposit, 150);
    assert.equal(released.holdHistory[0].disposition, "forfeit");
    assert.equal(released.holdHistory[0].releasedDate, TODAY);
    assert.match(sales.getReleasedHoldLines(released)[0], /forfeited/);
});

test("a returned deposit is marked refunded, a transferred one keeps its destination", () => {
    const returned = sales.releaseHold(snake(), { today: TODAY, disposition: "return" });
    const transferred = sales.releaseHold(snake(), {
        today: TODAY,
        disposition: "transfer",
        transferTo: "Kaa"
    });

    assert.equal(returned.holdHistory[0].refunded, true);
    assert.equal(transferred.holdHistory[0].disposition, "transfer");
    assert.equal(transferred.holdHistory[0].transferTo, "Kaa");
    assert.match(sales.getReleasedHoldLines(transferred)[0], /transferred · to Kaa/);
});

test("extending a late hold counts from today and clears the expiry", () => {
    const extended = sales.extendHold(snake({ holdDueDate: "2026-10-01" }), { today: TODAY });
    const fromFuture = sales.extendHold(snake({ holdDueDate: "2026-11-15" }), { today: TODAY });

    assert.equal(extended.holdDueDate, "2026-12-03");
    assert.equal(sales.getHold(extended, TODAY).expired, false);
    assert.equal(fromFuture.holdDueDate, "2026-12-15");
    assert.equal(
        sales.extendHold(snake({ holdDueDate: "2026-10-01" }), { today: TODAY, days: 45 }).holdDueDate,
        "2026-12-18"
    );
});

test("the dashboard reminders include expired, late and due-soon holds only", () => {
    const summary = sales.listHoldReminders([
        snake({ name: "Expired", holdDueDate: "2026-09-01" }),
        snake({ name: "Late", holdDueDate: "2026-10-30" }),
        snake({ name: "Soon", holdDueDate: "2026-11-06" }),
        snake({ name: "Later", holdDueDate: "2026-11-20" }),
        snake({ name: "No date", holdDueDate: "" })
    ], { today: TODAY, graceDays: 30 });

    assert.equal(summary.holds.length, 3);
    assert.equal(summary.holds[0].snake.name, "Expired");
    assert.equal(summary.expiredCount, 1);
    assert.equal(summary.overdueCount, 2);
    assert.equal(summary.dueSoonCount, 1);
    assert.equal(summary.undatedCount, 1);
    assert.equal(summary.nextDue.snake.name, "Later");
});

test("the hold list puts overdue first and totals the money", () => {
    const summary = sales.listHolds([
        snake({ name: "Later", holdDueDate: "2026-12-01", holdDeposit: "100", holdPrice: "300" }),
        snake({ name: "Late", holdDueDate: "2026-10-01", holdDeposit: "50", holdPrice: "200" }),
        { name: "Sold one", status: "Sold", salePrice: "300", saleDate: "2026-09-01" },
        { name: "Just a pet", status: "Holdback" }
    ], { today: TODAY });

    assert.equal(summary.holds.length, 2);
    assert.equal(summary.holds[0].snake.name, "Late");
    assert.equal(summary.overdueCount, 1);
    assert.equal(summary.expiredCount, 1);
    assert.equal(summary.depositTotal, 150);
    assert.equal(summary.balanceTotal, 350);
});
