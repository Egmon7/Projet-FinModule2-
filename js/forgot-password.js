document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("forgotPasswordForm");
  if (!form) return;

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirmPassword");
  const submitBtn = document.getElementById("forgotPasswordBtn");
  const formBox = form.closest(".auth-form-box");

  const inputs = [emailInput, passwordInput, confirmInput];

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

    const email = emailInput.value.trim();
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
      await Auth.apiRequest("/auth/forgot-password", {
        method: "POST",
        body: {
          email: email,
          newPassword: newPassword,
        },
      });

      Auth.showFormMessage(formBox, "Mot de passe réinitialisé avec succès ! Redirection…", "success");
      Auth.redirectAfterDelay("index.html", 1500);
    } catch (error) {
      const message = error.message || "Une erreur est survenue.";

      if (message.toLowerCase().includes("email")) {
        Auth.showFieldError(emailInput, message);
      } else if (message.toLowerCase().includes("password")) {
        Auth.showFieldError(passwordInput, message);
      }

      Auth.showFormMessage(formBox, message, "error");
    } finally {
      Auth.setButtonLoading(submitBtn, false);
    }
  });
});
