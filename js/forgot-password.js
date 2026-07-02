document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("forgotPasswordForm");
  if (!form) return;

  const emailInput = document.getElementById("email");
  const codeInput = document.getElementById("code");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirmPassword");
  const submitBtn = document.getElementById("forgotPasswordBtn");
  const formBox = form.closest(".auth-form-box");

  [emailInput, codeInput, passwordInput, confirmInput].forEach(function (input) {
    input.addEventListener("input", function () {
      Auth.clearFieldError(input);
      Auth.hideFormMessage(formBox);
    });
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    Auth.clearAllFieldErrors(form);
    Auth.hideFormMessage(formBox);

    const email = emailInput.value.trim();
    const code = codeInput.value.trim();
    const newPassword = passwordInput.value;
    const confirmPassword = confirmInput.value;
    let hasError = false;

    if (!email) {
      Auth.showFieldError(emailInput, "L'email est obligatoire.");
      hasError = true;
    } else if (!Auth.isValidEmail(email)) {
      Auth.showFieldError(emailInput, "Email invalide.");
      hasError = true;
    }

    if (!code) {
      Auth.showFieldError(codeInput, "Le code est obligatoire.");
      hasError = true;
    } else if (!/^\d{6}$/.test(code)) {
      Auth.showFieldError(codeInput, "Le code doit contenir 6 chiffres.");
      hasError = true;
    }

    if (!newPassword) {
      Auth.showFieldError(passwordInput, "Le nouveau mot de passe est obligatoire.");
      hasError = true;
    } else if (newPassword.length < 6) {
      Auth.showFieldError(passwordInput, "Minimum 6 caractères.");
      hasError = true;
    }

    if (!confirmPassword) {
      Auth.showFieldError(confirmInput, "Confirmez votre mot de passe.");
      hasError = true;
    } else if (newPassword !== confirmPassword) {
      Auth.showFieldError(confirmInput, "Les mots de passe ne correspondent pas.");
      hasError = true;
    }

    if (hasError) return;

    Auth.setButtonLoading(submitBtn, true);

    try {
      // 1. Demander l'envoi du code par email
      await Auth.apiRequest("/auth/forgot-password", {
        method: "POST",
        body: { email: email },
      });

      // 2. Réinitialiser le mot de passe avec le code reçu
      await Auth.apiRequest("/auth/reset-password", {
        method: "POST",
        body: {
          code: code,
          newPassword: newPassword,
        },
      });

      Auth.showFormMessage(formBox, "Mot de passe réinitialisé avec succès ! Redirection…", "success");
      Auth.redirectAfterDelay("index.html", 1500);
    } catch (error) {
      const message = error.message || "Une erreur est survenue.";

      if (message.toLowerCase().includes("email")) {
        Auth.showFieldError(emailInput, message);
      } else if (message.toLowerCase().includes("code")) {
        Auth.showFieldError(codeInput, message);
      } else if (message.toLowerCase().includes("password")) {
        Auth.showFieldError(passwordInput, message);
      }

      Auth.showFormMessage(formBox, message, "error");
    } finally {
      Auth.setButtonLoading(submitBtn, false);
    }
  });
});
