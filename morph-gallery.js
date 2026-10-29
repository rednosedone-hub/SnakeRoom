// morph-gallery.js
// A shared library of real morph photos, so the calculator and a clutch's
// outcomes can show what an animal actually looks like instead of a name.
//
// Everything is filed by genotype, not by typed text. "Pastel, Lesser" and
// "Lesser, Pastel" are the same animal, and one keeper's ID field must never
// have to match another keeper's spelling. The key is built from the genes and
// their copy counts, sorted: "lesser=1|pastel=1". A snake with no genes has the
// key "normal".
//
// Two different hets of the same gene share a key on purpose: a 66% Het Clown
// and a 100% Het Clown are the same animal to look at, and the gallery is about
// recognising the morph, not proving the genotype.
//
// Storage:
//   public table morph_photos  — see CloudSync.MORPH_SETUP_SQL
//   photos live in the existing public-read snake-photos bucket, so a keeper
//   who has already uploaded a photo does not upload it twice.
//
// The library is optional. If the table has not been created yet, the device is
// offline, or nobody has published a morph, reads return an empty map and the
// pages simply show no examples. Nothing about the calculator or the clutch
// page depends on the network.

(function () {
    const TABLE = "morph_photos";
    const REPORT_TABLE = "morph_photo_reports";
    const CACHE_KEY = "morphPhotoCache";
    const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
    const NORMAL_KEY = "normal";
    const PLACEHOLDER_PHOTO = "Images/TheSnakeRoom.jpg";

    const state = {
        lastError: "",
        setupNeeded: false
    };

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    function stripGenes(genes) {
        const list = Array.isArray(genes) ? genes.filter(Boolean) : [];

        if (window.GeneTools && typeof window.GeneTools.stripNonGenes === "function") {
            return window.GeneTools.stripNonGenes(list);
        }

        return list;
    }

    // One gene, one comparable token. Copy count is clamped because a stored
    // record occasionally carries a stray number, and 0 copies is absence.
    function geneToken(gene) {
        const name = text(gene && gene.name).toLowerCase();

        if (!name) {
            return "";
        }

        const copies = Math.max(1, Math.min(2, Number(gene && gene.copies) || 1));

        return `${name}=${copies}`;
    }

    function morphKeyFromGenes(genes) {
        const tokens = stripGenes(genes).map(geneToken).filter(Boolean).sort();

        return tokens.length > 0 ? tokens.join("|") : NORMAL_KEY;
    }

    function morphKeyFromSnake(snake) {
        return morphKeyFromGenes(snake && snake.genes);
    }

    function morphKeyFromOutcome(outcome) {
        return morphKeyFromGenes(outcome && outcome.geneDetails);
    }

    // The calculator owns the naming (including combo names like "Batman"), so
    // the gallery asks it rather than keeping a second opinion. Pages without
    // the calculator fall back to the plain gene labels.
    function describeGenotype(genes) {
        const list = stripGenes(genes);

        if (window.MorphCalculator && typeof window.MorphCalculator.describeGenotype === "function") {
            return window.MorphCalculator.describeGenotype(list);
        }

        const labels = window.GeneTools && window.GeneTools.describeGenes
            ? window.GeneTools.describeGenes(list)
            : list.map(gene => text(gene.name)).filter(Boolean);

        return {
            morphName: labels.length > 0 ? labels.join(" ") : "Normal",
            genes: labels,
            geneDetails: list.map(gene => ({
                name: gene.name,
                copies: Number(gene.copies) || 1,
                hetOdds: gene.hetOdds === undefined ? null : gene.hetOdds,
                label: window.GeneTools && window.GeneTools.describeGene
                    ? window.GeneTools.describeGene(gene)
                    : text(gene.name)
            })),
            warnings: []
        };
    }

    function describeSnake(snake) {
        const described = describeGenotype(snake && snake.genes);

        return {
            key: morphKeyFromGenes(snake && snake.genes),
            morphName: described.morphName,
            geneDetails: described.geneDetails,
            genes: described.genes
        };
    }

    // Calculator outcomes carry display types ("probhet", "codom"); a snake
    // record only needs the genotype. The catalog supplies the rest on display.
    function descriptionToStorage(geneDetails) {
        return (geneDetails || [])
            .map(gene => ({
                name: text(gene.name),
                copies: Number(gene.copies) || 1,
                ...(gene.hetOdds === undefined || gene.hetOdds === null ? {} : { hetOdds: gene.hetOdds })
            }))
            .filter(gene => gene.name);
    }

    // A snake's gallery candidates: every uploaded photo, main photo first.
    function photoUrlsForSnake(snake) {
        const urls = [];
        const add = value => {
            const url = text(value);

            if (url && url !== PLACEHOLDER_PHOTO && !urls.includes(url)) {
                urls.push(url);
            }
        };

        add(snake && snake.image);
        (Array.isArray(snake && snake.photos) ? snake.photos : []).forEach(photo => {
            add(photo && photo.url ? photo.url : photo);
        });

        return urls;
    }

    function photoIsPlaceholder(url) {
        return !text(url) || text(url) === PLACEHOLDER_PHOTO;
    }

    function getClient() {
        if (window.CloudSync && typeof window.CloudSync._getClient === "function") {
            return window.CloudSync._getClient();
        }

        return null;
    }

    async function getSession() {
        if (window.CloudSync && typeof window.CloudSync.getSession === "function") {
            return window.CloudSync.getSession();
        }

        return null;
    }

    function setupSql() {
        return window.CloudSync && window.CloudSync.MORPH_SETUP_SQL
            ? window.CloudSync.MORPH_SETUP_SQL
            : "";
    }

    function isMissingTable(error) {
        const code = text(error && error.code);
        const message = text(error && error.message);

        return code === "42P01"
            || code === "PGRST205"
            || /relation .*morph_photos.* does not exist/i.test(message)
            || /could not find the table .*morph_photos/i.test(message);
    }

    function describeError(error) {
        const raw = text(error && error.message) || text(error);

        if (isMissingTable(error)) {
            state.setupNeeded = true;

            return "The morph gallery is not set up yet. Open the Account page, find Advanced setup, press Copy Morph Gallery SQL, and run it once in the Supabase SQL Editor.";
        }

        return raw;
    }

    // ---- Cache ------------------------------------------------------------
    // Examples change slowly and are the same for everyone, so a signed-out or
    // offline device can still show the last photos it saw.

    function readCache() {
        try {
            const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");

            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function writeCache(cache) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch (error) {
            // A full device just means no offline gallery; nothing else breaks.
        }
    }

    function cachePhotos(key, photos) {
        if (!key) {
            return;
        }

        const cache = readCache();
        cache[key] = { at: Date.now(), photos: photos || [] };
        writeCache(cache);
    }

    function cachedPhotos(key, maxAgeMs = CACHE_TTL_MS) {
        const entry = readCache()[key];

        if (!entry || !Array.isArray(entry.photos)) {
            return null;
        }

        if (maxAgeMs !== null && Date.now() - Number(entry.at || 0) > maxAgeMs) {
            return null;
        }

        return entry.photos;
    }

    function clearCache() {
        try {
            localStorage.removeItem(CACHE_KEY);
        } catch (error) {
            // Nothing to clear.
        }
    }

    // ---- Reads ------------------------------------------------------------

    // Only the shared fields survive normalization. A publication is a morph
    // and a photo: the keeper's identity and the animal's private records are
    // not part of the gallery, even if an older row still carries them.
    function normalizeRow(row) {
        return {
            id: text(row && row.id),
            morphKey: text(row && row.morph_key),
            morphName: text(row && row.morph_name),
            genes: Array.isArray(row && row.genes) ? row.genes : [],
            photoUrl: text(row && row.photo_url),
            userId: text(row && row.user_id),
            createdAt: text(row && row.created_at)
        };
    }

    function groupPhotos(rows) {
        const grouped = new Map();

        (Array.isArray(rows) ? rows : []).forEach(record => {
            // Callers pass either database rows or rows that were normalized
            // already (the cache), and a second pass must not blank the fields.
            const row = record && record.morphKey !== undefined ? record : normalizeRow(record);

            if (!row.morphKey || !row.photoUrl) {
                return;
            }

            if (!grouped.has(row.morphKey)) {
                grouped.set(row.morphKey, []);
            }

            grouped.get(row.morphKey).push(row);
        });

        return grouped;
    }

    function chunk(list, size) {
        const chunks = [];

        for (let index = 0; index < list.length; index += size) {
            chunks.push(list.slice(index, index + size));
        }

        return chunks;
    }

    // Returns Map<morphKey, publishedPhoto[]>. Never throws: a missing table or
    // a dead connection yields whatever is cached (usually nothing).
    async function fetchExamples(keys, options = {}) {
        const wanted = [...new Set((Array.isArray(keys) ? keys : []).filter(Boolean))];
        const result = new Map();
        const missing = [];

        if (wanted.length === 0) {
            return result;
        }

        wanted.forEach(key => {
            const cached = cachedPhotos(key, options.maxAgeMs === undefined ? CACHE_TTL_MS : options.maxAgeMs);

            if (cached) {
                // The cache stores normalized rows, so reading it again must not
                // run them through normalizeRow a second time.
                result.set(key, cached.map(photo => (photo && photo.morphKey !== undefined ? photo : normalizeRow(photo))));
                return;
            }

            missing.push(key);
        });

        if (missing.length === 0) {
            return result;
        }

        const client = getClient();

        if (!client) {
            return result;
        }

        for (const batch of chunk(missing, 40)) {
            let response;

            try {
                response = await client
                    .from(TABLE)
                    .select("*")
                    .in("morph_key", batch)
                    .order("created_at", { ascending: false });
            } catch (error) {
                state.lastError = describeError(error);
                break;
            }

            if (response.error) {
                state.lastError = describeError(response.error);
                break;
            }

            state.setupNeeded = false;
            state.lastError = "";

            const grouped = groupPhotos(response.data || []);

            batch.forEach(key => {
                const photos = grouped.get(key) || [];
                result.set(key, photos);
                cachePhotos(key, photos);
            });
        }

        return result;
    }

    // Everything this device has seen, so the browse page still works offline
    // and while the table is being set up.
    function cachedRows() {
        const seen = new Set();
        const rows = [];

        Object.values(readCache()).forEach(entry => {
            (entry && Array.isArray(entry.photos) ? entry.photos : []).forEach(photo => {
                const row = photo && photo.morphKey !== undefined ? photo : normalizeRow(photo);

                if (row.id && !seen.has(row.id)) {
                    seen.add(row.id);
                    rows.push(row);
                }
            });
        });

        return rows.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    }

    async function fetchAll() {
        const client = getClient();
        const cached = cachedRows();

        if (!client) {
            return { grouped: groupPhotos(cached), rows: cached, fromCache: cached.length > 0 };
        }

        let response;

        try {
            response = await client
                .from(TABLE)
                .select("*")
                .order("created_at", { ascending: false })
                .limit(500);
        } catch (error) {
            state.lastError = describeError(error);
            return { grouped: groupPhotos(cached), rows: cached, fromCache: cached.length > 0 };
        }

        if (response.error) {
            state.lastError = describeError(response.error);
            return { grouped: groupPhotos(cached), rows: cached, fromCache: cached.length > 0 };
        }

        state.setupNeeded = false;
        state.lastError = "";

        const rows = (response.data || []).map(normalizeRow);

        rows.forEach(row => cachePhotos(row.morphKey, (cachedPhotos(row.morphKey, null) || [])
            .filter(photo => photo.id !== row.id)
            .concat(row)));

        return { grouped: groupPhotos(rows), rows, fromCache: false };
    }

    async function fetchMine() {
        const client = getClient();
        const session = await getSession();

        if (!client || !session) {
            return [];
        }

        let response;

        try {
            response = await client
                .from(TABLE)
                .select("*")
                .eq("user_id", session.user.id)
                .order("created_at", { ascending: false });
        } catch (error) {
            state.lastError = describeError(error);
            return [];
        }

        if (response.error) {
            state.lastError = describeError(response.error);
            return [];
        }

        return (response.data || []).map(normalizeRow);
    }

    // ---- Writes -----------------------------------------------------------

    async function publish({ snake, photoUrl } = {}) {
        const client = getClient();

        if (!client) {
            throw new Error("No Supabase connection is saved.");
        }

        const session = await getSession();

        if (!session) {
            throw new Error("Sign in to publish a photo to the shared gallery.");
        }

        const url = text(photoUrl);

        if (!url) {
            throw new Error("Choose a photo to publish.");
        }

        const described = describeSnake(snake);

        if (described.geneDetails.length === 0) {
            throw new Error("Add the snake's genes first — the gallery files photos by genotype, so it needs to know the morph.");
        }

        // Nothing about the keeper or the animal's records is stored beyond the
        // owner id needed for row level security. The gallery is morph + photo.
        const row = {
            user_id: session.user.id,
            morph_key: described.key,
            morph_name: described.morphName,
            genes: descriptionToStorage(described.geneDetails),
            photo_url: url
        };

        let response;

        try {
            response = await client.from(TABLE).insert(row).select("*");
        } catch (error) {
            throw new Error(describeError(error));
        }

        if (response.error) {
            throw new Error(describeError(response.error));
        }

        const saved = normalizeRow((response.data || [])[0] || row);
        cachePhotos(described.key, [saved].concat(cachedPhotos(described.key, null) || []));

        return saved;
    }

    // A report is a message to the keeper who published the photo, not a public
    // judge: row level security only lets that keeper read it. The owner can
    // then remove the photo, which is the takedown.
    async function report({ photoId, reason, note } = {}) {
        const client = getClient();

        if (!client) {
            throw new Error("No Supabase connection is saved.");
        }

        const session = await getSession();

        if (!session) {
            throw new Error("Sign in to report a photo.");
        }

        const id = text(photoId);
        const why = text(reason);

        if (!id || !why) {
            throw new Error("Choose a reason for the report.");
        }

        let response;

        try {
            response = await client.from(REPORT_TABLE).insert({
                photo_id: id,
                reason: why,
                note: text(note),
                reporter_id: session.user.id
            });
        } catch (error) {
            throw new Error(describeReportError(error));
        }

        if (response.error) {
            throw new Error(describeReportError(response.error));
        }

        return true;
    }

    function describeReportError(error) {
        const code = text(error && error.code);
        const message = text(error && error.message);

        if (code === "42P01" || code === "PGRST205"
            || /relation .*morph_photo_reports.* does not exist/i.test(message)
            || /could not find the table .*morph_photo_reports/i.test(message)) {
            state.setupNeeded = true;

            return "Reporting is not set up yet. Run the Morph Gallery SQL again from the Account page.";
        }

        return text(error && error.message) || text(error) || "The report could not be sent.";
    }

    // Reports are only visible to the keeper who owns the reported photo, so
    // this returns counts for this keeper's photos and nothing else.
    async function fetchMyReportCounts() {
        const client = getClient();
        const session = await getSession();
        const counts = new Map();

        if (!client || !session) {
            return counts;
        }

        let response;

        try {
            response = await client.from(REPORT_TABLE).select("photo_id");
        } catch (error) {
            return counts;
        }

        if (response.error) {
            return counts;
        }

        (response.data || []).forEach(row => {
            const id = text(row && row.photo_id);

            if (id) {
                counts.set(id, (counts.get(id) || 0) + 1);
            }
        });

        return counts;
    }

    async function remove(id) {
        const client = getClient();

        if (!client) {
            throw new Error("No Supabase connection is saved.");
        }

        const session = await getSession();

        if (!session) {
            throw new Error("Sign in to remove a published photo.");
        }

        let response;

        try {
            response = await client.from(TABLE).delete().eq("id", id).eq("user_id", session.user.id);
        } catch (error) {
            throw new Error(describeError(error));
        }

        if (response.error) {
            throw new Error(describeError(response.error));
        }

        clearCache();

        return true;
    }

    // Used by the snake form before deleting a cloud photo: a picture that is
    // published in the shared gallery must stay in the bucket, or every example
    // of that morph turns into a broken image for everyone.
    async function isPublished(photoUrl) {
        const url = text(photoUrl);

        if (!url) {
            return false;
        }

        const client = getClient();

        if (!client) {
            return false;
        }

        try {
            const { data, error } = await client
                .from(TABLE)
                .select("id")
                .eq("photo_url", url)
                .limit(1);

            return !error && Array.isArray(data) && data.length > 0;
        } catch (error) {
            return false;
        }
    }

    window.MorphGallery = {
        TABLE,
        REPORT_TABLE,
        CACHE_KEY,
        PLACEHOLDER_PHOTO,
        morphKeyFromGenes,
        morphKeyFromSnake,
        morphKeyFromOutcome,
        describeGenotype,
        describeSnake,
        descriptionToStorage,
        photoUrlsForSnake,
        photoIsPlaceholder,
        groupPhotos,
        fetchExamples,
        fetchAll,
        fetchMine,
        fetchMyReportCounts,
        publish,
        report,
        remove,
        isPublished,
        setupSql,
        clearCache,
        lastError: () => state.lastError,
        setupNeeded: () => state.setupNeeded
    };
})();
