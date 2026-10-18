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
    const SNAPSHOT_KEYS = ["snakes", "breedingPairs", "clutches", "breedingGoals", "customGeneCatalog"];

    const SETTINGS_KEY = "cloudSyncSettings";

    // The project URL and publishable key are public credentials by design
    // (row level security protects the data), so they are baked in here as a
    // fallback. If a phone's browser wipes site storage, recovering is just
    // entering the password — no URL, key, or re-setup.
    const DEFAULT_CONNECTION = {
        supabaseUrl: "https://frspbmxtymonlfbfzfpr.supabase.co",
        supabaseKey: "sb_publishable_csOyxq6yvn4o4M1tkgikzg_-bRd3PBS"
    };

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

    const PHOTO_BUCKET = "snake-photos";

    const PHOTO_SETUP_SQL = [
        "-- The Snake Room: one-time photo storage setup",
        "-- Creates the snake-photos bucket and its security rules.",
        "-- Safe to run more than once. Run it in the Supabase SQL Editor.",
        "",
        "insert into storage.buckets (id, name, public)",
        "values ('snake-photos', 'snake-photos', true)",
        "on conflict (id) do update set public = true;",
        "",
        "drop policy if exists \"Snake photos are public to read\" on storage.objects;",
        "create policy \"Snake photos are public to read\"",
        "  on storage.objects for select",
        "  using (bucket_id = 'snake-photos');",
        "",
        "drop policy if exists \"Users upload photos to their own folder\" on storage.objects;",
        "create policy \"Users upload photos to their own folder\"",
        "  on storage.objects for insert to authenticated",
        "  with check (",
        "    bucket_id = 'snake-photos'",
        "    and (storage.foldername (name)) [1] = auth.uid ()::text",
        "  );",
        "",
        "drop policy if exists \"Users update their own photos\" on storage.objects;",
        "create policy \"Users update their own photos\"",
        "  on storage.objects for update to authenticated",
        "  using (",
        "    bucket_id = 'snake-photos'",
        "    and (storage.foldername (name)) [1] = auth.uid ()::text",
        "  )",
        "  with check (",
        "    bucket_id = 'snake-photos'",
        "    and (storage.foldername (name)) [1] = auth.uid ()::text",
        "  );",
        "",
        "drop policy if exists \"Users delete their own photos\" on storage.objects;",
        "create policy \"Users delete their own photos\"",
        "  on storage.objects for delete to authenticated",
        "  using (",
        "    bucket_id = 'snake-photos'",
        "    and (storage.foldername (name)) [1] = auth.uid ()::text",
        "  );"
    ].join("\n");

    function readSettings() {
        let parsed = {};

        try {
            parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
        } catch (error) {
            parsed = {};
        }

        // "Clear Connection" must stay possible, so honour the flag.
        if (parsed.connectionCleared) {
            return parsed;
        }

        return {
            supabaseUrl: DEFAULT_CONNECTION.supabaseUrl,
            supabaseKey: DEFAULT_CONNECTION.supabaseKey,
            ...parsed
        };
    }

    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    let client = null;
    let clientConfig = null;

    // Test hook: lets browser-console tests swap in a mock Supabase client.
    let testClient = null;

    function getClient() {
        if (testClient) {
            return testClient;
        }

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

        client = window.supabase.createClient(url, key, {
            auth: {
                // Sessions live in localStorage and renew themselves, so a
                // normal sign-in should last indefinitely.
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
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
        const emailInput = document.getElementById("emailInput");

        if (urlInput && !urlInput.value) {
            urlInput.value = settings.supabaseUrl || "";
        }

        if (keyInput && !keyInput.value && settings.supabaseKey) {
            keyInput.placeholder = "Key saved (hidden)";
        }

        if (emailInput && !emailInput.value && settings.lastEmail) {
            emailInput.value = settings.lastEmail;
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
                showStatus("Connection ready, but not signed in. Enter your email and password below and press Sign In.");
                updateSignOutVisibility(false);
            }

            setButtonsEnabled(true);
        } catch (error) {
            showStatus(`Connection problem: ${error.message}`, true);
            setButtonsEnabled(false);
            updateSignOutVisibility(false);
        }
    }

    // The link back to this page, shown on the home screen. Without it an
    // installed app on a phone has no way to reach sign-in at all: standalone
    // mode has no address bar.
    async function refreshStatusChip() {
        const chips = document.querySelectorAll("[data-cloud-status]");

        if (!chips.length) {
            return;
        }

        let label = "Sign in to back up your collection";
        let chipState = "signed-out";

        try {
            const settings = readSettings();

            if (!settings.supabaseUrl || !settings.supabaseKey) {
                label = "Cloud account not set up";
                chipState = "off";
            } else {
                const session = await getSession();

                if (session) {
                    label = `Signed in \u2014 ${session.user.email || "cloud backup on"}`;
                    chipState = "signed-in";
                }
            }
        } catch (error) {
            label = "Account \u2014 check connection";
            chipState = "off";
        }

        chips.forEach(chip => {
            chip.textContent = label;
            chip.dataset.cloudState = chipState;
        });
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

        const next = { ...readSettings(), supabaseUrl: normalizedUrl, supabaseKey: key };

        delete next.connectionCleared;

        saveSettings(next);
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
            supabaseKey: "",
            connectionCleared: true
        });
        client = null;
        clientConfig = null;
        updateConnectionInputs();

        const urlInput = document.getElementById("supabaseUrlInput");
        const keyInput = document.getElementById("supabaseKeyInput");

        if (urlInput) {
            urlInput.value = "";
        }

        if (keyInput) {
            keyInput.value = "";
            keyInput.placeholder = "eyJhbGciOi...";
        }

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

    // Core sync used both by the buttons on the login page and by the
    // automatic background sync (auto-sync.js).
    //
    // pushCore({ interactive }):
    //   interactive = true  -> keeps the old confirm() dialogs and status text.
    //   interactive = false -> never blocks on a dialog; returns a status so
    //                          the caller can show its own banner instead.
    // Status: "pushed" | "conflict" | "shrink-guard" | "no-session" | "error".
    async function pushCore({ interactive = true } = {}) {
        try {
            const session = await getSession();

            if (!session) {
                if (interactive) {
                    setSyncReport("Sign in first, then push.", true);
                }
                return "no-session";
            }

            const activeClient = getClient();

            const pushSettings = readSettings();
            const staleCheck = await checkCloudIsStale(activeClient, session.user.id, pushSettings);

            if (staleCheck.cloudUpdatedAt && !staleCheck.safe) {
                if (!interactive) {
                    return "conflict";
                }

                const overwrite = confirm(
                    "The cloud backup is newer than this device's last pull.\n\n" +
                    `Cloud updated: ${staleCheck.cloudUpdatedAt}\n` +
                    `This device last pulled: ${pushSettings.lastPulledAt || "never"}\n\n` +
                    "Another device may have pushed changes that this push would overwrite.\n" +
                    "Pull first to keep them, or push anyway to overwrite the cloud.\n\n" +
                    "Overwrite the cloud anyway?"
                );

                if (!overwrite) {
                    setSyncReport("Push cancelled. Use the Pull button to bring the other device's changes onto this device.", true);
                    return "conflict";
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
                    if (!interactive) {
                        return "shrink-guard";
                    }

                    const shrink = confirm(
                        "This device has far fewer snakes than the cloud backup.\n\n" +
                        `This device: ${localSnakeCount} snake(s)\n` +
                        `Cloud backup: ${cloudSnakeCount} snake(s)\n\n` +
                        "If this is a new device, PULL first instead of pushing.\n" +
                        "Pushing now would replace the cloud collection with this device's smaller one.\n\n" +
                        "Replace the cloud backup anyway?"
                    );

                    if (!shrink) {
                        setSyncReport("Push cancelled. Use the Pull button to load this device with the full collection.", true);
                        return "shrink-guard";
                    }
                }
            }

            if (interactive) {
                setSyncReport("Pushing\u2026");
            }

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

            saveSettings({
                ...readSettings(),
                lastPushedAt: row.updated_at,
                lastDevice: row.device,
                cloudUpdatedAt: row.updated_at
            });

            if (interactive) {
                setSyncReport(`Pushed ${describeCounts(getCollectionCounts())}.`);
            }

            return "pushed";
        } catch (error) {
            if (interactive) {
                setSyncReport(`Push failed: ${error.message}`, true);
            }
            console.error(error);
            return "error";
        }
    }

    // Core pull. Returns "pulled" | "empty" | "no-session" | "error".
    // silent keeps the status text off (the auto-sync engine reloads the page
    // right after a pull, so mid-pull text would never be read anyway).
    async function pullCore({ silent = false } = {}) {
        try {
            const session = await getSession();

            if (!session) {
                if (!silent) {
                    setSyncReport("Sign in first, then pull.", true);
                }
                return "no-session";
            }

            const activeClient = getClient();

            if (!silent) {
                setSyncReport("Pulling\u2026");
            }

            const { data, error } = await activeClient
                .from("snake_room_backups")
                .select("snapshot, updated_at, device")
                .eq("user_id", session.user.id)
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (!data || !data.snapshot) {
                if (!silent) {
                    setSyncReport("No cloud backup found yet. Changes are saved on this device; the backup appears after the first push (automatic once signed in).", true);
                }
                return "empty";
            }

            // Restoring cloud data is not a local edit, so it must not mark
            // anything dirty (auto-sync would otherwise queue a push of the
            // bytes it just downloaded).
            if (window.AutoSync && window.AutoSync.withWritesIgnored) {
                window.AutoSync.withWritesIgnored(() => applySnapshot(data.snapshot));
            } else {
                applySnapshot(data.snapshot);
            }

            saveSettings({
                ...readSettings(),
                lastPulledAt: new Date().toISOString(),
                cloudUpdatedAt: data.updated_at,
                cloudDevice: data.device
            });

            if (!silent) {
                setSyncReport(`Pulled backup from ${data.updated_at || "unknown time"}. Reload the other pages to see the restored data.`);
            }

            return "pulled";
        } catch (error) {
            if (!silent) {
                setSyncReport(`Pull failed: ${error.message}`, true);
            }
            console.error(error);
            return "error";
        }
    }

    async function pushSnapshot() {
        await pushCore({ interactive: true });
    }

    async function pullSnapshot() {
        await pullCore({ silent: false });
    }

    // ---- Account ----------------------------------------------------------
    //
    // Signing in has to work on a phone that has never seen this app, with no
    // address bar to type a URL into and no email client set up. So the page
    // offers the three actions that cover every case: sign in (password only,
    // no email delivery involved), create an account, and reset a forgotten
    // password.

    function setAuthReport(message, isError = false) {
        if (document.getElementById("authReport")) {
            showReport("authReport", message, isError);
            return;
        }

        setSyncReport(message, isError);
    }

    function readCredentials() {
        const emailInput = document.getElementById("emailInput");
        const passwordInput = document.getElementById("passwordInput");

        return {
            email: emailInput ? emailInput.value.trim() : "",
            password: passwordInput ? passwordInput.value || "" : ""
        };
    }

    function currentPageRedirect() {
        // Tokens arrive in the hash; sending that back as a redirect is noise.
        return window.location.href.split("#")[0];
    }

    function revealResendButton() {
        const button = document.getElementById("resendConfirmButton");

        if (button) {
            button.style.display = "inline-block";
        }
    }

    // Supabase's raw errors ("Invalid login credentials") do not tell a phone
    // user what to do next, and on iOS the most common cause is a capital
    // letter the keyboard added to the email address.
    function describeAuthError(error) {
        const code = (error && (error.code || error.error_code)) || "";
        const message = (error && error.message) || String(error);

        if (/invalid login credentials/i.test(message) || code === "invalid_credentials") {
            return "That email and password were not recognised. Check the email address has no capital letter at the start (phone keyboards add one). If you have never made an account here, press Create Account. If the password is wrong, press Forgot Password.";
        }

        if (/email not confirmed/i.test(message) || code === "email_not_confirmed") {
            revealResendButton();
            return "This account exists, but its email address is not confirmed yet. Open the confirmation email from Supabase (check the spam folder), or press Resend Confirmation Email below.";
        }

        if (/user already registered/i.test(message) || code === "user_already_exists") {
            return "An account with that email already exists. Press Sign In instead \u2014 or Forgot Password if the password is lost.";
        }

        if (/password should be at least/i.test(message)) {
            return "Supabase needs a password of at least 6 characters.";
        }

        if (/rate limit|too many requests|email_send_rate_limit/i.test(message) || /rate_limit/i.test(code)) {
            return "Supabase is throttling emails from this project (its built-in mail service allows only a few an hour). Wait an hour and try again \u2014 or sign in with a password, which sends no email at all.";
        }

        if (/failed to fetch|networkerror|load failed/i.test(message)) {
            return "This device could not reach Supabase. Check the connection and try again.";
        }

        if (/supabase library not loaded/i.test(message)) {
            return "The Supabase library did not load (it comes from a CDN). Check the connection and reload the page.";
        }

        return message;
    }

    async function signInWithPassword() {
        try {
            const { email, password } = readCredentials();

            if (!email || !password) {
                setAuthReport("Enter both your email and your password.", true);
                return;
            }

            const activeClient = getClient();
            setAuthReport("Signing in\u2026");

            const { error } = await activeClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                throw error;
            }

            const passwordInput = document.getElementById("passwordInput");

            if (passwordInput) {
                passwordInput.value = "";
            }

            saveSettings({ ...readSettings(), lastEmail: email });
            await refreshStatus();
            await refreshStatusChip();

            // A wiped phone (or a brand-new device) has no local snakes. Pull
            // immediately so the user does not have to think about it.
            if (getCollectionCounts().snakes === 0) {
                setAuthReport(`Signed in as ${email}. This device has no snakes yet, so your collection is being pulled from the cloud\u2026`);
                await pullSnapshot();
                return;
            }

            setAuthReport(`Signed in as ${email}.`);
        } catch (error) {
            setAuthReport(`Sign in failed: ${describeAuthError(error)}`, true);
            console.error(error);
        }
    }

    async function createAccount() {
        try {
            const { email, password } = readCredentials();

            if (!email || !password) {
                setAuthReport("Enter the email and password you want to use, then press Create Account.", true);
                return;
            }

            if (password.length < 6) {
                setAuthReport("Choose a password with at least 6 characters.", true);
                return;
            }

            const activeClient = getClient();
            setAuthReport("Creating your account\u2026");

            const { data, error } = await activeClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: currentPageRedirect() }
            });

            if (error) {
                throw error;
            }

            saveSettings({ ...readSettings(), lastEmail: email });

            if (data && data.session) {
                // Email confirmation is switched off in this project, so the
                // account is usable straight away.
                const passwordInput = document.getElementById("passwordInput");

                if (passwordInput) {
                    passwordInput.value = "";
                }

                await refreshStatus();
                await refreshStatusChip();
                setAuthReport(`Account created and signed in as ${email}.`);

                if (getCollectionCounts().snakes === 0) {
                    await pullSnapshot();
                } else {
                    setAuthReport(`Account created and signed in as ${email}. This device's collection is being saved to the account now.`);
                }

                return;
            }

            revealResendButton();
            setAuthReport(`Account created for ${email}. Supabase has emailed a confirmation link \u2014 open it on this device, then press Sign In. Nothing can sync until the address is confirmed.`);
        } catch (error) {
            setAuthReport(`Could not create the account: ${describeAuthError(error)}`, true);
            console.error(error);
        }
    }

    async function resendConfirmationEmail() {
        try {
            const { email } = readCredentials();

            if (!email) {
                setAuthReport("Enter your email first, then press Resend Confirmation Email.", true);
                return;
            }

            const activeClient = getClient();
            const { error } = await activeClient.auth.resend({
                type: "signup",
                email,
                options: { emailRedirectTo: currentPageRedirect() }
            });

            if (error) {
                throw error;
            }

            setAuthReport(`Confirmation email sent again to ${email}. If it does not arrive, check the spam folder.`);
        } catch (error) {
            setAuthReport(`Could not resend the confirmation email: ${describeAuthError(error)}`, true);
            console.error(error);
        }
    }

    async function sendPasswordReset() {
        try {
            const { email } = readCredentials();

            if (!email) {
                setAuthReport("Enter your email first, then press Forgot Password.", true);
                return;
            }

            const activeClient = getClient();
            setAuthReport("Asking Supabase for a reset link\u2026");

            const { error } = await activeClient.auth.resetPasswordForEmail(email, {
                redirectTo: currentPageRedirect()
            });

            if (error) {
                throw error;
            }

            setAuthReport(`If ${email} has an account, Supabase has emailed a reset link. Open it on this device and this page will ask for a new password.`);
        } catch (error) {
            setAuthReport(`Could not send the reset link: ${describeAuthError(error)}`, true);
            console.error(error);
        }
    }

    function showRecoveryPanel() {
        const panel = document.getElementById("recoveryPanel");

        if (!panel) {
            return;
        }

        panel.style.display = "";

        if (typeof panel.scrollIntoView === "function") {
            panel.scrollIntoView({ block: "start" });
        }
    }

    async function saveNewPassword() {
        try {
            const input = document.getElementById("newPasswordInput");
            const password = input ? input.value : "";

            if (password.length < 6) {
                showReport("recoveryReport", "Choose a password with at least 6 characters.", true);
                return;
            }

            const activeClient = getClient();
            const { error } = await activeClient.auth.updateUser({ password });

            if (error) {
                throw error;
            }

            if (input) {
                input.value = "";
            }

            showReport("recoveryReport", "New password saved. Use it to sign in from now on.");
            await refreshStatus();
            await refreshStatusChip();
        } catch (error) {
            showReport("recoveryReport", `Could not save the new password: ${describeAuthError(error)}`, true);
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

            setSyncReport("Signed out. The collection on this device is untouched.");
            await refreshStatus();
            await refreshStatusChip();
        } catch (error) {
            setSyncReport(`Sign out failed: ${error.message}`, true);
        }
    }

    // ---- Photo storage ----------------------------------------------------
    //
    // Photos live in a Supabase Storage bucket ("snake-photos": public to
    // read, writes locked to a private folder per signed-in user). Snake
    // records only store the photo's public URL, so the snapshot sync keeps
    // working exactly as before — the pictures themselves just live in the
    // cloud too and can never be lost with the device.

    async function compressImageToJpeg(file, maxEdge = 1400, quality = 0.82) {
        let source;

        try {
            source = await createImageBitmap(file, { imageOrientation: "from-image" });
        } catch (error) {
            source = await new Promise((resolve, reject) => {
                const url = URL.createObjectURL(file);
                const image = new Image();

                image.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve(image);
                };
                image.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error("That file could not be read as an image."));
                };
                image.src = url;
            });
        }

        const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
        const width = Math.max(1, Math.round(source.width * scale));
        const height = Math.max(1, Math.round(source.height * scale));
        const canvas = document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(source, 0, 0, width, height);

        if (typeof source.close === "function") {
            source.close();
        }

        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        return blob || file;
    }

    function snakePhotoPathFromImageValue(imageValue) {
        const match = /storage\/v1\/object\/public\/snake-photos\/(.+)$/i.exec(imageValue || "");
        return match ? decodeURIComponent(match[1]) : null;
    }

    function randomPhotoKey() {
        if (window.crypto && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }

        return `u${Date.now()}${Math.random().toString(16).slice(2)}`;
    }

    function describeStorageError(error) {
        const raw = error && error.message ? error.message : String(error);

        if (/bucket not found/i.test(raw)) {
            return "Photo storage isn't set up yet. Open the Account page, find Advanced setup, press Copy Photo SQL, and run it once in the Supabase SQL Editor, then try again.";
        }

        return raw;
    }

    // ---- Plan limits ------------------------------------------------------
    // When you start selling the app, store a plan per user (for example a
    // profiles table with a plan column) and pass that plan into
    // getPhotoLimit. Until then everyone is treated as the owner, with no
    // photo limit.
    const PHOTO_LIMITS = {
        free: 1,
        owner: Infinity
    };

    function getPhotoLimit(plan) {
        return PHOTO_LIMITS[plan] ?? PHOTO_LIMITS.owner;
    }

    async function uploadSnakePhotoFile(file, existingImage = "") {
        const activeClient = getClient();

        if (!activeClient) {
            throw new Error("No Supabase connection is saved.");
        }

        const session = await getSession();

        if (!session) {
            throw new Error("Not signed in.");
        }

        const blob = await compressImageToJpeg(file);
        const existingPath = snakePhotoPathFromImageValue(existingImage);
        const path = existingPath && existingPath.startsWith(`${session.user.id}/`)
            ? existingPath
            : `${session.user.id}/snake-${randomPhotoKey().slice(0, 18)}.jpg`;
        const bucket = activeClient.storage.from(PHOTO_BUCKET);

        const { error } = await bucket.upload(path, blob, {
            contentType: "image/jpeg",
            upsert: true
        });

        if (error) {
            throw new Error(describeStorageError(error));
        }

        return bucket.getPublicUrl(path).data.publicUrl;
    }

    async function deleteSnakePhoto(imageValue) {
        const path = snakePhotoPathFromImageValue(imageValue);

        if (!path) {
            return false; // Not a cloud photo (site path or data URL): nothing to delete.
        }

        const activeClient = getClient();

        if (!activeClient) {
            return false;
        }

        const session = await getSession();

        if (!session || !path.startsWith(`${session.user.id}/`)) {
            return false;
        }

        // Migration can point several snakes at the same cloud URL. Only
        // delete the file when no other snake still references it.
        const snakes = window.SnakeData.readStorageArray("snakes");
        const referenceCount = snakes.filter(snake =>
            (snake.image || "") === imageValue ||
            (Array.isArray(snake.photos) &&
                snake.photos.some(photo => photo && photo.url === imageValue))
        ).length;

        if (referenceCount > 1) {
            return false;
        }

        const { error } = await activeClient.storage.from(PHOTO_BUCKET).remove([path]);

        if (error) {
            console.error("Could not delete the cloud photo:", error);
            return false;
        }

        return true;
    }

    async function migrateImagesFolder(files, onProgress = null) {
        const session = await getSession();

        if (!session) {
            throw new Error("Sign in first, then back up the photo folder.");
        }

        const activeClient = getClient();
        const bucket = activeClient.storage.from(PHOTO_BUCKET);
        const snakes = window.SnakeData.readStorageArray("snakes");
        const wanted = new Map(); // image path -> matching picked file

        snakes.forEach(snake => {
            const image = (snake.image || "").trim().replace(/^\.\//, "");

            if (image && !/^(https?:|data:|blob:)/i.test(image) && !wanted.has(image)) {
                wanted.set(image, null);
            }
        });

        Array.from(files).forEach(file => {
            const relative = (file.webkitRelativePath || file.name).replace(/^\.\//, "");

            wanted.forEach((matchedFile, imagePath) => {
                if (!matchedFile && (relative === imagePath || relative.endsWith(`/${imagePath}`))) {
                    wanted.set(imagePath, file);
                }
            });
        });

        let uploaded = 0;
        let failed = 0;
        const missing = [];

        for (const [imagePath, file] of wanted) {
            if (!file) {
                missing.push(imagePath);
                continue;
            }

            try {
                const blob = await compressImageToJpeg(file);
                const path = `${session.user.id}/${imagePath}`;

                const { error } = await bucket.upload(path, blob, {
                    contentType: "image/jpeg",
                    upsert: true
                });

                if (error) {
                    throw new Error(describeStorageError(error));
                }

                const url = bucket.getPublicUrl(path).data.publicUrl;

                snakes.forEach(snake => {
                    if ((snake.image || "").trim().replace(/^\.\//, "") === imagePath) {
                        snake.image = url;
                    }
                });

                uploaded += 1;
            } catch (error) {
                const message = error && error.message ? error.message : String(error);

                // A missing bucket fails every file, so abort with the setup
                // instructions instead of grinding through the whole folder.
                if (/bucket not found|isn't set up yet/i.test(message)) {
                    throw error;
                }

                failed += 1;
                console.error(`Could not upload ${imagePath}:`, error);
            }

            if (typeof onProgress === "function") {
                onProgress(uploaded + failed, wanted.size, imagePath);
            }
        }

        if (uploaded > 0) {
            window.SnakeData.saveStorageArray("snakes", snakes);
        }

        return { uploaded, failed, missing };
    }

    async function backupPhotos() {
        const report = document.getElementById("photoReport");
        const input = document.getElementById("photoFolderInput");

        const showPhotoReport = message => {
            if (report) {
                report.textContent = message;
            }
        };

        try {
            if (!input || !input.files || input.files.length === 0) {
                showPhotoReport("Use the folder picker above first, then press Back Up Photo Folder again.");
                return;
            }

            if (report) {
                report.textContent = "Uploading photos\u2026";
                report.classList.remove("import-error");
            }

            const result = await migrateImagesFolder(input.files, (done, total, current) => {
                showPhotoReport(`Uploading photos\u2026 ${done} of ${total} (${current})`);
            });

            let message = `Uploaded ${result.uploaded} photo(s) to cloud storage.`;

            if (result.failed > 0) {
                message += ` ${result.failed} failed (details in the browser console).`;
            }

            if (result.missing.length > 0) {
                message += ` ${result.missing.length} snake photo path(s) were not in the chosen folder.`;
            }

            message += " Now press Push To Cloud to save the updated snake records.";
            showPhotoReport(message);
        } catch (error) {
            if (report) {
                report.textContent = `Photo backup failed: ${error.message}`;
                report.classList.add("import-error");
            }
        }
    }

    // ---- Boot -------------------------------------------------------------

    function bindEvents() {
        const bind = (id, handler) => {
            const element = document.getElementById(id);

            if (element) {
                element.addEventListener("click", handler);
            }
        };

        bind("pushButton", pushSnapshot);
        bind("pullButton", pullSnapshot);
        bind("saveConnectionButton", saveConnection);
        bind("clearConnectionButton", clearConnection);
        bind("sendMagicLinkButton", sendMagicLink);
        bind("signInPasswordButton", signInWithPassword);
        bind("createAccountButton", createAccount);
        bind("resendConfirmButton", resendConfirmationEmail);
        bind("resetPasswordButton", sendPasswordReset);
        bind("saveNewPasswordButton", saveNewPassword);
        bind("signOutButton", signOut);
        bind("copySqlButton", async () => {
            await navigator.clipboard.writeText(SETUP_SQL);
            setSyncReport("SQL copied to the clipboard.");
        });
        bind("copyPhotoSqlButton", async () => {
            await navigator.clipboard.writeText(PHOTO_SETUP_SQL);
            setSyncReport("Photo SQL copied to the clipboard.");
        });
        bind("backupPhotosButton", backupPhotos);
    }

    function init() {
        const sqlBlock = document.getElementById("setupSqlBlock");

        if (sqlBlock) {
            sqlBlock.textContent = SETUP_SQL;
        }

        const photoSqlBlock = document.getElementById("photoSqlBlock");

        if (photoSqlBlock) {
            photoSqlBlock.textContent = PHOTO_SETUP_SQL;
        }

        bindEvents();
        updateConnectionInputs();
        refreshStatus();
        refreshStatusChip();

        // Emailed links (magic link, confirmation, password reset) land back on
        // this page with tokens in the URL fragment. Parse them, clean the
        // address bar, and switch on the new-password panel for a reset. Only
        // the account page has that panel, so nothing to do elsewhere.
        if (!document.getElementById("recoveryPanel")) {
            return;
        }

        const hash = window.location.hash;

        if (hash.includes("type=recovery")) {
            showRecoveryPanel();
        }

        if (window.supabase && typeof window.supabase.createClient === "function") {
            const activeClient = getClient();

            if (activeClient) {
                activeClient.auth.onAuthStateChange((event) => {
                    if (event === "PASSWORD_RECOVERY") {
                        showRecoveryPanel();
                        return;
                    }

                    if (event === "SIGNED_IN") {
                        if (window.location.hash.includes("access_token")) {
                            history.replaceState(null, "", window.location.pathname);
                        }

                        refreshStatus();
                        refreshStatusChip();
                    }
                });
            }
        }
    }

    window.CloudSync = {
        buildSnapshot,
        applySnapshot,
        readSettings,
        SNAPSHOT_KEYS,
        PHOTO_BUCKET,
        PHOTO_SETUP_SQL,
        PHOTO_LIMITS,
        compressImageToJpeg,
        uploadSnakePhotoFile,
        deleteSnakePhoto,
        migrateImagesFolder,
        getPhotoLimit,
        getSession,
        describeAuthError,
        refreshStatusChip,
        pushCore,
        pullCore,
        _getClient: getClient,
        pullSnapshot,
        _setClientForTesting: value => {
            testClient = value;
        }
    };

    document.addEventListener("DOMContentLoaded", init);
})();
