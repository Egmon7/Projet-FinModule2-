document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const submitBtn = document.getElementById("loginBtn");
  const formBox = form.closest(".auth-form-box");

  // Supprimer l'erreur quand l'utilisateur corrige sa saisie
  [emailInput, passwordInput].forEach(function (input) {
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
    const password = passwordInput.value;
    let hasError = false;


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
    }

    if (hasError) return;

    Auth.setButtonLoading(submitBtn, true);

    try {
      // connexion 
      const loginData = await Auth.apiRequest("/auth/login", {
        method: "POST",
        body: { email: email, password: password },
      });

      // L'API renvoie la reponse de la connexion
      const token = loginData.data && loginData.data.token;
      if (!token) {
        throw { type: "api", message: "Token non reçu du serveur." };
      }

      Auth.saveToken(token);

      // récupérer le profil 
      const profileData = await Auth.apiRequest("/auth/me", { auth: true });
      const user = profileData.data;
      if (user) {
        Auth.saveUser(user);
      }

      Auth.showFormMessage(formBox, "Connexion réussie ! Redirection…", "success");
      Auth.redirectAfterDelay("chat.html", 1500);

    } catch (error) {
      const message = error.message || "Une erreur est survenue.";

      if (error.type === "network") {
        Auth.showFormMessage(formBox, message, "error");
      } else if (message.toLowerCase().includes("invalid") || message.toLowerCase().includes("incorrect")) {
        Auth.showFieldError(passwordInput, "Email ou mot de passe incorrect.");
        Auth.showFormMessage(formBox, message, "error");
      } else if (error.status === 401 || error.status === 403) {
        Auth.showFormMessage(formBox, "Utilisateur non authentifié.", "error");
      } else {
        Auth.showFormMessage(formBox, message, "error");
      }
    } finally {
      Auth.setButtonLoading(submitBtn, false);
    }
  });
});
