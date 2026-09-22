# MINUIT · Casino multijoueur

Blackjack européen, Texas Hold’em, La Tower, Mines et Roulette, multijoueurs en crédits fictifs. Next.js **16.3.5**, React, TypeScript, **Bun**, Socket.IO, Effect TS, Drizzle et PostgreSQL 18.

## Lancer le jeu

```sh
bun install
cp .env.example .env
# Renseigner DATABASE_URL et un BETTER_AUTH_SECRET aléatoire d’au moins 32 caractères.
bun run db:migrate
bun run dev
```

`DATABASE_SSL=disable` convient à PostgreSQL local. Supprimer cette surcharge et utiliser le mode SSL fourni dans `DATABASE_URL` lorsque le serveur accepte TLS. Ouvrir `http://localhost:3000`. Pour changer de port : `PORT=3001 bun run dev`.

Next.js recharge automatiquement les composants et le CSS. Après une modification de `server/`, redémarrer le serveur : ses tables sont conservées en mémoire. Le mode `bun --watch` est volontairement absent, car il redémarre le serveur lorsque Next charge ses fichiers générés.

## Jouer à plusieurs

1. Créer un compte avec un pseudo, une adresse e-mail et un mot de passe. Le portefeuille reçoit 2 000 crédits à sa création.
2. Choisir un jeton dans le porte-jetons, puis cliquer sur une zone **Blackjack**, **21+3** ou **Super Pairs directement sur le tapis**. Le jeton sélectionné reste actif pour les mises suivantes. Une mise Blackjack est nécessaire pour ajouter les paris annexes.
3. Prendre plusieurs places libres pour jouer plusieurs mains. La table offre 5 places partagées. Le bouton d’annulation retire le dernier jeton posé ; la croix retire toutes vos mises.
4. Cliquer sur **Je suis prêt** pour valider l’ensemble des mises. Si tous les joueurs ayant misé sont prêts, la manche démarre en 3 secondes. Sinon, les joueurs prêts démarrent après 12 secondes, les autres attendent la prochaine manche.
5. Inviter des amis avec le bouton du haut. Le menu de table propose plusieurs tables publiques (`MINUIT`, `LUNA`, `NOVA` et `OPALE`) et permet aussi de créer une table avec un code ou d’en rejoindre une. Une table « privée » est accessible à toute personne qui connaît son code ; elle n’a pas de mot de passe.

Sur le même réseau, les amis ouvrent `http://ADRESSE_IP_DU_SERVEUR:3000/?table=CODE`. Remplacer `localhost` dans le lien partagé par l’adresse IP du serveur. Le serveur écoute sur `0.0.0.0` par défaut. Pour simuler deux joueurs sur un ordinateur, utiliser deux profils de navigateur ou une fenêtre privée : deux onglets ordinaires partagent la même session Better Auth.

## Règles implémentées

### Poker Texas Hold’em

- **Cash Game public** à 2–5 joueurs avec matchmaking et placement automatiques. Limites 10/20, 50/100 et 250/500 ; buy-in réglable de 40 à 100 grosses blinds. Aucun rake.
- **Spin & Play public** à 3 joueurs, buy-ins de 200 à 25 000 crédits, tapis de tournoi de 500 et blinds croissantes toutes les deux minutes. La roue serveur attribue un multiplicateur de ×2 à ×1 000 ; le dernier joueur remporte tout.
- Règles No-Limit complètes : bouton et heads-up, relance minimale, all-in incomplet, pots secondaires, kickers, partages et jetons indivisibles.
- Paquet neuf de 52 cartes mélangé cryptographiquement à chaque main. Burn cards, flop, turn et river standards. Toutes les mains encore actives sont révélées au showdown.
- 25 secondes par décision en Cash Game et 15 secondes en Spin. Un joueur absent paie ses blinds puis check automatiquement si possible, sinon fold.
- Les cartes privées sont retirées individuellement des snapshots envoyés aux adversaires. La reconnexion restaure table, siège et cartes.
- Chat de table éphémère, limité à cinq messages en dix secondes et sans filtre lexical. Chaque client peut masquer localement un joueur.
- Les dix dernières mains de la table conservent le board, le pot, les gagnants et uniquement les cartes révélées.

### La Tower

- Choisir une difficulté : **Facile** (5 cartes par étage), **Normal** (4), **Difficile** (3) ou **Impossible** (2). Chaque étage cache toujours **un seul piège**, placé par le serveur au lancement.
- Mise de **5 à 500** crédits avec les jetons du casino, débitée au lancement. Dix étages : une bonne carte fait monter, le piège fait s’effondrer la tour et perdre la mise.
- Après chaque étage réussi, encaisser `mise × multiplicateur` ou continuer. Le 10ᵉ étage est encaissé automatiquement. Les multiplicateurs reprennent ceux de la Tower of Chance de MONOPOLY Poker (Normal, Difficile et Impossible correspondent à ses niveaux Easy, Medium et Hard), soit ×7,86 (Facile), ×15,5 (Normal), ×50,9 (Difficile) et ×919 (Impossible) au sommet. La part rendue baisse doucement à mesure qu'on monte, d’environ 92 % au premier étage à 87-90 % au sommet (88 % à 84 % en Facile, qui n’existe pas dans le jeu), plus 3 % versés dans la cagnotte Lucky.
- Seule la carte choisie est révélée, sauf en Impossible où l’autre carte est forcément le piège.
- **Lucky Tower** : chaque joueur a sa propre **cagnotte Lucky**, alimentée par 3 % de chacune de ses mises et conservée en mémoire serveur (remise à zéro au redémarrage). Certaines ascensions cachent une **carte dorée** sur une ligne de 3 à 6, jamais à la place du piège, tirée uniquement par le serveur avec une chance réglée par difficulté (≈ 1 ascension sur 500 la retourne en jouant au hasard). La retourner encaisse l’étage atteint et verse la cagnotte ; la tour s’illumine ensuite jusqu’au sommet, en animation seulement. Une carte dorée manquée est révélée avec sa ligne.
- Sons synthétisés en direct (Web Audio) : note montante à chaque étage, roulements de tambour près du sommet, effondrement, sonnerie de jackpot. Les voix « Lucky! » et « JACKPOT! » (`public/audio/tower/`) ont été générées avec la synthèse vocale de Windows ; les remplacer par de vrais enregistrements si besoin.
- Les joueurs sont répartis en **salles de 10** (rooms Socket.IO) : on ne voit, et on ne reçoit les mises à jour, que des grimpeurs de sa salle. Quitter la Tower règle l’ascension immédiatement : gains acquis encaissés, mise rendue avant le premier étage. Après une coupure réseau, l’ascension reste reprenable 10 minutes puis est réglée de la même façon.
- Le solde partagé entre les jeux n’est transmis que par l’événement serveur `wallet` (numéroté), jamais par les snapshots de jeu. Une mise Blackjack confirmée mais dépensée ailleurs avant la donne fait sortir le joueur de la manche au lieu de rendre son solde négatif.

### Blackjack européen

- Sabot mélangé de **8 jeux** avec générateur aléatoire cryptographique ; renouvellement entre les manches lorsque le sabot devient court.
- **Blackjack européen / ENHC** : le croupier ne reçoit initialement qu’une carte. Il reçoit sa deuxième carte après les joueurs et reste sur tous les 17, même souples.
- Blackjack naturel payé **3:2**, victoire **1:1**, égalité remboursée. Un blackjack du croupier fait perdre les mises de double et de séparation ; seul un blackjack naturel est remboursé à égalité.
- Double autorisé sur deux cartes, également après séparation. Au moment de doubler, le joueur choisit de voir immédiatement sa dernière carte ou de la garder face cachée jusqu’à la fin du jeu du croupier. Dans ce second mode, sa valeur reste uniquement sur le serveur jusqu’à la révélation. Séparation de cartes de même valeur, donc 10/valet/dame/roi peuvent être séparés ensemble, jusqu’à 4 mains par place. Les as séparés reçoivent une seule carte ; pas de nouvelle séparation des as. Le 21 après séparation paie 1:1.
- Pas d’assurance ni d’abandon. 25 secondes par décision, puis la main reste automatiquement, y compris après une déconnexion.
- Mises par pas de 5 : **5–500** au blackjack et **0–100** sur chaque pari annexe. Recharge à 2 000 crédits disponible lorsque le solde est inférieur à 5.
- Après une manche positive, tentez vos gains sur une carte **rouge ou noire**. L’option reste disponible jusqu’à votre décision sans bloquer les manches suivantes. Une bonne couleur double le montant à risque et permet de recommencer sans limite ; une mauvaise couleur perd la séquence. Vous pouvez encaisser à tout moment.

### 21+3

Deux cartes initiales du joueur + carte visible du croupier. Straight Flush, Three of a Kind, Straight et Flush sont tous payés **9 pour 1**. A-2-3 et Q-K-A sont des suites, K-A-2 n’en est pas une. Un seul gain par pari.

### Super Pairs

| Combinaison  | Condition                                                                           | Gain net |
| ------------ | ----------------------------------------------------------------------------------- | -------- |
| Suited Trips | Les deux cartes du joueur et celle du croupier ont le même rang et la même enseigne | 50:1     |
| Suited Pair  | Les deux cartes du joueur ont le même rang et la même enseigne                      | 25:1     |
| Prime Pair   | Même rang, même couleur rouge/noir, enseignes différentes                           | 10:1     |
| Any Pair     | Même rang, couleurs différentes                                                     | 8:1      |

Seule la meilleure combinaison est payée. « Pour 1 » désigne le gain net, avec remboursement de la mise en plus : 5 à 9:1 crédite 50.

**Les deux paris annexes sont réglés à la fin de la distribution, avant toute action de blackjack.** Le solde est immédiatement crédité, puis une animation de 2,2 secondes précède le premier tour. Ces gains peuvent financer un double ou une séparation. Ils ne sont pas recrédités à la fin de la manche et restent acquis même si le blackjack est perdu.

## État, sauvegarde et limites

- Better Auth 1.7.5 gère les comptes e-mail/mot de passe et les sessions dans PostgreSQL. Le navigateur ne conserve plus de profil ni de solde dans `localStorage`.
- PostgreSQL est la source de vérité du portefeuille. Chaque variation est atomique, refuse un débit qui rendrait le solde négatif et crée une ligne de journal avec un identifiant d’opération.
- Le serveur recharge le portefeuille avant toute commande financière. Chaque moteur déclare ses débits et crédits via le même port `GameWallet`, avec un identifiant stable et leur cause métier. Les opérations d’une commande sont écrites ensemble dans une seule transaction ; une commande sans variation de solde ne touche pas PostgreSQL.
- Le client reçoit le solde par `GET /api/profile` et par l’événement Socket.IO `wallet`. Ces valeurs servent à l’affichage et à désactiver des actions impossibles ; elles ne sont jamais acceptées comme autorité par le serveur.
- Les cartes, tables, manches et historiques restent en mémoire dans cette version. Un seul processus serveur doit donc héberger les parties. Les comptes, sessions, soldes et écritures du portefeuille survivent aux redémarrages.
- Une place déconnectée est libérée après 60 secondes lors de la phase de mise. Une table vide expire après 30 minutes ; un profil de jeu inactif est retiré de la mémoire après 24 heures, sans supprimer son compte ni son portefeuille.

## Production

```sh
bun install --frozen-lockfile
bun run db:migrate
bun run build
PORT=3000 bun run start
```

Définir `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` et `BETTER_AUTH_TRUSTED_ORIGINS` dans l’environnement de production. Exécuter les migrations une seule fois avant de démarrer la nouvelle version.

Héberger ce processus Bun persistant sur un serveur ou un service supportant les WebSockets. Le point de contrôle `GET /api/health` renvoie `{ "ok": true }`. Un proxy doit transmettre les en-têtes `Host`, `Upgrade` et `Connection`, et permettre les connexions persistantes. Utiliser HTTPS pour une adresse publique. Le serveur personnalisé ne peut pas être remplacé par un simple export statique ni par des fonctions serverless éphémères.

Les dépendances, scripts, tests et le développement sont gérés avec Bun. En production, `bun run start` lance toutefois le serveur TypeScript avec Node via `tsx` : Next.js 16.3.5 déclenche actuellement une erreur de chargement CommonJS lorsque son rendu de production est exécuté directement par Bun 1.3.9. Socket.IO et le reste de l’application restent inchangés.

Les polices sont servies localement. Le serveur PostgreSQL doit rester joignable pendant le jeu.

## Vérifier

```sh
bun run typecheck
bun run test
bun run build
bun run db:migrate
# Serveur lancé dans un autre terminal :
bun run test:multiplayer
bun run test:poker-multiplayer
bun run test:spin-multiplayer
# Port personnalisé :
TEST_URL=http://localhost:3001 bun run test:multiplayer
# Avec Chromium Playwright installé :
PLAYWRIGHT_BROWSERS_PATH=/tmp/minuit-browsers TEST_URL=http://localhost:3001 bun run test:ui
PLAYWRIGHT_BROWSERS_PATH=/tmp/minuit-browsers TEST_URL=http://localhost:3001 bun run test:poker-ui
PLAYWRIGHT_BROWSERS_PATH=/tmp/minuit-browsers TEST_URL=http://localhost:3001 bun run test:poker-lobby
```

Les tests couvrent les deux moteurs, toutes les catégories de mains Poker, la confidentialité des cartes, les side pots, les règles d’enchères, les crédits, les délais et les contrôles de propriété. Les intégrations jouent une manche Blackjack, une main Cash Game et un Spin & Play complet avec de vrais clients WebSocket.

## Fichiers principaux

- `server/engine.ts` : moteur et phases du Blackjack.
- `server/poker.ts` : moteur Hold’em, matchmaking, files et tables Poker.
- `server/index.ts` : serveur Bun/Next.js, sessions HTTP et protocole Socket.IO.
- `server/auth.ts` : configuration Better Auth.
- `server/db/schema.ts` : tables Better Auth, portefeuille et journal comptable.
- `server/game-wallet.ts` : contrat commun utilisé par les moteurs pour lire, débiter et créditer un portefeuille.
- `server/db/wallet.ts` : application atomique avec Effect TS/Drizzle des lots d’opérations dans PostgreSQL.
- `src/lib/rules.ts` : valeurs des cartes et évaluation des paris annexes.
- `src/lib/profile-context.tsx` : session Better Auth et solde d’affichage.
- `src/lib/use-game.ts` : connexion Socket.IO et commandes de jeu.
- `src/components/casino.tsx` : shell du casino et table Blackjack.
- `src/components/poker-casino.tsx` : accueil, lobby, table, chat et commandes Poker.
- `src/components/poker-lobby.tsx` : cartes d’entrée Cash Game et Spin & Play, choix du plafond et du tapis.
- `src/app/globals.css` : styles, animations et adaptation mobile.

`bun run format` formate le projet ; `bun run format:check` vérifie son formatage.
