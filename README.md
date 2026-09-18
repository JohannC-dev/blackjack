# MINUIT · Blackjack entre amis

Blackjack européen multijoueur en crédits fictifs. Next.js **16.3.5**, React, TypeScript, **Bun**, Socket.IO. Aucune base de données.

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

- Sabot mélangé de **8 jeux** avec générateur aléatoire cryptographique ; renouvellement entre les manches lorsque le sabot devient court.
- **Blackjack européen / ENHC** : le croupier ne reçoit initialement qu’une carte. Il reçoit sa deuxième carte après les joueurs et reste sur tous les 17, même souples.
- Blackjack naturel payé **3:2**, victoire **1:1**, égalité remboursée. Un blackjack du croupier fait perdre les mises de double et de séparation ; seul un blackjack naturel est remboursé à égalité.
- Double autorisé sur deux cartes, également après séparation. Au moment de doubler, le joueur choisit de voir immédiatement sa dernière carte ou de la garder face cachée jusqu’à la fin du jeu du croupier. Dans ce second mode, sa valeur reste uniquement sur le serveur jusqu’à la révélation. Séparation de cartes de même valeur, donc 10/valet/dame/roi peuvent être séparés ensemble, jusqu’à 4 mains par place. Les as séparés reçoivent une seule carte ; pas de nouvelle séparation des as. Le 21 après séparation paie 1:1.
- Pas d’assurance ni d’abandon. 25 secondes par décision, puis la main reste automatiquement, y compris après une déconnexion.
- Mises par pas de 5 : **5–500** au blackjack et **0–100** sur chaque pari annexe. Recharge à 2 000 crédits disponible lorsque le solde est inférieur à 5.

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
# Port personnalisé :
TEST_URL=http://localhost:3001 bun run test:multiplayer
# Avec Chromium Playwright installé :
PLAYWRIGHT_BROWSERS_PATH=/tmp/minuit-browsers TEST_URL=http://localhost:3001 bun run test:ui
```

Les tests du moteur couvrent les barèmes, le paiement anticipé des bonus, les crédits, ENHC, les as, doubles, séparations, délais et contrôles de propriété. Le test d’intégration joue une manche avec deux vrais clients WebSocket, trois places et une reconnexion.

## Fichiers principaux

- `server/engine.ts` : moteur et phases de jeu.
- `server/index.ts` : serveur Bun/Next.js et protocole Socket.IO.
- `src/lib/rules.ts` : valeurs des cartes et évaluation des paris annexes.
- `src/lib/use-game.ts` : connexion, reconnexion et sauvegarde du profil.
- `src/components/casino.tsx` : table, jetons, mains et commandes.
- `src/app/globals.css` : styles, animations et adaptation mobile.

`bun run format` formate le projet ; `bun run format:check` vérifie son formatage.
