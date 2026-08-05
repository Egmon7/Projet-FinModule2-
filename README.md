# Kadea-Chat

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
- Mot de passe oublié (page statique)

### Profil

- Panneau **Mon profil** (barre latérale) : avatar, nom, email, bio
- Modification de la bio 
- Affichage de la bio d'un contact 

### Chat

- Liste des utilisateurs du workspace et des conversations existantes
- Envoi et réception de messages en temps quasi réel (rafraîchissement automatique)
- **Envoi de photos** : upload Cloudinary 
-  suppression de **ses propres** messages
- Suppression d'une conversation
- Recherche de message dans la conversation active
- Messages non lus mis en évidence dans la sidebar
- États vides et de chargement 

### Interface

- Thème **clair / sombre** 
- Masquage des comptes de test (`blocked-users.js`)

## Structure du projet

```
projet2/
├── README.md               # Présentation, installation 
├── .gitignore              # Fichiers ignorés par Git
├── index.html              # Connexion
├── register.html           # Inscription
├── forgot-password.html    # Mot de passe oublié (statique)
├── chat.html               # Application de chat
├── css/
│   └── style.css           # Thème, layout chat, composants
├── js/
│   ├── auth.js             # API, session, helpers formulaires
│   ├── login.js            # Formulaire de connexion, token, redirection chat
│   ├── register.js         # Inscription, validation, compteur mot de passe
│   ├── profile.js          # Profil connecté, bio, déconnexion
│   ├── chat-state.js       # État partagé, init, refresh, utilitaires chat
│   ├── chat-contacts.js    # Contacts, conversations, sidebar
│   ├── chat-messages.js    # Envoi, affichage, recherche, édition messages
│   ├── cloudinary.js       # Upload images → URL Cloudinary
│   ├── avatars.js          # Affichage des avatars
│   ├── blocked-users.js    # Filtrage des comptes test
│   └── theme.js            # Bascule thème clair / sombre    
```

## Lancer en local

1. Cloner le dépôt
2. Ouvrir `index.html` dans un navigateur (ou utiliser **Live Server**)
3. Une connexion Internet est **requise** (appels vers l'API Kadea)
4. Créer un compte via **S'inscrire**, puis se connecter

### Photos (Cloudinary)

Les images sont envoyées sur **Cloudinary** (pas de stockage local). Dans [Cloudinary](https://cloudinary.com/) 

## Auteur

**Prospere Engeba.**
