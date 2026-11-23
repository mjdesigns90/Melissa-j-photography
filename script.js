const menuSignal = window.previewPageSignal;
// Automatically keep the copyright year current.
const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

// Some HTML preview hosts cannot serve the large original photo assets.
// Keep local files first; recover with the identical, version-pinned originals.
document.querySelectorAll("img[data-original-fallback]").forEach((image) => {
  const useOriginalFallback = () => {
    const original = image.dataset.originalFallback;
    if (!original) return;
    delete image.dataset.originalFallback;
    image.src = original;
  };
  image.addEventListener("error", useOriginalFallback, { once: true });
  // An image can fail before this end-of-page script has run.
  if (image.complete && image.naturalWidth === 0) useOriginalFallback();
});

const navigation = document.querySelector(".site-nav");
if (navigation) {
  const toggle = navigation.querySelector(".site-nav-toggle");
  const links = navigation.querySelector(".site-nav-links");
  const closeMenu = () => {
    navigation.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  if (toggle && links) {
  navigation.classList.add("is-enhanced");
  toggle.hidden = false;
  toggle.addEventListener("click", () => {
    const open = navigation.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  links.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });
  navigation.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navigation.classList.contains("is-open")) {
      closeMenu();
      toggle.focus();
    }
  });
  window.matchMedia("(max-width: 900px)").addEventListener("change", closeMenu, { signal: menuSignal });
  }
}

