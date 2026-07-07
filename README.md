# Egmon-Chat

Clone d'une application de messagerie inspiré de la maquette [React Chat (Tailkits)](https://tailkits.com/templates/react-chat/), développé dans le cadre du module Kadea.

Application **multi-pages** en HTML, CSS et JavaScript , branchée sur l'**API REST Kadea Chat** 

## Démonstration

**Projet en ligne :** https://egmon7.github.io/Projet-FinModule2-/

## Technologies

- HTML5
- CSS3 
- Tailwind CSS 
- JavaScript  
- API REST : [Kadea Chat API](https://kadea-chat-api.onrender.com)

## Fonctionnalités

### Authentification

- Inscription 
- Connexion avec récupération du profil 
- Déconnexion 
- Mot de passe oublié 

### Profil

- Panneau **Mon profil** (barre latérale) : avatar, nom, email, bio
- Modification de la bio 
- Affichage de la bio d'un contact 

### Chat

- Liste des utilisateurs du workspace et des conversations existantes
- **Recherche de conversations** dans la sidebar (nom, email, aperçu)
- Ouverture d'une conversation 
- Envoi et réception de messages en temps quasi réel (rafraîchissement automatique)
- **Envoi de photos** : upload Cloudinary → lien HTTPS envoyé comme message
-  suppression de **ses propres** messages
- Suppression d'une conversation
- Recherche de texte dans la conversation active
- Messages non lus mis en évidence dans la sidebar
- États vides et de chargement (contacts, messages, recherche sans résultat)

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
│   ├── cloudinary.js       # Upload images → URL Cloudinary
│   ├── blocked-users.js    # Filtrage des comptes test
│   └── theme.js            # Bascule thème clair / sombre
          
```

## Lancer en local

1. Cloner le dépôt
2. Ouvrir `index.html` dans un navigateur (ou utiliser **Live Server**)
3. Une connexion Internet est **requise** (appels vers l'API Kadea)
4. Créer un compte via **S'inscrire**, puis se connecter

### Photos (Cloudinary)

Les images sont envoyées sur **Cloudinary** (pas de stockage local). Dans [Cloudinary](https://cloudinary.com/) :

1. Cloud `ka4h4lpk` ()
2. **Settings → Upload → Add upload preset**
3. Mode **Unsigned**, nom : `egmon_chat`
Le message API contient alors l’URL HTTPS de l’image (`content`).


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
