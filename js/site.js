// site.js
// Small site-wide helpers

document.addEventListener("DOMContentLoaded", () => {
  // Sets the current year in the footer
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
});
