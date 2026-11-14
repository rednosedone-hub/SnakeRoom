// storefront-contact.js
// One keeper's public shop identity: who a buyer is actually writing to.
//
// Every published listing carries these details, because an enquiry about
// someone else's animal must never land in this shop's inbox. The record is
// required before an animal can be published: without a name and a working
// email the export is skipped by site-tools/build-available.js.
//
// It lives in localStorage as a plain object, so the normal cloud snapshot
// (SNAPSHOT_KEYS in cloud-sync.js) carries it to the keeper's other devices.
(function () {
    const STORAGE_KEY = "storefrontContact";
    const EMPTY = { name: "", email: "", phone: "", instagram: "", slug: "" };

    function text(value) {
        return String(value === undefined || value === null ? "" : value).trim();
    }

    // The shop handle is what the storefront address and its published row are
    // keyed on, so it is derived from the shop name unless the keeper sets it.
    function slugify(value) {
        return text(value)
            .toLowerCase()
            .replace(/&/g, " and ")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60);
    }

    function clean(record) {
        const source = record && typeof record === "object" ? record : {};

        return {
            name: text(source.name),
            email: text(source.email),
            phone: text(source.phone),
            instagram: text(source.instagram).replace(/^@+/, ""),
            slug: slugify(source.slug || source.name)
        };
    }

    function read() {
        try {
            return clean(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
        } catch (error) {
            return { ...EMPTY };
        }
    }

    function save(record) {
        const cleaned = clean(record);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));

        window.dispatchEvent(new CustomEvent("storefront-contact-changed", { detail: cleaned }));

        return cleaned;
    }

    // What still has to be filled in before a listing may be published.
    function problems(record) {
        const contact = clean(record);
        const missing = [];

        if (!contact.name) {
            missing.push("a shop or seller name");
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
            missing.push("a working email address");
        }

        return missing;
    }

    function isComplete(record) {
        return problems(record).length === 0;
    }

    function instagramUrl(handle) {
        const value = text(handle);

        if (!value) {
            return "";
        }

        return /^https?:/i.test(value)
            ? value
            : "https://instagram.com/" + value.replace(/^@+/, "");
    }

    // ---- The form on the For Sale page ------------------------------------

    const FIELD_IDS = {
        name: "sellerNameInput",
        email: "sellerEmailInput",
        phone: "sellerPhoneInput",
        instagram: "sellerInstagramInput",
        slug: "sellerSlugInput"
    };

    function fieldValue(id) {
        const field = document.getElementById(id);

        return field ? field.value : "";
    }

    function setStatus(message, isError) {
        const status = document.getElementById("storefrontContactStatus");

        if (!status) {
            return;
        }

        status.textContent = message;
        status.style.color = isError ? "#ffb4a8" : "";
    }

    function fillForm() {
        const contact = read();

        Object.keys(FIELD_IDS).forEach(key => {
            const field = document.getElementById(FIELD_IDS[key]);

            if (field) {
                field.value = contact[key] || "";
            }
        });

        const slugField = document.getElementById(FIELD_IDS.slug);

        if (slugField && !slugField.value && contact.name) {
            slugField.placeholder = slugify(contact.name);
        }

        const missing = problems(contact);

        if (missing.length) {
            setStatus("Add " + missing.join(" and ") + " before publishing.", true);
        } else {
            setStatus("Saving listings as " + contact.name + " \u00b7 " + contact.email);
        }
    }

    function saveFromForm() {
        const draft = {
            name: fieldValue(FIELD_IDS.name),
            email: fieldValue(FIELD_IDS.email),
            phone: fieldValue(FIELD_IDS.phone),
            instagram: fieldValue(FIELD_IDS.instagram),
            slug: fieldValue(FIELD_IDS.slug) || fieldValue(FIELD_IDS.name)
        };
        const missing = problems(draft);

        if (missing.length) {
            setStatus("Add " + missing.join(" and ") + " first.", true);
            return;
        }

        const saved = save(draft);

        setStatus("Saved. Listings will show " + saved.name + " \u00b7 " + saved.email);
    }

    function initForm() {
        const button = document.getElementById("saveStorefrontContactButton");

        if (!button) {
            return;
        }

        fillForm();
        button.addEventListener("click", saveFromForm);
    }

    window.StorefrontContact = {
        STORAGE_KEY,
        read,
        save,
        problems,
        isComplete,
        instagramUrl,
        slugify
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initForm);
    } else {
        initForm();
    }
})();
