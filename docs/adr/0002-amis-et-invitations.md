# ADR 0002 — Amis persistés, invitations de jeu éphémères

- Statut : accepté
- Date : 2026-09-23

## Contexte

Les joueurs veulent se retrouver : s’ajouter en amis, voir qui est connecté, s’inviter à une table et consulter le profil d’un autre joueur. Des groupes de joueurs (appelés « clubs » dans la demande) viendront ensuite ; ils doivent pouvoir s’appuyer sur la même identité publique sans refonte.

Les invitations à une table n’ont de sens que tant que les deux joueurs sont connectés et que la table existe. Les conserver en base obligerait à les expirer, les nettoyer et les réconcilier avec des tables qui, elles, ne vivent qu’en mémoire.

## Décision

- `player_profile` porte l’identité publique d’un joueur, séparée de la table `user` de Better Auth : aujourd’hui un code ami unique de 8 caractères (sans 0/O ni 1/I), demain l’avatar ou la bio. Le code est attribué à la première lecture.
- `friendship` contient une ligne par paire de joueurs, garantie par un index unique sur `least/greatest` des deux identifiants : une demande (`pending`, du demandeur vers le destinataire) ou une amitié (`accepted`). Refuser, annuler ou retirer supprime la ligne. Deux demandes croisées deviennent une amitié.
- La recherche se fait uniquement par code ami complet, en une seule requête qui renvoie aussi le lien éventuel avec le joueur.
- Les routes HTTP `/api/friends` et `/api/players/:id` servent les données persistées. Chaque changement notifie les joueurs concernés par l’événement Socket.IO `friends:changed` ; le client recharge alors sa liste. La présence (en ligne ou non) est calculée à partir des connexions du serveur et n’est pas stockée.
- Les invitations de jeu (`friends:invite`, `friends:invite:reply`) passent uniquement par Socket.IO. Le serveur vérifie l’amitié, la connexion du destinataire et que l’expéditeur se trouve bien à la table qu’il partage. Rien n’est écrit en base.
- Le profil d’un joueur s’ouvre par un seul point d’entrée côté client (`openProfile`) et ses données viennent de `usePlayerProfile`, réutilisable par une future page de profil.

## Conséquences

- Un club pourra référencer `player_profile` (appartenance, rôle) sans toucher à `friendship` ni à l’authentification.
- Une invitation disparaît avec la connexion de son destinataire ; elle expire côté client après deux minutes.
- Rejoindre un ami implique de pouvoir rejoindre une table publique par son code : le Blackjack et la Roulette l’acceptent désormais, une table privée restant accessible par son code comme avant.
- Le Poker, la Tower et la Mine n’ont pas de table partageable : l’invitation mène au jeu, sans table privée.
- La recherche par pseudo n’existe pas : on ne trouve un joueur que si l’on connaît son code.

## Alternatives examinées

### Stocker les invitations de jeu

Historique consultable, mais elles pointeraient vers des tables disparues après un redémarrage et exigeraient un nettoyage régulier.

### Deux lignes par amitié

Lectures plus simples, mais chaque changement doit écrire deux lignes de façon cohérente, et les doublons de demandes deviennent possibles.
