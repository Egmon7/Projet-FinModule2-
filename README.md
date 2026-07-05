# Egmon-Chat

Clone d'une application de messagerie inspiré de la maquette [React Chat (Tailkits)](https://tailkits.com/templates/react-chat/), développé dans le cadre du module Kadea.

## Démonstration

**Lien du projet en ligne :** https://egmon7.github.io/Projet-FinModule2-/

## Technologies

- HTML5
- CSS3
- Tailwind CSS
- JavaScript Vanilla
- API REST : [Kadea Chat API](https://kadea-chat-api.onrender.com)

## Fonctionnalités

- **Authentification** : inscription, connexion, déconnexion
- **Profil** : récupération du profil connecté via `GET /auth/me`
- **Mot de passe oublié** : envoi d'un code par email et réinitialisation
- **Chat** : liste des utilisateurs inscrits, conversations et messages via l'API
- **Thème** : mode clair / sombre

## Structure du projet

```
projet2/
├── index.html              # Connexion
├── register.html           # Inscription
├── forgot-password.html    # Mot de passe oublié
├── chat.html               # Application de chat
├── css/
│   └── style.css
├── js/
│   ├── auth.js             # Configuration API, session, helpers
│   ├── login.js
│   ├── register.js
│   ├── profile.js
│   ├── chat.js
│   ├── forgot-password.js
│   └── theme.js
└── images/
```

## Lancer en local

1. Cloner le dépôt
2. Ouvrir `index.html` dans un navigateur (ou utiliser Live Server)
3. Créer un compte via **S'inscrire**, puis se connecter

## API

Les appels passent par `https://kadea-chat-api.onrender.com` avec la clé workspace (`x-api-key`).

Routes utilisées :
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /users`
- `GET /conversations`
- `POST /conversations`
- `GET /conversations/{id}/messages`
- `POST /conversations/{id}/messages`
