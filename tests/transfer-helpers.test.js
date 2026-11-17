const test = require("node:test");
const assert = require("node:assert/strict");

const transfer = require("../transfer-helpers.js");

function snake(overrides = {}) {
    return {
        id: "snake-nova",
        name: "Nova",
        ID: "SS-101",
        morph: "Pastel Banana",
        genes: [{ name: "Pastel" }, { name: "Banana" }],
        sex: "Female",
        status: "Available",
        hatchDate: "2026-05-01",
        weight: "310",
        weightHistory: [{ date: "2026-06-01", weight: 120 }],
        feedingHistory: [{ date: "2026-06-04", feederSize: "Rat Pup", result: "Accepted" }],
        purchasePrice: "900",
        purchaseDate: "2025-01-04",
        purchasedFrom: "A local breeder",
        askingPrice: "1200",
        salePrice: "0",
        soldTo: "Alex Buyer",
        holdBuyer: "Sam Deposit",
        holdDeposit: "200",
        holdNote: "Deposit by e-transfer, pickup Saturday",
        binNumber: "21-03",
        notes: "Cheapest pastel I have seen, do not tell anyone",
        sireId: "snake-sire-1",
        damId: "snake-dam-1",
        sire: "Rook",
        dam: "Ember",
        image: "https://example.com/nova.jpg",
        featured: true,
        ...overrides
    };
}

test("the seller's money, buyers and notes never travel", () => {
    const sent = transfer.sanitizeForTransfer(snake());

    [
        "purchasePrice", "purchaseDate", "purchasedFrom", "askingPrice", "salePrice",
        "soldTo", "holdBuyer", "holdDeposit", "holdNote", "binNumber", "notes",
        "sireId", "damId", "featured"
    ].forEach(field => {
        assert.equal(field in sent, false, `${field} should not travel`);
    });

    // Nothing about a buyer can be found anywhere in the payload.
    const payload = JSON.stringify(sent);
    ["Alex Buyer", "Sam Deposit", "e-transfer", "Do not tell"].forEach(secret => {
        assert.equal(payload.includes(secret), false, `${secret} leaked into the transfer`);
    });
});

test("the animal and its history do travel", () => {
    const sent = transfer.sanitizeForTransfer(snake());

    assert.equal(sent.name, "Nova");
    assert.equal(sent.ID, "SS-101");
    assert.equal(sent.morph, "Pastel Banana");
    assert.deepEqual(sent.genes, [{ name: "Pastel" }, { name: "Banana" }]);
    assert.equal(sent.hatchDate, "2026-05-01");
    assert.equal(sent.weight, "310");
    assert.equal(sent.weightHistory.length, 1);
    assert.equal(sent.feedingHistory.length, 1);
    assert.equal(sent.sire, "Rook");
    assert.equal(sent.dam, "Ember");
    assert.equal(sent.image, "https://example.com/nova.jpg");
});

test("a listing status becomes an owned life stage", () => {
    assert.equal(transfer.sanitizeForTransfer(snake({ status: "Available" })).status, "Adult");
    assert.equal(transfer.sanitizeForTransfer(snake({ status: "On Hold" })).status, "Adult");
    assert.equal(transfer.sanitizeForTransfer(snake({ status: "Sold" })).status, "Adult");
    assert.equal(transfer.sanitizeForTransfer(snake({ status: "Breeder" })).status, "Breeder");
    assert.equal(transfer.sanitizeForTransfer(snake({ status: "Juvenile" })).status, "Juvenile");
});

test("a local photo path is dropped, a web photo is kept", () => {
    assert.equal(transfer.sanitizeForTransfer(snake({ image: "Images/Nova/Nova1.jpg" })).image, "");
    assert.equal(
        transfer.sanitizeForTransfer(snake({ image: "https://cdn.example.com/nova.jpg" })).image,
        "https://cdn.example.com/nova.jpg"
    );

    const mixed = transfer.sanitizeForTransfer(snake({
        photos: [
            { url: "Images/Nova/Nova1.jpg", addedAt: null },
            { url: "https://cdn.example.com/nova-2.jpg", addedAt: "2026-06-01" }
        ]
    }));

    assert.deepEqual(mixed.photos, [{ url: "https://cdn.example.com/nova-2.jpg", addedAt: "2026-06-01" }]);
});

test("an email has to look like the account it is addressed to", () => {
    assert.equal(transfer.isValidEmail("buyer@example.com"), true);
    assert.equal(transfer.isValidEmail(" Buyer@Example.COM "), true);
    assert.equal(transfer.isValidEmail("buyer.example.com"), false);
    assert.equal(transfer.isValidEmail("buyer@example"), false);
    assert.equal(transfer.isValidEmail(""), false);
    assert.equal(transfer.isValidEmail("a@b.co"), true);
});

test("a transfer row is refused before it can be written badly", () => {
    assert.equal(
        transfer.buildTransferRow({ snake: snake(), toEmail: "not-an-email", fromEmail: "me@example.com" }).ok,
        false
    );

    const own = transfer.buildTransferRow({ snake: snake(), toEmail: "Me@Example.com", fromEmail: "me@example.com" });
    assert.equal(own.ok, false);
    assert.match(own.error, /your own email/i);

    const unnamed = transfer.buildTransferRow({
        snake: { id: "snake-1", name: "", ID: "" },
        toEmail: "buyer@example.com"
    });
    assert.equal(unnamed.ok, false);

    const good = transfer.buildTransferRow({
        snake: snake(),
        toEmail: " Buyer@Example.COM ",
        note: "  Paid in full  ",
        fromEmail: "Me@Example.com",
        fromName: "Soulless Serpents"
    });

    assert.equal(good.ok, true);
    assert.equal(good.row.to_email, "buyer@example.com");
    assert.equal(good.row.from_email, "me@example.com");
    assert.equal(good.row.note, "Paid in full");
    assert.equal(good.row.status, "pending");
    assert.equal("soldTo" in good.row.snake, false);
});

test("a received animal gets a fresh id so it cannot overwrite one already owned", () => {
    const mine = [{ id: "snake-121212", name: "Mine" }];
    const received = transfer.mergeIncoming(
        mine,
        { id: "snake-121212", name: "Nova", ID: "SS-101", morph: "Pastel", status: "Available", notes: "private" },
        { today: "2026-11-17", now: 1234567890, fromName: "Soulless Serpents" }
    );

    assert.equal(received.snakes.length, 2);
    assert.notEqual(received.snake.id, "snake-121212");
    assert.equal(received.snake.acquiredDate, "2026-11-17");
    assert.equal(received.snake.transferFrom, "Soulless Serpents");
    assert.equal(received.snake.status, "Adult");
    assert.equal("notes" in received.snake, false);
    assert.equal(received.snakes[0].name, "Mine");
});

test("a transfer reads back as one line for a list", () => {
    const line = transfer.describe({
        snake: { name: "Nova", ID: "SS-101", morph: "Pastel Banana" },
        from_name: "Soulless Serpents",
        to_email: "buyer@example.com",
        status: "accepted",
        created_at: "2026-11-17T10:00:00Z",
        claimed_at: "2026-11-17T18:30:00Z"
    });

    assert.equal(line.label, "Nova");
    assert.equal(line.morph, "Pastel Banana");
    assert.equal(line.status, "accepted");
    assert.equal(line.created, "2026-11-17");
    assert.equal(line.claimed, "2026-11-17");
});
