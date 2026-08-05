
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("registerForm");
  if (!form) return;

  const fullNameInput = document.getElementById("fullName");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirmPassword");
  const submitBtn = document.getElementById("registerBtn");
  const passwordCounter = document.getElementById("passwordCounter");
  const formBox = form.closest(".auth-form-box");

  const inputs = [fullNameInput, emailInput, passwordInput, confirmInput];

  // Compteur de caractères du mot de passe
  passwordInput.addEventListener("input", function () {
    const length = passwordInput.value.length;
    passwordCounter.textContent = length + " caractère" + (length > 1 ? "s" : "");
    Auth.clearFieldError(passwordInput);
    Auth.hideFormMessage(formBox);
  });

  // Supprimer les erreurs à la correction
  inputs.forEach(function (input) {
    input.addEventListener("input", function () {
      Auth.clearFieldError(input);
      Auth.hideFormMessage(formBox);
    });
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    Auth.clearAllFieldErrors(form);
    Auth.hideFormMessage(formBox);

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value; 
    const confirmPassword = confirmInput.value;
    let hasError = false;

    // ── Validation ──
    if (!fullName) {
      Auth.showFieldError(fullNameInput, "Le nom complet est obligatoire.");
      hasError = true;
    } else if (fullName.length < 2) {
      Auth.showFieldError(fullNameInput, "Minimum 2 caractères.");
      hasError = true;
    }

    if (!email) {
      Auth.showFieldError(emailInput, "L'email est obligatoire.");
      hasError = true;
    } else if (!Auth.isValidEmail(email)) {
      Auth.showFieldError(emailInput, "Email invalide.");
      hasError = true;
    }

    if (!password) {
      Auth.showFieldError(passwordInput, "Le mot de passe est obligatoire.");
      hasError = true;
    } else if (password.length < 6) {
      Auth.showFieldError(passwordInput, "Minimum 6 caractères.");
      hasError = true;
    }

    if (!confirmPassword) {
      Auth.showFieldError(confirmInput, "Confirmez votre mot de passe.");
      hasError = true;
    } else if (password !== confirmPassword) {
      Auth.showFieldError(confirmInput, "Les mots de passe ne correspondent pas.");
      hasError = true;
    }

    if (hasError) return;

    Auth.setButtonLoading(submitBtn, true);

    try {
      await Auth.apiRequest("/auth/register", {
        method: "POST",
        body: {
          fullName: fullName,
          email: email,
          password: password,
        },
      });

      Auth.showFormMessage(formBox, "Inscription réussie ! Redirection vers la connexion…", "success");
      Auth.redirectAfterDelay("index.html", 1500);

    } catch (error) {
      const message = error.message || "Une erreur est survenue.";

      if (error.type === "network") {
        Auth.showFormMessage(formBox, message, "error");
      } else if (message.toLowerCase().includes("email")) {
        Auth.showFieldError(emailInput, message);
        Auth.showFormMessage(formBox, message, "error");
      } else {
        Auth.showFormMessage(formBox, message, "error");
      }
    } finally {
      Auth.setButtonLoading(submitBtn, false);
    }
  });
});
