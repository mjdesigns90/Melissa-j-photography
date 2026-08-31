// Automatically keep the copyright year current.
document.getElementById("year").textContent = new Date().getFullYear();

// Temporary Fine Art Prints link.
// Replace the href="#" values in index.html when your shop URL is ready.
function fineArtPlaceholder(event) {
  event.preventDefault();
  alert("Your Fine Art Prints shop link goes here! Replace the # link in index.html with your shop URL.");
  return false;
}
