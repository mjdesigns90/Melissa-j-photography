// Automatically keep the copyright year current.
document.getElementById("year").textContent = new Date().getFullYear();

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
  window.matchMedia("(max-width: 900px)").addEventListener("change", closeMenu);
}

// Temporary Fine Art Prints link.
// Replace the href="#" values in index.html when your shop URL is ready.
function fineArtPlaceholder(event) {
  event.preventDefault();
  alert("Your Fine Art Prints shop link goes here! Replace the # link in index.html with your shop URL.");
  return false;
}
