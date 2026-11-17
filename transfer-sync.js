// transfer-sync.js
// The Supabase side of handing an animal to another keeper's account.
//
// One row in snake_transfers holds the sanitised snake, who sent it and which
// account email may claim it. Row level security is what makes this safe: the
// sender can read and cancel their own rows, the named email can read and claim
// the row addressed to it, and nobody can see anything else.
//
// Every call fails soft. A signed-out keeper or a missing table returns a
// sentence the page can show, never an exception that breaks the record form.

(function () {
    "use strict";

    const TABLE = "snake_transfers";
    const SETUP_FILE = "site-tools/transfer-setup.sql";

    function helpers() {
        return window.TransferHelpers || null;
    }

    function activeClient() {
        if (!window.CloudSync || typeof window.CloudSync._getClient !== "function") {
            return null;
        }

        try {
            return window.CloudSync._getClient();
        } catch (error) {
            return null;
        }
    }

    async function context() {
        const client = activeClient();

        if (!client) {
            return { error: "Connect the cloud first: Account \u2192 Cloud backup." };
        }

        let session = null;

        try {
            session = await window.CloudSync.getSession();
        } catch (error) {
            return { error: "Could not read your sign-in. Reload the page and try again." };
        }

        if (!session || !session.user) {
            return { error: "Sign in first \u2014 a transfer needs an account at both ends." };
        }

        return {
            client: client,
            user: session.user,
            email: session.user.email || ""
        };
    }

    function describeError(error) {
        const message = String((error && (error.message || error.error_description)) || error || "");

        if (/does not exist|schema cache|42P01|PGRST205/i.test(message)) {
            return `Transfers are not set up yet: run ${SETUP_FILE} once in Supabase, then reload.`;
        }

        if (/row-level security|permission denied|violates row-level/i.test(message)) {
            return "Supabase refused that transfer. Check the transfer policies are installed.";
        }

        return message || "The transfer could not be saved.";
    }

    async function send(snake, toEmail, note) {
        const shared = helpers();

        if (!shared) {
            return { ok: false, error: "The transfer helper did not load. Reload the page." };
        }

        const ready = await context();

        if (ready.error) {
            return { ok: false, error: ready.error };
        }

        const built = shared.buildTransferRow({
            snake: snake,
            toEmail: toEmail,
            note: note,
            fromEmail: ready.email,
            fromName: (window.StorefrontContact ? window.StorefrontContact.read().name : "") || ready.email
        });

        if (!built.ok) {
            return built;
        }

        const { data, error } = await ready.client
            .from(TABLE)
            .insert({ ...built.row, from_user: ready.user.id })
            .select("id")
            .single();

        if (error) {
            return { ok: false, error: describeError(error) };
        }

        return {
            ok: true,
            id: data && data.id,
            to: built.row.to_email,
            from: built.row.from_email
        };
    }

    async function list() {
        const ready = await context();

        if (ready.error) {
            return { ok: false, error: ready.error, incoming: [], outgoing: [] };
        }

        const email = String(ready.email).trim().toLowerCase();

        const [incoming, outgoing] = await Promise.all([
            ready.client
                .from(TABLE)
                .select("*")
                .eq("to_email", email)
                .order("created_at", { ascending: false }),
            ready.client
                .from(TABLE)
                .select("*")
                .eq("from_user", ready.user.id)
                .order("created_at", { ascending: false })
        ]);

        if (incoming.error || outgoing.error) {
            return {
                ok: false,
                error: describeError(incoming.error || outgoing.error),
                incoming: [],
                outgoing: []
            };
        }

        return {
            ok: true,
            email: ready.email,
            incoming: incoming.data || [],
            outgoing: outgoing.data || []
        };
    }

    async function update(id, patch) {
        const ready = await context();

        if (ready.error) {
            return { ok: false, error: ready.error };
        }

        const { error } = await ready.client.from(TABLE).update(patch).eq("id", id);

        if (error) {
            return { ok: false, error: describeError(error) };
        }

        return { ok: true };
    }

    function accept(id) {
        return update(id, { status: "accepted", claimed_at: new Date().toISOString() });
    }

    function cancel(id) {
        return update(id, { status: "cancelled" });
    }

    window.TransferSync = {
        TABLE,
        SETUP_FILE,
        send,
        list,
        accept,
        cancel,
        describeError
    };
})();
