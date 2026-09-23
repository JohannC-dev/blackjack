# ADR 0001 — Port de portefeuille explicite pour les moteurs de jeu

- Statut : accepté
- Date : 2026-09-22

## Contexte

Tous les jeux partagent le même portefeuille PostgreSQL. L’ancienne intégration comparait périodiquement le solde en mémoire avec une copie précédente, puis déduisait une variation sans connaître l’événement de jeu qui l’avait causée. Cette approche balayait tous les joueurs, produisait des identifiants aléatoires au moment de l’écriture et associait parfois plusieurs jeux à une même raison de maintenance.

L’ajout d’un jeu doit demander peu de câblage tout en conservant les mêmes garanties : contrôle serveur du solde, débit impossible sous zéro, écritures peu nombreuses, journal explicable et reprise idempotente.

## Décision

Chaque moteur reçoit un port `GameWallet` avec trois opérations : lire le solde projeté, débiter et créditer. Chaque mutation fournit une opération complète : identifiant stable, jeu, catégorie, raison, référence de manche et métadonnées utiles.

Le serveur ouvre un lot autour d’une commande financière ou d’un tick de moteur. Le moteur modifie sa projection et enregistre ses opérations dans ce lot. À la fin, le dépôt PostgreSQL applique tout le lot dans une seule transaction, met à jour la projection avec le résultat enregistré, puis publie le solde. En cas d’échec avant la validation SQL, les mutations de portefeuille du lot sont annulées en mémoire.

Les moteurs utilisent une implémentation en mémoire par défaut pour rester testables sans base de données. Le serveur injecte l’implémentation qui enregistre les opérations destinées à PostgreSQL.

## Conséquences

- Un nouveau jeu dépend uniquement de `GameWallet` et ne connaît ni Drizzle, ni PostgreSQL, ni Socket.IO.
- Une action sans débit ni crédit ne déclenche aucune transaction SQL.
- Plusieurs opérations causées par une même action, comme une mise suivie d’un règlement immédiat, sont écrites atomiquement.
- Le journal distingue une mise, une mise supplémentaire, un gain, un remboursement, un buy-in, un cashout, un prix et une attribution.
- Les identifiants dupliqués dans un même lot sont refusés avant toute seconde mutation.
- Les états de partie restent en mémoire et le traitement financier reste sérialisé dans le processus serveur actuel.

## Alternatives examinées

### Conserver la comparaison des soldes

Peu de changements, mais l’intention métier reste perdue et chaque synchronisation doit parcourir les joueurs.

### Persister dans chaque moteur

Les écritures sont explicites, mais chaque jeu devient dépendant de la base et répète la gestion des transactions, des erreurs et de la publication.

### Publier des événements sans port commun

Les moteurs restent découplés de la base, mais chaque événement financier doit recréer ses propres règles de validation et de mutation du solde.
