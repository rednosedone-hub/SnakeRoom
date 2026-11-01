// calculator-state.js
// The pairing a keeper is working on.
//
// Opening a morph's examples from the results table navigates away from the
// calculator, and coming back to an empty form throws away the pairing they
// were halfway through. Keeping the selection here means "close the photos"
// returns to the same female, the same male, and the same results table, ready
// for the next combination.
//
// Only the selection is stored: the genes and the collection animals they came
// from. Results are recalculated on load, never stored, so the table can never
// disagree with an improved calculator.
//
// The store is the browser's session storage, not the saved collection: this is
// a work in progress, and it should not follow the keeper into a new tab or
// next week's session.

(function () {
    const STORAGE_KEY = "morphCalculatorPairing";

    function cleanGene(gene) {
        const name = String((gene && gene.name) || "").trim();

        if (!name) {
            return null;
        }

        const copies = Number(gene.copies);
        const hetOdds = Number(gene.hetOdds);
        const record = {
            name,
            copies: Number.isInteger(copies) ? Math.max(1, Math.min(2, copies)) : 1
        };

        // Only a genuine possible het keeps odds; anything else is a proven
        // animal, and a stored 1 or 0 would read as a contradiction.
        if (Number.isFinite(hetOdds) && hetOdds > 0 && hetOdds < 1) {
            record.hetOdds = hetOdds;
        }

        return record;
    }

    function cleanGenes(genes) {
        return (Array.isArray(genes) ? genes : [])
            .map(cleanGene)
            .filter(Boolean);
    }

    function normalizePairing(pairing) {
        const source = pairing && typeof pairing === "object" ? pairing : {};

        return {
            female: cleanGenes(source.female),
            male: cleanGenes(source.male),
            femaleSnakeId: String(source.femaleSnakeId || ""),
            maleSnakeId: String(source.maleSnakeId || "")
        };
    }

    function emptyPairing() {
        return normalizePairing(null);
    }

    // A pairing with no genes is not worth restoring: the page already starts
    // that way, and recalculating it would only say "select the morphs".
    function hasGenes(pairing) {
        const clean = normalizePairing(pairing);

        return clean.female.length > 0 || clean.male.length > 0;
    }

    // Private browsing, an embedded webview or a disabled store should cost the
    // keeper nothing but the restore; every caller gets a usable object.
    function storageOf(store) {
        if (store && typeof store.getItem === "function" && typeof store.setItem === "function") {
            return store;
        }

        try {
            return window.sessionStorage;
        } catch (error) {
            return null;
        }
    }

    function read(store) {
        const storage = storageOf(store);

        if (!storage) {
            return emptyPairing();
        }

        try {
            const saved = storage.getItem(STORAGE_KEY);

            return saved ? normalizePairing(JSON.parse(saved)) : emptyPairing();
        } catch (error) {
            return emptyPairing();
        }
    }

    function write(pairing, store) {
        const storage = storageOf(store);

        if (!storage) {
            return false;
        }

        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(normalizePairing(pairing)));
            return true;
        } catch (error) {
            return false;
        }
    }

    function clear(store) {
        const storage = storageOf(store);

        if (!storage) {
            return false;
        }

        try {
            storage.removeItem(STORAGE_KEY);
            return true;
        } catch (error) {
            return false;
        }
    }

    window.CalculatorState = {
        STORAGE_KEY,
        normalizePairing,
        hasGenes,
        read,
        write,
        clear
    };
})();
