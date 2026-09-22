# MINUIT · Casino multijoueur

Blackjack européen, Texas Hold’em et La Tower, multijoueurs en crédits fictifs. Next.js **16.3.5**, React, TypeScript, **Bun**, Socket.IO. Aucune base de données.

## Lancer le jeu

```sh
bun install
bun run dev
```

Ouvrir `http://localhost:3000`. Pour changer de port : `PORT=3001 bun run dev`.

Next.js recharge automatiquement les composants et le CSS. Après une modification de `server/`, redémarrer le serveur : ses tables sont conservées en mémoire. Le mode `bun --watch` est volontairement absent, car il redémarre le serveur lorsque Next charge ses fichiers générés.

## Jouer à plusieurs

1. Choisir un pseudo à la première visite : le profil reçoit 2 000 crédits.
2. Choisir un jeton dans le porte-jetons, puis cliquer sur une zone **Blackjack**, **21+3** ou **Super Pairs directement sur le tapis**. Le jeton sélectionné reste actif pour les mises suivantes. Une mise Blackjack est nécessaire pour ajouter les paris annexes.
3. Prendre plusieurs places libres pour jouer plusieurs mains. La table offre 5 places partagées. Le bouton d’annulation retire le dernier jeton posé ; la croix retire toutes vos mises.
4. Cliquer sur **Je suis prêt** pour valider l’ensemble des mises. Si tous les joueurs ayant misé sont prêts, la manche démarre en 3 secondes. Sinon, les joueurs prêts démarrent après 12 secondes, les autres attendent la prochaine manche.
5. Inviter des amis avec le bouton du haut. Le menu de table propose plusieurs tables publiques (`MINUIT`, `LUNA`, `NOVA` et `OPALE`) et permet aussi de créer une table avec un code ou d’en rejoindre une. Une table « privée » est accessible à toute personne qui connaît son code ; elle n’a pas de mot de passe.

Sur le même réseau, les amis ouvrent `http://ADRESSE_IP_DU_SERVEUR:3000/?table=CODE`. Remplacer `localhost` dans le lien partagé par l’adresse IP du serveur. Le serveur écoute sur `0.0.0.0` par défaut. Pour simuler deux joueurs sur un ordinateur, utiliser deux profils de navigateur ou une fenêtre privée : deux onglets ordinaires partagent la même identité locale.

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

### Roulette européenne

- Table **multijoueur** partagée, sur le même code que la table de Blackjack (`?table=CODE`), jusqu’à 8 joueurs. Reprise de la roulette de Malori, en crédits.
- Un seul zéro. Plein 35:1, cheval 17:1, carré 8:1, douzaine et colonne 2:1, rouge/noir, pair/impair et manque/passe 1:1. Le zéro fait perdre toutes les chances simples.
- Choisir un jeton puis cliquer sur le tapis. Viser le **bord** d’un numéro joue le cheval avec son voisin (y compris 0/1, 0/2 et 0/3 sur la ligne du zéro), un **coin** joue le carré ; les numéros couverts s’allument avant le clic. Clic droit pour retirer une mise. Mises par pas de 5, 500 crédits maximum par case.
- Seule une connexion qui affiche la table peut miser : un onglet resté sur un autre jeu est refusé. Plusieurs onglets ouverts sur la Roulette jouent la même place.
- Les mises des autres joueurs sont visibles en vert translucide. Après **Je suis prêt**, la bille part 10 secondes plus tard (3 secondes si tous les joueurs de la table sont prêts) ; les joueurs non prêts ne jouent pas.
- Le serveur tire le numéro. Les mises sont débitées au lancement de la bille et les gains crédités à son arrivée.
- Au résultat, les cases gagnantes s’allument et un bandeau affiche le retour de la manche, comme au Blackjack. Les jetons perdants se soulèvent puis tombent en pluie ; les gains arrivent ensuite du haut de la table et fusionnent avec les piles gagnantes (même animation de règlement que le Blackjack), qui restent en place jusqu’à la manche suivante.

### La Tower

- Choisir une difficulté : **Facile** (5 cartes par étage), **Normal** (4), **Difficile** (3) ou **Impossible** (2). Chaque étage cache toujours **un seul piège**, placé par le serveur au lancement.
- Mise de **5 à 500** crédits avec les jetons du casino, débitée au lancement. Dix étages : une bonne carte fait monter, le piège fait s’effondrer la tour et perdre la mise.
- Après chaque étage réussi, encaisser `mise × multiplicateur` ou continuer. Le 10ᵉ étage est encaissé automatiquement. Les multiplicateurs reprennent ceux de la Tower of Chance de MONOPOLY Poker (Normal, Difficile et Impossible correspondent à ses niveaux Easy, Medium et Hard), soit ×7,86 (Facile), ×15,5 (Normal), ×50,9 (Difficile) et ×919 (Impossible) au sommet. La part rendue baisse doucement à mesure qu'on monte, d’environ 92 % au premier étage à 87-90 % au sommet (88 % à 84 % en Facile, qui n’existe pas dans le jeu), plus 3 % versés dans la cagnotte Lucky.
- Seule la carte choisie est révélée, sauf en Impossible où l’autre carte est forcément le piège.
- **Lucky Tower** : chaque joueur a sa propre **cagnotte Lucky**, alimentée par 3 % de chacune de ses mises et conservée en mémoire serveur (remise à zéro au redémarrage). Certaines ascensions cachent une **carte dorée** sur une ligne de 3 à 6, jamais à la place du piège, tirée uniquement par le serveur avec une chance réglée par difficulté (≈ 1 ascension sur 500 la retourne en jouant au hasard). La retourner encaisse l’étage atteint et verse la cagnotte ; la tour s’illumine ensuite jusqu’au sommet, en animation seulement. Une carte dorée manquée est révélée avec sa ligne.
- Sons synthétisés en direct (Web Audio) : note montante à chaque étage, roulements de tambour près du sommet, effondrement, sonnerie de jackpot. Les voix « Lucky! » et « JACKPOT! » (`public/audio/tower/`) ont été générées avec la synthèse vocale de Windows ; les remplacer par de vrais enregistrements si besoin.
- Les joueurs sont répartis en **salles de 10** (rooms Socket.IO) : on ne voit, et on ne reçoit les mises à jour, que des grimpeurs de sa salle. Quitter la Tower règle l’ascension immédiatement : gains acquis encaissés, mise rendue avant le premier étage. Après une coupure réseau, l’ascension reste reprenable 10 minutes puis est réglée de la même façon.
- Le solde partagé entre les trois jeux n’est transmis que par l’événement serveur `wallet` (numéroté), jamais par les snapshots de jeu. Une mise Blackjack confirmée mais dépensée ailleurs avant la donne fait sortir le joueur de la manche au lieu de rendre son solde négatif.

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

- `localStorage["minuit.profile.v1"]` conserve le pseudo, un jeton de session aléatoire et le dernier solde reçu. La première arrivée sans profil donne 2 000 crédits.
- Le serveur fait autorité sur les cartes, les mises, les tours, les gains et les soldes de la session. Il ne transmet ni le sabot ni les jetons privés dans les états publics.
- Une reconnexion retrouve les mains et le solde du serveur. Modifier le localStorage pendant une session connue ne modifie pas le solde serveur.
- Les profils inconnus sont restaurés depuis le stockage local : les crédits restent modifiables par le propriétaire du navigateur, conformément au choix d’un jeu fictif sans base de données.
- Les tables, manches et historiques sont en mémoire : un redémarrage les réinitialise. Les mises déjà débitées d’une manche interrompue ne sont pas récupérables automatiquement après un crash. Le solde restauré est le dernier reçu par le navigateur.
- Une place déconnectée est libérée après 60 secondes lors de la phase de mise. Une table vide expire après 30 minutes ; les sessions déconnectées expirent après 24 heures.
- Une seule instance serveur doit héberger les tables. Plusieurs réplicas nécessiteraient un stockage et une coordination partagés.

## Production

```sh
bun install --frozen-lockfile
bun run build
PORT=3000 bun run start
```

Héberger ce processus Bun persistant sur un serveur ou un service supportant les WebSockets. Le point de contrôle `GET /api/health` renvoie `{ "ok": true }`. Un proxy doit transmettre les en-têtes `Host`, `Upgrade` et `Connection`, et permettre les connexions persistantes. Utiliser HTTPS pour une adresse publique. Le serveur personnalisé ne peut pas être remplacé par un simple export statique ni par des fonctions serverless éphémères.

Les dépendances, scripts, tests et le développement sont gérés avec Bun. En production, `bun run start` lance toutefois le serveur TypeScript avec Node via `tsx` : Next.js 16.3.5 déclenche actuellement une erreur de chargement CommonJS lorsque son rendu de production est exécuté directement par Bun 1.3.9. Socket.IO et le reste de l’application restent inchangés.

Les polices sont servies localement. Aucun service externe n’est nécessaire pour jouer.

## Vérifier

```sh
bun run typecheck
bun run test
bun run build
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
- `server/roulette/` : Roulette écrite avec [Effect](https://effect.website) — erreurs typées (`errors.ts`), validation des commandes par `Schema` (`schema.ts`), table immuable (`table.ts`), registre transactionnel des tables (`service.ts`) et runtime synchrone branché sur Socket.IO (`index.ts`). Joueurs, roue, horloge et transport sont des services injectés, remplacés par des doubles dans les tests.
- `server/index.ts` : serveur Bun/Next.js et protocole Socket.IO.
- `src/lib/rules.ts` : valeurs des cartes et évaluation des paris annexes.
- `src/lib/use-game.ts` : connexion, reconnexion et sauvegarde du profil.
- `src/components/casino.tsx` : shell du casino et table Blackjack.
- `src/components/poker-casino.tsx` : accueil, lobby, table, chat et commandes Poker.
- `src/components/poker-lobby.tsx` : cartes d’entrée Cash Game et Spin & Play, choix du plafond et du tapis.
- `src/app/globals.css` : styles, animations et adaptation mobile.

`bun run format` formate le projet ; `bun run format:check` vérifie son formatage.
