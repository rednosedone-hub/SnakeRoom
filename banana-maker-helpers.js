// banana-maker-helpers.js
//
// Banana and Coral Glow are the same sex-linked morph under two names. A male
// that carries it is a "maker": his Banana/Coral Glow hatchlings come out
// mostly one sex, and which one follows where his own Banana came from.
//
//   - a Banana dam makes him a female maker (mostly female hatchlings)
//   - a Banana sire makes him a male maker (mostly male hatchlings)
//
// Only a male is ever a maker, and a male whose parentage does not say becomes
// "not recorded" rather than a guess. A keeper can always set it by hand.
(function () {
    const BANANA_NAMES = new Set([
        "banana",
        "superbanana",
        "coralglow",
        "supercoralglow"
    ]);

    function normalizeText(value) {
        return String(value === undefined || value === null ? "" : value)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
    }

    function normalizeMaker(value) {
        const key = normalizeText(value);

        if (key === "male" || key === "m" || key === "malemaker") {
            return "male";
        }

        if (key === "female" || key === "f" || key === "femalemaker") {
            return "female";
        }

        return "";
    }

    function isBananaName(name) {
        return BANANA_NAMES.has(normalizeText(name));
    }

    // A possible-het record is an unproven carrier, not a visual, so it does not
    // make a male a maker. A stored gene with no copies is likewise absent.
    function isBananaGeneRecord(record) {
        if (!record || !isBananaName(record.name)) {
            return false;
        }

        if (record.copies !== undefined) {
            const copies = Number(record.copies);

            if (Number.isFinite(copies) && copies <= 0) {
                return false;
            }
        }

        if (record.hetOdds !== undefined && record.hetOdds !== null) {
            const odds = Number(record.hetOdds);

            if (Number.isFinite(odds) && odds > 0 && odds < 1) {
                return false;
            }
        }

        return true;
    }

    function hasBananaVisual(genes) {
        return Array.isArray(genes) && genes.some(isBananaGeneRecord);
    }

    function textMentionsBanana(text) {
        const normalized = normalizeText(text);

        return normalized.includes("banana") || normalized.includes("coralglow");
    }

    // Older records keep the morph in the ID/morph text instead of the genes
    // array, so both are read. A snake's name is deliberately not read: a pet
    // called "Banana" is not a morph record.
    function snakeHasBanana(snake) {
        if (!snake) {
            return false;
        }

        if (hasBananaVisual(snake.genes)) {
            return true;
        }

        return textMentionsBanana(snake.morph) || textMentionsBanana(snake.ID);
    }

    function isMaleBanana(snake) {
        return Boolean(snake) && String(snake.sex || "") === "Male" && snakeHasBanana(snake);
    }

    function findParent(snake, kind, allSnakes) {
        const id = kind === "dam" ? snake.damId : snake.sireId;

        if (!id || !Array.isArray(allSnakes)) {
            return null;
        }

        return allSnakes.find(candidate =>
            candidate && String(candidate.id || "") === String(id)
        ) || null;
    }

    // A parent that is no longer in the collection keeps its label on the
    // record ("Name - Banana Lesser"), and that label is better evidence than
    // nothing at all.
    function parentIsBanana(parent, label) {
        return parent ? snakeHasBanana(parent) : textMentionsBanana(label);
    }

    function emptyDerivation(source, note) {
        return { maker: "", source: source || "unknown", parentName: "", note: note || "" };
    }

    // Works out the maker from the animal's own sex, genes and parents. The
    // input takes snake-shaped values (genes, morph, ID, damId, sireId, dam,
    // sire) so both a stored record and a half-filled form can use it.
    function deriveMaker(input) {
        const snake = input || {};
        const sex = String(snake.sex || "");

        if (sex !== "Male") {
            return emptyDerivation("none", "Only a male can be a Banana/Coral Glow maker.");
        }

        if (!snakeHasBanana(snake)) {
            return emptyDerivation("none", "This snake does not carry Banana or Coral Glow.");
        }

        const dam = snake.dam || null;
        const sire = snake.sire || null;
        const damBanana = parentIsBanana(dam, snake.damLabel);
        const sireBanana = parentIsBanana(sire, snake.sireLabel);

        if (damBanana && sireBanana) {
            return emptyDerivation(
                "both",
                "Both parents are Banana/Coral Glow, so parentage cannot tell the maker. Pick one from the record."
            );
        }

        if (damBanana) {
            const parentName = (dam && dam.name) || "";

            return {
                maker: "female",
                source: "dam",
                parentName,
                note: parentName
                    ? `Its dam ${parentName} is Banana/Coral Glow, so it is a female maker.`
                    : "Its dam is Banana/Coral Glow, so it is a female maker."
            };
        }

        if (sireBanana) {
            const parentName = (sire && sire.name) || "";

            return {
                maker: "male",
                source: "sire",
                parentName,
                note: parentName
                    ? `Its sire ${parentName} is Banana/Coral Glow, so it is a male maker.`
                    : "Its sire is Banana/Coral Glow, so it is a male maker."
            };
        }

        return emptyDerivation(
            "unknown",
            "Record the dam and sire, or set the maker by hand."
        );
    }

    function describeMaker(maker) {
        const key = normalizeMaker(maker);

        if (key === "male") {
            return {
                maker: "male",
                label: "Male maker",
                short: "Banana babies mostly male",
                offspring: "Banana / Coral Glow hatchlings from this male are expected to be mostly male."
            };
        }

        if (key === "female") {
            return {
                maker: "female",
                label: "Female maker",
                short: "Banana babies mostly female",
                offspring: "Banana / Coral Glow hatchlings from this male are expected to be mostly female."
            };
        }

        return { maker: "", label: "", short: "", offspring: "" };
    }

    // What the app should show for a stored snake: the maker written on the
    // record wins, and otherwise the parents are read live. A disagreement is
    // reported instead of silently replacing the keeper's record.
    function resolveMaker(snake, allSnakes) {
        const stored = normalizeMaker(snake && snake.bananaMaker);
        const result = {
            maker: "",
            source: "none",
            label: "",
            short: "",
            offspring: "",
            recorded: stored,
            derived: "",
            derivedSource: "",
            disagrees: false,
            parentName: "",
            note: ""
        };

        if (!isMaleBanana(snake)) {
            return result;
        }

        const derivedState = deriveMaker({
            sex: snake.sex,
            genes: snake.genes,
            morph: snake.morph,
            ID: snake.ID,
            dam: findParent(snake, "dam", allSnakes),
            sire: findParent(snake, "sire", allSnakes),
            damLabel: snake.dam,
            sireLabel: snake.sire
        });
        const maker = stored || derivedState.maker;
        const description = describeMaker(maker);

        return {
            ...result,
            maker,
            source: stored ? "recorded" : derivedState.source,
            label: description.label,
            short: description.short,
            offspring: description.offspring,
            derived: derivedState.maker,
            derivedSource: derivedState.source,
            disagrees: Boolean(stored && derivedState.maker && stored !== derivedState.maker),
            parentName: derivedState.parentName,
            note: derivedState.note
        };
    }

    // How many Banana copies an outcome carries: 0 none, 1 single, 2 super.
    // A possible het is not a visual, so it counts as none.
    function getBananaCopies(genes) {
        let copies = 0;

        (Array.isArray(genes) ? genes : []).forEach(record => {
            if (!isBananaGeneRecord(record)) {
                return;
            }

            const count = record.copies === undefined
                ? 1
                : Math.max(1, Math.min(2, Number(record.copies) || 1));

            copies = Math.max(copies, count);
        });

        return copies;
    }

    // Which sex the Banana hatchlings of a pairing will be, when the parents
    // make that knowable. Returns null when the pairing cannot say.
    //
    // Only a male is a maker. A Banana female has no maker and does not skew
    // the clutch, so she can throw Banana sons and Banana daughters equally; on
    // her own there is no single sex to state, and the note explains why. When
    // both parents carry Banana, the Super Banana hatchlings are the male ones
    // while single Banana and normal hatchlings can be either sex. A Banana sire
    // as the only Banana parent is the case his maker decides.
    function getPairSexSplit(input) {
        const source = input || {};
        const damCopies = Number(source.damBananaCopies) || (source.damHasBanana ? 1 : 0);
        const sireCopies = Number(source.sireBananaCopies) || (source.sireHasBanana ? 1 : 0);
        const sireMaker = sireCopies > 0 ? normalizeMaker(source.sireMaker) : "";

        if (!damCopies && !sireCopies) {
            return null;
        }

        if (damCopies && sireCopies) {
            return {
                mode: "both",
                superSex: "male",
                bananaSex: "both",
                otherSex: "both",
                note: "Banana on both sides: the Super Banana hatchlings are the male ones, while single Banana and normal hatchlings can be either sex."
            };
        }

        if (damCopies) {
            return null;
        }

        if (sireCopies >= 2) {
            return {
                mode: "sire-super",
                bananaSex: "both",
                otherSex: "",
                note: "A Super Banana sire passes the gene to every hatchling, so the Banana hatchlings can be either sex."
            };
        }

        if (sireMaker === "male") {
            return {
                mode: "maker",
                bananaSex: "male",
                otherSex: "female",
                note: "Male maker for a sire: the Banana/Coral Glow hatchlings should be male, and the rest female."
            };
        }

        if (sireMaker === "female") {
            return {
                mode: "maker",
                bananaSex: "female",
                otherSex: "male",
                note: "Female maker for a sire: the Banana/Coral Glow hatchlings should be female, and the rest male."
            };
        }

        return null;
    }

    function getOutcomeSex(split, bananaCopies) {
        if (!split) {
            return "";
        }

        const copies = Math.max(0, Number(bananaCopies) || 0);

        if (split.mode === "both") {
            return copies >= 2 ? split.superSex : "both";
        }

        return copies > 0 ? split.bananaSex : split.otherSex;
    }

    function getOutcomeSexForGenes(split, genes) {
        return getOutcomeSex(split, getBananaCopies(genes));
    }

    function describeSex(sex) {
        if (sex === "male") {
            return "Male";
        }

        if (sex === "female") {
            return "Female";
        }

        if (sex === "both") {
            return "Male / Female";
        }

        return "";
    }

    // One sentence a page can print under a pairing without knowing the modes.
    function describeSexSplit(split) {
        if (!split) {
            return "";
        }

        if (split.mode === "both") {
            return "Super Banana: Male · the rest: Male / Female.";
        }

        if (split.mode === "sire-super") {
            return "Banana hatchlings: Male / Female.";
        }

        return `Banana hatchlings: ${describeSex(split.bananaSex)} · the rest: ${describeSex(split.otherSex)}.`;
    }

    // Explained wherever a Banana dam is the only Banana parent: she does not
    // decide the sex, so her Banana offspring can be daughters as well as sons.
    function describeDamOnlySexNote() {
        return "A Banana dam does not decide the sex of her Banana hatchlings: they can be male or female, so she can throw Banana daughters as well as Banana sons. Only a Banana male's maker skews the clutch.";
    }

    function getBadge(snake, allSnakes) {
        const resolved = resolveMaker(snake, allSnakes);

        if (!resolved.maker) {
            return null;
        }

        const source = resolved.source === "recorded"
            ? "Recorded on this snake."
            : `Worked out from its ${resolved.derivedSource === "sire" ? "sire" : "dam"}.`;

        return {
            maker: resolved.maker,
            label: resolved.label,
            className: `is-${resolved.maker}-maker`,
            title: `${resolved.offspring} ${source}`
        };
    }

    window.BananaMaker = {
        normalizeMaker,
        isBananaName,
        hasBananaVisual,
        snakeHasBanana,
        isMaleBanana,
        deriveMaker,
        describeMaker,
        resolveMaker,
        getBananaCopies,
        getPairSexSplit,
        getOutcomeSex,
        getOutcomeSexForGenes,
        describeSex,
        describeSexSplit,
        describeDamOnlySexNote,
        getBadge
    };
})();
