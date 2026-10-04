// cloud-sync.js
// Cloud backup for The Snake Room.
//
// Provider: Supabase (free tier). The JS library is loaded from a CDN, keeping
// the app a no-build static site. All app data continues to live in
// localStorage; this module copies a full snapshot to/from one cloud table.
//
// Storage keys that make up a snapshot:
//   snakes, breedingPairs, clutches, customGeneCatalog, cloudSyncSettings
// (Gene catalog is starter + custom; only custom genes need backup.)

(function () {
    const SNAPSHOT_KEYS = ["snakes", "breedingPairs", "clutches", "customGeneCatalog"];

    const SETTINGS_KEY = "cloudSyncSettings";

    const SETUP_SQL = [
        "-- The Snake Room: one-time cloud backup setup",
        "create table if not exists snake_room_backups (",
        "  user_id uuid primary key references auth.users (id) on delete cascade,",
        "  snapshot jsonb not null,",
        "  device text,",
        "  updated_at timestamptz not null default now()",
        ");",
        "",
        "alter table snake_room_backups enable row level security;",
        "",
        "create policy \"Own backup only\"",
        "  on snake_room_backups",
        "  for all",
        "  using (auth.uid () = user_id)",
        "  with check (auth.uid () = user_id);"
    ].join("\n");

    function readSettings() {
        try {
            return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
        } catch (error) {
            return {};
        }
    }

    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    let client = null;
    let clientConfig = null;

    function getClient() {
        const settings = readSettings();
        const url = (settings.supabaseUrl || "").trim();
        const key = (settings.supabaseKey || "").trim();

        if (!url || !key) {
            return null;
        }

        if (client && clientConfig && clientConfig.url === url && clientConfig.key === key) {
            return client;
        }

        if (!window.supabase || typeof window.supabase.createClient !== "function") {
            throw new Error("Supabase library not loaded. Check your internet connection and reload.");
        }

        client = window.supabase.createClient(url, key);
        clientConfig = { url, key };
        return client;
    }

    async function getSession() {
        const activeClient = getClient();

        if (!activeClient) {
            return null;
        }

        const { data, error } = await activeClient.auth.getSession();

        if (error) {
            throw error;
        }

        return data.session;
    }

    function buildSnapshot() {
        const snapshot = {
            app: "the-snake-room",
            version: 1,
            savedAt: new Date().toISOString(),
            data: {}
        };

        SNAPSHOT_KEYS.forEach(key => {
            try {
                const raw = localStorage.getItem(key);

                if (raw !== null) {
                    snapshot.data[key] = JSON.parse(raw);
                }
            } catch (error) {
                console.error(`Could not read ${key} for the snapshot.`, error);
            }
        });

        return snapshot;
    }

    function applySnapshot(snapshot) {
        if (!snapshot || snapshot.app !== "the-snake-room" || typeof snapshot.data !== "object") {
            throw new Error("That cloud backup is not a Snake Room snapshot.");
        }

        SNAPSHOT_KEYS.forEach(key => {
            if (key in snapshot.data) {
                localStorage.setItem(key, JSON.stringify(snapshot.data[key]));
            }
        });
    }

    function getCollectionCounts() {
        const counts = {};

        SNAPSHOT_KEYS.forEach(key => {
            try {
                const raw = localStorage.getItem(key);
                const parsed = raw === null ? null : JSON.parse(raw);

                counts[key] = Array.isArray(parsed)
                    ? parsed.length
                    : (parsed ? 1 : 0);
            } catch (error) {
                counts[key] = 0;
            }
        });

        return counts;
    }

    function describeCounts(counts) {
        return SNAPSHOT_KEYS
            .map(key => `${key}: ${counts[key]}`)
            .join(" / ");
    }

    // ---- UI helpers -------------------------------------------------------

    function showReport(id, message, isError = false) {
        const report = document.getElementById(id);

        if (report) {
            report.textContent = message;
            report.classList.toggle("import-error", isError);
        }
    }

    function showStatus(message, isError = false) {
        showReport("cloudStatusReport", message, isError);
    }

    function setButtonsEnabled(enabled) {
        ["pushButton", "pullButton"].forEach(id => {
            const button = document.getElementById(id);

            if (button) {
                button.disabled = !enabled;
            }
        });
    }

    function updateConnectionInputs() {
        const settings = readSettings();
        const urlInput = document.getElementById("supabaseUrlInput");
        const keyInput = document.getElementById("supabaseKeyInput");

        if (urlInput && !urlInput.value) {
            urlInput.value = settings.supabaseUrl || "";
        }

        if (keyInput && !keyInput.value && settings.supabaseKey) {
            keyInput.placeholder = "Key saved (hidden)";
        }
    }

    function updateSignOutVisibility(signedIn) {
        const button = document.getElementById("signOutButton");

        if (button) {
            button.style.display = signedIn ? "inline-block" : "none";
        }
    }

    function setSyncReport(message, isError = false) {
        showReport("syncReport", message, isError);
    }

    // ---- Status -----------------------------------------------------------

    async function refreshStatus() {
        const settings = readSettings();

        if (!settings.supabaseUrl || !settings.supabaseKey) {
            showStatus("No connection saved. Add your Supabase URL and anon key below to get started.");
            setButtonsEnabled(false);
            updateSignOutVisibility(false);
            return;
        }

        try {
            const session = await getSession();

            if (session) {
                const statusSettings = readSettings();
                const stampParts = [];

                if (statusSettings.lastPushedAt) {
                    stampParts.push(`last push ${new Date(statusSettings.lastPushedAt).toLocaleString()}`);
                }

                if (statusSettings.lastPulledAt) {
                    stampParts.push(`last pull ${new Date(statusSettings.lastPulledAt).toLocaleString()}`);
                }

                const stampText = stampParts.length ? ` (${stampParts.join(" | ")})` : "";
                showStatus(`Connected and signed in as ${session.user.email || session.user.id}. Ready to sync.${stampText}`);
                updateSignOutVisibility(true);
            } else {
                showStatus("Connection saved, but not signed in. Send yourself a magic link below.");
                updateSignOutVisibility(false);
            }

            setButtonsEnabled(true);
        } catch (error) {
            showStatus(`Connection problem: ${error.message}`, true);
            setButtonsEnabled(false);
            updateSignOutVisibility(false);
        }
    }

    // ---- Actions ----------------------------------------------------------

    function normalizeSupabaseUrl(url) {
        // Users often paste the "Project URL" shown on the REST endpoint
        // (https://xyz.supabase.co/rest/v1/). The client needs the bare root,
        // so strip any API path segments and trailing slashes.
        return url
            .trim()
            .replace(/\/+$/, "")
            .replace(/\/(rest|auth|realtime|storage)\/v1$/i, "");
    }

    function classifyApiKey(key) {
        // Returns "secret", "publishable", or "unknown".
        if (/^sb_secret_/i.test(key)) {
            return "secret";
        }

        if (/^sb_publishable_/i.test(key)) {
            return "publishable";
        }

        if (/^eyJ/.test(key)) {
            // Legacy JWT keys: read the "role" claim from the payload segment.
            try {
                const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));

                if (payload.role === "service_role") {
                    return "secret";
                }

                if (payload.role === "anon") {
                    return "publishable";
                }
            } catch (error) {
                return "unknown";
            }
        }

        return "unknown";
    }

    async function saveConnection() {
        const urlInput = document.getElementById("supabaseUrlInput");
        const keyInput = document.getElementById("supabaseKeyInput");
        const url = urlInput.value.trim();
        const key = keyInput.value.trim();
        const settings = readSettings();

        const normalizedUrl = normalizeSupabaseUrl(url);

        if (!normalizedUrl || !key) {
            if (!url && !key && settings.supabaseUrl && settings.supabaseKey) {
                setSyncReport("Connection unchanged.");
                return;
            }

            setSyncReport("Enter both the Project URL and the anon key.", true);
            return;
        }

        if (!/^https:\/\//i.test(normalizedUrl)) {
            setSyncReport("The Project URL should start with https:// (for example https://xyz.supabase.co).", true);
            return;
        }

        if (classifyApiKey(key) === "secret") {
            setSyncReport("That is a SECRET key, which must never be used in a browser. Copy the publishable key instead (starts with sb_publishable_).", true);
            return;
        }

        saveSettings({ ...settings, supabaseUrl: normalizedUrl, supabaseKey: key });
        client = null;
        clientConfig = null;
        keyInput.value = "";
        urlInput.value = normalizedUrl;
        updateConnectionInputs();
        setSyncReport(normalizedUrl === url.trim().replace(/\/+$/, "")
            ? "Connection saved."
            : `Connection saved (URL cleaned to ${normalizedUrl}).`);
        await refreshStatus();
    }

    async function clearConnection() {
        const settings = readSettings();

        saveSettings({
            ...settings,
            supabaseUrl: "",
            supabaseKey: ""
        });
        client = null;
        clientConfig = null;
        updateConnectionInputs();
        setSyncReport("Connection cleared.");
        await refreshStatus();
    }

    async function checkCloudIsStale(activeClient, userId, settings) {
        // "Safe" means: nobody has pushed to the cloud since this device last
        // saw the cloud state (its last pull or push). Otherwise this device is
        // about to overwrite changes it has never seen.
        try {
            const { data, error } = await activeClient
                .from("snake_room_backups")
                .select("updated_at")
                .eq("user_id", userId)
                .maybeSingle();

            if (error || !data || !data.updated_at) {
                return { safe: true, cloudUpdatedAt: null };
            }

            const lastKnownCloudTime = settings.lastPulledAt || settings.lastPushedAt || null;

            if (!lastKnownCloudTime) {
                return { safe: false, cloudUpdatedAt: data.updated_at };
            }

            return {
                safe: new Date(data.updated_at) <= new Date(lastKnownCloudTime),
                cloudUpdatedAt: data.updated_at
            };
        } catch (error) {
            console.error(error);
            return { safe: true, cloudUpdatedAt: null };
        }
    }

    async function pushSnapshot() {
        try {
            const session = await getSession();

            if (!session) {
                setSyncReport("Sign in first, then push.", true);
                return;
            }

            const activeClient = getClient();

            const pushSettings = readSettings();
            const staleCheck = await checkCloudIsStale(activeClient, session.user.id, pushSettings);

            if (staleCheck.cloudUpdatedAt && !staleCheck.safe) {
                const overwrite = confirm(
                    "The cloud backup is newer than this device's last pull.\n\n" +
                    `Cloud updated: ${staleCheck.cloudUpdatedAt}\n` +
                    `This device last pulled: ${pushSettings.lastPulledAt || "never"}\n\n` +
                    "Another device may have pushed changes that this push would overwrite.\n" +
                    "Pull first to keep them, or push anyway to overwrite the cloud.\n\n" +
                    "Overwrite the cloud anyway?"
                );

                if (!overwrite) {
                    setSyncReport("Push cancelled. Pull from the cloud first to bring the other device's changes onto this device.", true);
                    return;
                }
            }

            // Small-collection guard: a fresh device (or a cleared browser) holds
            // few or no snakes. Pushing from it would replace the real backup.
            const existingRow = await activeClient
                .from("snake_room_backups")
                .select("snapshot")
                .eq("user_id", session.user.id)
                .maybeSingle();

            if (!existingRow.error && existingRow.data?.snapshot?.data?.snakes) {
                const cloudSnakeCount = existingRow.data.snapshot.data.snakes.length;
                const localSnakeCount = getCollectionCounts().snakes;

                if (cloudSnakeCount >= 5 && localSnakeCount < cloudSnakeCount / 2) {
                    const shrink = confirm(
                        "This device has far fewer snakes than the cloud backup.\n\n" +
                        `This device: ${localSnakeCount} snake(s)\n` +
                        `Cloud backup: ${cloudSnakeCount} snake(s)\n\n` +
                        "If this is a new device, PULL first instead of pushing.\n" +
                        "Pushing now would replace the cloud collection with this device's smaller one.\n\n" +
                        "Replace the cloud backup anyway?"
                    );

                    if (!shrink) {
                        setSyncReport("Push cancelled. Use Pull From Cloud to load this device with the full collection.", true);
                        return;
                    }
                }
            }

            setSyncReport("Pushing\u2026");

            const snapshot = buildSnapshot();
            const row = {
                user_id: session.user.id,
                snapshot,
                device: navigator.userAgent.slice(0, 120),
                updated_at: new Date().toISOString()
            };

            const { error } = await activeClient
                .from("snake_room_backups")
                .upsert(row);

            if (error) {
                throw error;
            }

            saveSettings({ ...readSettings(), lastPushedAt: row.updated_at, lastDevice: row.device });
            setSyncReport(`Pushed ${describeCounts(getCollectionCounts())}.`);
        } catch (error) {
            setSyncReport(`Push failed: ${error.message}`, true);
            console.error(error);
        }
    }

    async function pullSnapshot() {
        try {
            const session = await getSession();

            if (!session) {
                setSyncReport("Sign in first, then pull.", true);
                return;
            }

            const activeClient = getClient();
            setSyncReport("Pulling\u2026");

            const { data, error } = await activeClient
                .from("snake_room_backups")
                .select("snapshot, updated_at, device")
                .eq("user_id", session.user.id)
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (!data || !data.snapshot) {
                setSyncReport("No cloud backup found yet. Push first from any device.", true);
                return;
            }

            applySnapshot(data.snapshot);
            saveSettings({
                ...readSettings(),
                lastPulledAt: new Date().toISOString(),
                cloudUpdatedAt: data.updated_at,
                cloudDevice: data.device
            });
            setSyncReport(`Pulled backup from ${data.updated_at || "unknown time"}. Reload the other pages to see the restored data.`);
        } catch (error) {
            setSyncReport(`Pull failed: ${error.message}`, true);
            console.error(error);
        }
    }

    async function signInWithPassword() {
        try {
            const emailInput = document.getElementById("emailInput");
            const passwordInput = document.getElementById("passwordInput");
            const email = emailInput.value.trim();
            const password = passwordInput.value || "";

            if (!email || !password) {
                setSyncReport("Enter both your email and your password.", true);
                return;
            }

            const activeClient = getClient();
            setSyncReport("Signing in\u2026");

            const { error } = await activeClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                throw error;
            }

            passwordInput.value = "";
            setSyncReport(`Signed in as ${email}.`);
            await refreshStatus();
        } catch (error) {
            setSyncReport(`Sign in failed: ${error.message}`, true);
            console.error(error);
        }
    }

    async function sendMagicLink() {
        try {
            const emailInput = document.getElementById("emailInput");
            const email = emailInput.value.trim();

            if (!email) {
                setSyncReport("Enter your email first.", true);
                return;
            }

            const activeClient = getClient();
            setSyncReport("Sending magic link\u2026");

            const { error } = await activeClient.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: window.location.href
                }
            });

            if (error) {
                throw error;
            }

            setSyncReport(`Magic link sent to ${email}. Open it on this device to sign in, then sync.`);
        } catch (error) {
            setSyncReport(`Could not send the magic link: ${error.message}`, true);
            console.error(error);
        }
    }

    async function signOut() {
        try {
            const activeClient = getClient();

            if (activeClient) {
                await activeClient.auth.signOut();
            }

            setSyncReport("Signed out.");
            await refreshStatus();
        } catch (error) {
            setSyncReport(`Sign out failed: ${error.message}`, true);
        }
    }

    // ---- Boot -------------------------------------------------------------

    function bindEvents() {
        document.getElementById("pushButton").addEventListener("click", pushSnapshot);
        document.getElementById("pullButton").addEventListener("click", pullSnapshot);
        document.getElementById("saveConnectionButton").addEventListener("click", saveConnection);
        document.getElementById("clearConnectionButton").addEventListener("click", clearConnection);
        document.getElementById("sendMagicLinkButton").addEventListener("click", sendMagicLink);
        document.getElementById("signInPasswordButton").addEventListener("click", signInWithPassword);
        document.getElementById("signOutButton").addEventListener("click", signOut);
        document.getElementById("copySqlButton").addEventListener("click", async () => {
            await navigator.clipboard.writeText(SETUP_SQL);
            setSyncReport("SQL copied to the clipboard.");
        });
    }

    function init() {
        const sqlBlock = document.getElementById("setupSqlBlock");

        if (sqlBlock) {
            sqlBlock.textContent = SETUP_SQL;
        }

        bindEvents();
        updateConnectionInputs();
        refreshStatus();

        // Supabase magic-link sign-ins land back on this page with tokens in
        // the URL fragment. Parse them, then clean the address bar.
        const activeClient = getClient();

        if (activeClient && window.location.hash.includes("access_token")) {
            activeClient.auth.onAuthStateChange((event) => {
                if (event === "SIGNED_IN") {
                    history.replaceState(null, "", window.location.pathname);
                    refreshStatus();
                }
            });
        }
    }

    window.CloudSync = {
        buildSnapshot,
        applySnapshot,
        readSettings,
        SNAPSHOT_KEYS
    };

    document.addEventListener("DOMContentLoaded", init);
})();
