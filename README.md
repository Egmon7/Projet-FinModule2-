# Egmon-Chat

Clone d'une application de messagerie inspiré de la maquette [React Chat (Tailkits)](https://tailkits.com/templates/react-chat/), développé dans le cadre du module Kadea.

Application **multi-pages** en HTML, CSS et JavaScript Vanilla, branchée sur l'**API REST Kadea Chat** 

## Démonstration

**Projet en ligne :** https://egmon7.github.io/Projet-FinModule2-/

## Technologies

- HTML5
- CSS3 (variables de thème, responsive mobile / desktop)
- Tailwind CSS (pages d'authentification)
- JavaScript Vanilla (`fetch`, `async` / `await`, manipulation du DOM)
- API REST : [Kadea Chat API](https://kadea-chat-api.onrender.com)

## Fonctionnalités

### Authentification

- Inscription (`POST /auth/register`)
- Connexion avec récupération du profil (`POST /auth/login`, `GET /auth/me`)
- Déconnexion (`POST /auth/logout`)
- Mot de passe oublié (`POST /auth/forgot-password`)
- Session persistée dans le navigateur (token JWT + profil)

### Profil

- Panneau **Mon profil** (barre latérale) : avatar, nom, email, bio
- Modification de la bio (`PATCH /auth/me` ou `/users/me`)
- **Changement de mot de passe** connecté (`POST /auth/change-password`)
- Affichage de la bio d'un contact (panneau informations)

### Chat

- Liste des utilisateurs du workspace et des conversations existantes
- **Recherche de conversations** dans la sidebar (nom, email, aperçu)
- Ouverture d'une conversation 
- Envoi et réception de messages en temps quasi réel (rafraîchissement automatique)
- Modification et suppression de **ses propres** messages
- Suppression d'une conversation
- Recherche de texte dans la conversation active
- Messages non lus mis en évidence dans la sidebar
- États vides et de chargement (contacts, messages, recherche sans résultat)
- Interface adaptée au **mobile** (liste ↔ conversation)

### Interface

- Thème **clair / sombre** mémorisé localement
- Masquage des comptes de test (`blocked-users.js`)

## Structure du projet

```
projet2/
├── README.md               # Présentation, installation, routes API
├── .gitignore              # Fichiers ignorés par Git
├── index.html              # Connexion
├── register.html           # Inscription
├── forgot-password.html    # Mot de passe oublié
├── chat.html               # Application de chat
├── css/
│   └── style.css           # Thème, layout chat, composants
├── js/
│   ├── auth.js             # API, session, helpers formulaires
│   ├── login.js
│   ├── register.js
│   ├── forgot-password.js
│   ├── profile.js          # Profil connecté, bio, déconnexion
│   ├── chat.js             # Contacts, conversations, messages
│   ├── blocked-users.js    # Filtrage des comptes test
│   └── theme.js            # Bascule thème clair / sombre
            # Utilitaires (hors application)
```

## Lancer en local

1. Cloner le dépôt
2. Ouvrir `index.html` dans un navigateur (ou utiliser **Live Server**)
3. Une connexion Internet est **requise** (appels vers l'API Kadea)
4. Créer un compte via **S'inscrire**, puis se connecter


## API

Base : `https://kadea-chat-api.onrender.com`

Chaque requête envoie l'en-tête `x-api-key` (clé workspace). Les routes protégées exigent aussi `Authorization: Bearer <token>`.

### Authentification

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/auth/register` | Inscription `{ fullName, email, password }` |
| POST | `/auth/login` | Connexion → `{ token }` |
| GET | `/auth/me` | Profil connecté |
| PATCH / PUT | `/auth/me` ou `/users/me` | Mise à jour du profil (ex. `{ bio }`) |
| POST | `/auth/logout` | Déconnexion |
| POST | `/auth/forgot-password` | Réinitialisation `{ email, newPassword }` |
| POST | `/auth/change-password` | Mot de passe connecté `{ currentPassword, newPassword }` |

### Utilisateurs & conversations

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/users` | Liste des utilisateurs du workspace |
| GET | `/conversations` | Mes conversations |
| POST | `/conversations` | Créer une conversation |
| DELETE | `/conversations/{id}` | Supprimer une conversation |

### Messages

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/conversations/{id}/messages` | Lister les messages |
| POST | `/conversations/{id}/messages` | Envoyer `{ content }` |
| PATCH | `/messages/{id}` | Modifier `{ content }` |
| DELETE | `/messages/{id}` | Supprimer un message |

Documentation interactive : [Swagger API Kadea](https://kadea-chat-api.onrender.com/api-docs/)

## Auteur

Prospere Engeba
