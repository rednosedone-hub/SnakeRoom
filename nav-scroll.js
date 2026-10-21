// nav-scroll.js
//
// On a phone the page tabs used to stack one per row, which pushed the records
// the page exists for below the fold. Wrap each tab row in a single strip that
// scrolls sideways instead, with an arrow at each end while there is more to
// reach. On wider screens the wrapper disappears and the row wraps as before.

(function () {
    function buildArrow(direction, label) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `button-scroll-arrow button-scroll-${direction}`;
        button.setAttribute("aria-label", label);
        button.innerHTML = direction === "left" ? "&#10094;" : "&#10095;";

        return button;
    }

    function enhance(row) {
        if (row.dataset.scrollReady === "true" || row.parentElement.classList.contains("button-row-scroller")) {
            return;
        }

        const scroller = document.createElement("div");
        scroller.className = "button-row-scroller";

        if (row.classList.contains("print-hidden")) {
            scroller.classList.add("print-hidden");
        }

        row.parentNode.insertBefore(scroller, row);
        scroller.appendChild(row);

        const left = buildArrow("left", "Scroll tabs left");
        const right = buildArrow("right", "Scroll tabs right");
        scroller.insertBefore(left, row);
        scroller.appendChild(right);

        function updateArrows() {
            const maxScroll = row.scrollWidth - row.clientWidth;
            const overflowing = maxScroll > 4;

            scroller.classList.toggle("is-scrollable", overflowing);
            left.disabled = !overflowing || row.scrollLeft <= 2;
            right.disabled = !overflowing || row.scrollLeft >= maxScroll - 2;
        }

        function scrollByPage(direction) {
            row.scrollBy({
                left: direction * Math.round(row.clientWidth * 0.7),
                behavior: "smooth"
            });
        }

        left.addEventListener("click", () => scrollByPage(-1));
        right.addEventListener("click", () => scrollByPage(1));
        row.addEventListener("scroll", updateArrows, { passive: true });
        window.addEventListener("resize", updateArrows);
        window.addEventListener("load", updateArrows);

        // Web fonts change how wide each tab is, so re-check once they land.
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(updateArrows).catch(() => {});
        }

        row.dataset.scrollReady = "true";
        updateArrows();
    }

    function init() {
        document.querySelectorAll(".button-row").forEach(enhance);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
