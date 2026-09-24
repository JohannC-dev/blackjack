# ADR 0003 — Skins : catalogue et visuels en base, équipement par type

- Statut : accepté
- Date : 2026-09-24

## Contexte

Les joueurs doivent pouvoir personnaliser quatre éléments : le dos des cartes, leur icône de profil (jamais une image envoyée par le joueur, uniquement des skins obtenus en jeu), le poulet du Chicken et le diamant de la Mine. Ils consultent leur collection, voient ce qui leur manque et équipent un skin par type.

Une boutique viendra plus tard, avec des achats en crédits et en argent réel. Aujourd’hui, on ne gère que la possession : un skin s’obtient par le parrainage ou par un octroi manuel.

Le parrainage débloquait déjà deux objets décrits dans le code (`src/lib/cosmetics.ts`), dont la possession était enregistrée dans `player_cosmetic`.

## Décision

- **Le catalogue vit en base** (`cosmetic`) : type, nom, description, rareté (`common`, `rare`, `epic`, `legendary`), statut, indice de déblocage, ordre d’affichage et prix. Les prix (`price_credits`, et `price_cents` avec `price_currency`) sont nullables et ne servent pas encore : `NULL` veut dire « pas en vente ».
- **Les visuels vivent aussi en base** (`cosmetic_asset`, en `bytea`), dans une table séparée pour qu’aucune lecture du catalogue ne charge les octets. Ils sont servis par `GET /api/cosmetics/:id/asset?v=<hash>` avec un cache immuable. Le hash change avec le fichier, ce qui contourne le cache. On ajoute ou remplace un skin sans redéployer.
- **Les types sont connus du code** (`card-back`, `profile-icon`, `chicken`, `mine-gem`), parce que chacun a son rendu. La base les contraint par un `check`. Ajouter un type demande un déploiement, ajouter un skin non.
- **Le statut** règle l’accès :
  - `draft` n’est visible par personne et ne peut être ni octroyé à la main ni équipé ;
  - `active` est visible par tous dans la collection, possédé ou verrouillé avec son indice ;
  - `retired` n’est plus visible que par ses propriétaires, qui peuvent toujours l’équiper.
- **L’équipement** (`player_equipped_cosmetic`) compte au plus une ligne par joueur et par type. Une clé étrangère composite vers `player_cosmetic` empêche d’équiper un skin non possédé, et une autre vers `cosmetic (id, kind)` empêche de le mettre dans le mauvais type. Aucune ligne signifie **Classique**.
- **Le Classique reste le rendu du code** (initiale sur dégradé, dos violet, poulet et diamant d’origine). Il sert aussi de repli quand un skin n’a pas de visuel ou que son image ne charge pas. Les icônes de rail et les posters restent toujours classiques ; un skin ne s’applique que dans la partie.
- **Qui voit quoi** : un objet qui appartient à un joueur porte son skin, visible par tous. Un objet partagé (croupier, sabot, board) porte le skin de celui qui regarde. Si le propriétaire n’a rien équipé, on lui applique aussi le skin de celui qui regarde.
- **Le skin d’une table est figé pour la manche** : le client relit l’équipement des joueurs présents au début de chaque manche. Un changement en cours de main s’applique à la suivante.
- **L’équipement des autres joueurs** est servi par `GET /api/cosmetics/equipped?users=…`, par lots, et mis en cache côté client. Les données des amis, du profil et des tables n’embarquent pas l’équipement.
- **L’alimentation** passe par deux scripts : `scripts/cosmetics-import.ts` (manifeste + fichiers, upsert idempotent, format et taille vérifiés) et `scripts/cosmetics-grant.ts` (octroi manuel).

## Conséquences

- L’achat n’est pas implémenté. Le jour venu, il s’agira d’une opération de portefeuille (`game: "cosmetics"`) qui octroie le skin dans la même transaction, avec la source `purchase`.
- Les visuels entrent dans les sauvegardes de la base. Les assets sont limités à 256 Ko ; une carte ou une icône pèse quelques dizaines de Ko.
- Un SVG peut contenir du script : on ne l’affiche jamais inline, uniquement en `<img>`. La route qui le sert impose une `Content-Security-Policy` fermée.
- Les objets du parrainage gardent leurs identifiants, donc les possessions existantes restent valables. Ils restent `active` sans visuel, affichés « Bientôt » et non équipables, jusqu’à ce qu’on importe leur image.
- En dehors des tables, un joueur qui change de skin reste vu avec l’ancien par les autres jusqu’à ce que leur cache ait plus d’une minute et que son avatar soit de nouveau affiché. Lui voit son choix tout de suite.
- Une cinquième rareté, `exclusive` (« Exclusif »), marque ce qui ne se vend jamais et ne s’obtient que par un événement (parrainage, lancement). Elle dit comment on obtient l’objet ; les quatre autres disent ce qu’il vaut.
- Le catalogue de référence (manifeste et SVG) est versionné dans `cosmetics/catalogue/` : l’importer remet n’importe quelle base à niveau.
- Deux scripts `package.json` alimentent le catalogue : `bun run cosmetics:import <dossier>` et `bun run cosmetics:grant <joueur> <skin>`.

## Alternatives examinées

### Catalogue dans le code

C’est typé de bout en bout, mais chaque nouveau skin ou changement de prix demande un déploiement. On ne pourrait pas non plus préparer la boutique depuis la base.

### Visuels dans un stockage externe (S3…)

On ajoute aussi des skins sans déployer, mais il faut monter et sécuriser un stockage et un envoi de fichiers. Si le volume l’exige un jour, il suffira de faire pointer la route d’asset vers un CDN.

### Skins par défaut en base

Plus homogène, mais tout le monde aurait la même icône par défaut, et chaque jeu dépendrait d’une ligne qui doit exister.

### Équipement joint aux données de table

Le serveur aurait figé l’équipement dans l’état de chaque jeu, mais il aurait fallu toucher les six moteurs. La lecture par lots, relancée à chaque manche, donne le même résultat à l’écran.
