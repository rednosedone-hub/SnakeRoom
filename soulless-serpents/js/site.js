/* Soulless Serpents — shared site behaviour and card rendering. */
(function () {
    "use strict";

    /* ---------- Shop settings ---------- */

    // Every shop-specific string lives in js/site-config.js, so a breeder with
    // their own name, tagline and contact never edits this file.
    var config = window.SS_CONFIG || {};
    var contact = config.contact || {};
    var stats = config.stats || {};
    var shopName = String(config.shopName || "The Snake Room").trim();
    var CONTACT_EMAIL = String(contact.email || "").trim();
    var CONTACT_INSTAGRAM = String(contact.instagramUrl || "").trim();

    /* ---------- Navigation ---------- */

    var toggle = document.querySelector(".nav__toggle");
    var links = document.querySelector(".nav__links");

    if (toggle && links) {
        toggle.addEventListener("click", function () {
            var open = links.classList.toggle("is-open");
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
        });

        links.addEventListener("click", function (event) {
            if (event.target.closest("a")) {
                links.classList.remove("is-open");
                toggle.setAttribute("aria-expanded", "false");
            }
        });
    }

    var header = document.querySelector(".site-header");
    if (header) {
        var onScroll = function () {
            header.classList.toggle("is-scrolled", window.scrollY > 12);
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
    }

    // Highlight the nav item for the page currently open.
    var page = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav__links a[href]").forEach(function (link) {
        var href = link.getAttribute("href").split("#")[0];
        if (href && href === page) {
            link.setAttribute("aria-current", "page");
        }
    });

    /* ---------- Footer year ---------- */

    document.querySelectorAll("[data-year]").forEach(function (node) {
        node.textContent = new Date().getFullYear();
    });

    /* ---------- Formatting helpers ---------- */

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function money(value) {
        return "$" + Number(value || 0).toLocaleString("en-US");
    }

    function monthYear(iso) {
        if (!iso) return "Unknown";
        var date = new Date(iso + "T00:00:00");
        if (isNaN(date.getTime())) return "Unknown";
        return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }

    function statusLabel(status) {
        if (status === "hold") return "On hold";
        if (status === "sold") return "Sold";
        return "Available";
    }

    // A listing belongs to whoever posted it, so it answers to that person's
    // contact details. Only when the listing carries none — every animal in the
    // shop's own export today — does it fall back to the shop address.
    function contactFor(snake) {
        var source = snake || {};
        var name = String(source.contactName || source.sellerName || "").trim();
        var email = String(source.contactEmail || source.sellerEmail || "").trim();
        var phone = String(source.contactPhone || source.sellerPhone || "").trim();
        var instagram = String(source.contactInstagram || source.instagram || "").trim();

        return {
            name: name,
            email: email || CONTACT_EMAIL,
            phone: phone,
            instagram: instagram
                ? (/^https?:/i.test(instagram) ? instagram : "https://instagram.com/" + instagram.replace(/^@/, ""))
                : CONTACT_INSTAGRAM,
            own: Boolean(email || phone || instagram)
        };
    }

    function telHref(phone) {
        return "tel:" + phone.replace(/[^+0-9]/g, "");
    }

    function enquireHref(snake) {
        var contact = contactFor(snake);
        var subject = "Enquiry: " + snake.morph + " (" + snake.id + ")";

        return "mailto:" + contact.email + "?subject=" + encodeURIComponent(subject);
    }

    // A listing has to say how to reach a person, not just how to add to cart.
    function contactHtml(snake) {
        var contact = contactFor(snake);
        var parts = ['<a href="mailto:' + escapeHtml(contact.email) + '">' + escapeHtml(contact.email) + "</a>"];

        if (contact.name) {
            parts.unshift('<strong>' + escapeHtml(contact.name) + "</strong>");
        }

        if (contact.phone) {
            parts.push('<a href="' + escapeHtml(telHref(contact.phone)) + '">' + escapeHtml(contact.phone) + "</a>");
        }

        parts.push('<a href="' + escapeHtml(contact.instagram) + '" rel="noopener">Instagram</a>');

        return '<p class="snake-contact">' + parts.join('<span aria-hidden="true"> &middot; </span>') + "</p>";
    }

    // Every gene is a door into the rest of the list: "who else is Banana?"
    function geneChips(snake) {
        var genes = Array.isArray(snake.genes) ? snake.genes : [];

        if (!genes.length) return "";

        return '<p class="snake-genes">' + genes.map(function (gene) {
            return '<a class="gene-chip" href="available.html?gene=' + encodeURIComponent(gene) + '">' +
                escapeHtml(gene) + "</a>";
        }).join("") + "</p>";
    }

    /* ---------- Snake card ---------- */

    function card(snake) {
        var status = snake.status || "available";
        var sold = status === "sold";
        var plate = '<div class="plate"><span>' + escapeHtml(snake.morph) + "</span><small>Photo coming soon</small></div>";
        var photo = snake.image
            ? '<img src="' + escapeHtml(snake.image) + '" alt="' +
              escapeHtml((snake.name ? snake.name + ", " : "") + snake.morph) +
              '" data-plate="' + escapeHtml(snake.morph) + '" loading="lazy">'
            : plate;

        var action = sold
            ? '<span class="btn btn--sm btn--disabled">Sold</span>'
            : '<a class="btn btn--sm" href="' + escapeHtml(enquireHref(snake)) + '">Enquire</a>';

        var priceHtml = sold
            ? '<span class="price price--muted">Sold</span>'
            : '<span class="price">' + money(snake.price) + "</span>";

        return '' +
            '<article class="snake-card' + (sold ? " snake-card--sold" : "") + '">' +
                '<div class="snake-photo">' +
                    '<span class="badge badge--' + escapeHtml(status) + '">' + statusLabel(status) + "</span>" +
                    photo +
                "</div>" +
                '<div class="snake-body">' +
                    '<p class="snake-id">' + escapeHtml(snake.id) + "</p>" +
                    "<h3>" + escapeHtml(snake.morph) + "</h3>" +
                    (snake.name ? '<p class="snake-name">&ldquo;' + escapeHtml(snake.name) + "&rdquo;</p>" : '<p class="snake-name">&nbsp;</p>') +
                    geneChips(snake) +
                    '<dl class="snake-meta">' +
                        "<div><dt>Sex</dt><dd>" + escapeHtml(snake.sex || "—") + "</dd></div>" +
                        "<div><dt>Hatched</dt><dd>" + monthYear(snake.hatchDate) + "</dd></div>" +
                        "<div><dt>Weight</dt><dd>" + (snake.weight ? escapeHtml(snake.weight) + " g" : "—") + "</dd></div>" +
                    "</dl>" +
                    (snake.notes ? '<p class="snake-note">' + escapeHtml(snake.notes) + "</p>" : "") +
                    contactHtml(snake) +
                    '<div class="snake-foot">' + priceHtml + action + "</div>" +
                "</div>" +
            "</article>";
    }

    // A photo path from an export can point at a file that was not copied over.
    // Fall back to the styled plate rather than showing a broken image icon.
    document.addEventListener("error", function (event) {
        var img = event.target;
        if (!img || img.tagName !== "IMG" || !img.closest(".snake-photo")) return;

        var plate = document.createElement("div");
        plate.className = "plate";
        plate.innerHTML = "<span>" + escapeHtml(img.getAttribute("data-plate") || "Photo") + "</span>" +
            "<small>Photo coming soon</small>";
        img.replaceWith(plate);
    }, true);

    /* ---------- Shop identity ---------- */

    // Everything marked data-* below is filled from site-config.js, so a new
    // breeder edits one file instead of hunting through four pages.
    function applyBrand() {
        var tagline = String(config.tagline || "").trim();
        var blurb = String(config.footerBlurb || "").trim();

        document.querySelectorAll("[data-shop-name]").forEach(function (node) {
            node.textContent = shopName;
        });

        document.querySelectorAll("[data-nav-label]").forEach(function (node) {
            node.textContent = config.navLabel || "";
        });

        // The last word of the shop name takes the gold accent in the hero.
        var heroTitle = document.querySelector("[data-hero-title]");
        if (heroTitle) {
            var words = shopName.split(/\s+/);
            heroTitle.innerHTML = words.length > 1
                ? escapeHtml(words.slice(0, -1).join(" ")) + " <span>" + escapeHtml(words[words.length - 1]) + "</span>"
                : escapeHtml(shopName);
        }

        document.querySelectorAll("[data-shop-tagline]").forEach(function (node) {
            if (tagline) {
                node.textContent = tagline;
            } else {
                node.hidden = true;
            }
        });

        document.querySelectorAll("[data-footer-blurb]").forEach(function (node) {
            if (blurb) {
                node.textContent = blurb;
            } else {
                node.hidden = true;
            }
        });

        document.querySelectorAll("[data-contact-email]").forEach(function (node) {
            if (!CONTACT_EMAIL) {
                node.hidden = true;
                return;
            }
            node.textContent = CONTACT_EMAIL;
            node.setAttribute("href", "mailto:" + CONTACT_EMAIL);
        });

        document.querySelectorAll("[data-contact-instagram]").forEach(function (node) {
            if (!CONTACT_INSTAGRAM) {
                node.hidden = true;
                return;
            }
            node.setAttribute("href", CONTACT_INSTAGRAM);
            node.textContent = node.getAttribute("data-contact-instagram") === "handle"
                ? (contact.instagramHandle || "Instagram")
                : "Instagram";
        });

        [["[data-contact-pickup]", contact.pickup], ["[data-contact-reply]", contact.reply]].forEach(function (pair) {
            document.querySelectorAll(pair[0]).forEach(function (node) {
                var value = String(pair[1] || "").trim();

                if (value) {
                    node.textContent = value;
                } else {
                    (node.closest("li") || node).hidden = true;
                }
            });
        });

        var genesNode = document.querySelector("[data-stat-genes]");
        if (genesNode) genesNode.textContent = stats.genesInCollection || "";

        var quarantineNode = document.querySelector("[data-stat-quarantine]");
        if (quarantineNode) quarantineNode.textContent = stats.quarantine || "";

        // data-page-title="" on the home page means shop name plus the tagline
        // fragment; any other page names itself before the shop name.
        var pageTitle = document.body.getAttribute("data-page-title");
        if (pageTitle !== null) {
            document.title = pageTitle
                ? pageTitle + " | " + shopName
                : shopName + (config.titleSuffix ? " | " + config.titleSuffix : "");
        }
    }

    applyBrand();

    /* ---------- Public helpers ---------- */

    window.SS = {
        email: CONTACT_EMAIL,
        data: window.SOULLESS_DATA || { snakes: [] },
        escapeHtml: escapeHtml,
        contactFor: contactFor,
        money: money,
        monthYear: monthYear,
        card: card,
        isLive: function (snake) {
            return snake.status !== "sold";
        }
    };
})();
