document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("forgotPasswordForm");
  if (!form) return;

  const emailInput = document.getElementById("email");
  const codeInput = document.getElementById("code");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirmPassword");
  const sendCodeBtn = document.getElementById("sendCodeBtn");
  const resetFields = document.getElementById("resetPasswordFields");
  const formBox = form.closest(".auth-form-box");

  let codeSent = false;

  [emailInput, codeInput, passwordInput, confirmInput].forEach(function (input) {
    if (!input) return;
    input.addEventListener("input", function () {
      Auth.clearFieldError(input);
      Auth.hideFormMessage(formBox);
    });
  });

  sendCodeBtn.addEventListener("click", async function () {
    Auth.clearAllFieldErrors(form);
    Auth.hideFormMessage(formBox);

    const email = emailInput.value.trim();
    if (!email) {
      Auth.showFieldError(emailInput, "L'email est obligatoire.");
      return;
    }
    if (!Auth.isValidEmail(email)) {
      Auth.showFieldError(emailInput, "Email invalide.");
      return;
    }

    Auth.setButtonLoading(sendCodeBtn, true);
    Auth.showFormMessage(
      formBox,
      "Envoi en cours… Le serveur peut mettre jusqu'à 30 secondes à répondre.",
      "success"
    );

    try {
      await Auth.apiRequest("/auth/forgot-password", {
        method: "POST",
        body: { email: email },
        timeoutMs: 90000,
      });

      codeSent = true;
      resetFields.classList.remove("hidden");
      emailInput.readOnly = true;
      sendCodeBtn.disabled = true;
      sendCodeBtn.textContent = "Code envoyé";

      Auth.showFormMessage(
        formBox,
        "Code envoyé ! Vérifiez votre boîte mail puis saisissez le code ci-dessous.",
        "success"
      );

      if (codeInput) codeInput.focus();
    } catch (error) {
      const message = error.message || "Impossible d'envoyer le code.";
      if (message.toLowerCase().includes("email")) {
        Auth.showFieldError(emailInput, message);
      }
      Auth.showFormMessage(formBox, message, "error");
    } finally {
      if (!codeSent) {
        Auth.setButtonLoading(sendCodeBtn, false);
      }
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!codeSent) {
      Auth.showFormMessage(formBox, "Envoyez d'abord le code à votre adresse email.", "error");
      return;
    }

    Auth.clearAllFieldErrors(form);
    Auth.hideFormMessage(formBox);

    const code = codeInput.value.trim();
    const newPassword = passwordInput.value;
    const confirmPassword = confirmInput.value;
    let hasError = false;

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

    const resetBtn = document.getElementById("resetPasswordBtn");
    Auth.setButtonLoading(resetBtn, true);

    try {
      await Auth.apiRequest("/auth/reset-password", {
        method: "POST",
        body: {
          code: code,
          newPassword: newPassword,
        },
        timeoutMs: 90000,
      });

      Auth.showFormMessage(formBox, "Mot de passe réinitialisé ! Redirection…", "success");
      Auth.redirectAfterDelay("index.html", 1500);
    } catch (error) {
      const message = error.message || "Impossible de réinitialiser le mot de passe.";

      if (message.toLowerCase().includes("code")) {
        Auth.showFieldError(codeInput, message);
      } else if (message.toLowerCase().includes("password") || message.toLowerCase().includes("mot de passe")) {
        Auth.showFieldError(passwordInput, message);
      }

      Auth.showFormMessage(formBox, message, "error");
    } finally {
      Auth.setButtonLoading(resetBtn, false);
    }
  });
});
