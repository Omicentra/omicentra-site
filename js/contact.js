// contact.js
// Handles AJAX submit for the contact form

const ENDPOINT = "https://omicentra-contact.omicentra.workers.dev";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  const statusBox = document.getElementById("form-status");
  const submitBtn = document.getElementById("submit-btn");

  if (!form || !statusBox || !submitBtn) return;

  function showStatus(type, message) {
    statusBox.className = "form-status " + type;
    statusBox.textContent = message;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!form.checkValidity()) {
      showStatus("error", "Please complete all required fields.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    try {
      const formData = new FormData(form);

      const response = await fetch(ENDPOINT, {
        method: "POST",
        body: formData
      });

      const text = await response.text().catch(() => "");

      if (response.ok) {
        showStatus("success", "Thank you for your message.");
        form.reset();
        if (window.turnstile) turnstile.reset();
      } else {
        showStatus("error", text || "Something went wrong. Please try again.");
        if (window.turnstile) turnstile.reset();
      }

    } catch (err) {
      showStatus("error", "Network error. Please try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send message";
    }
  });
});
