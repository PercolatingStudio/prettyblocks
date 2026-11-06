# Validation de PrettyBlocks 3.2.3

Date de validation : 6 novembre 2026.

Ce rapport décrit le candidat de release V3 construit depuis la branche
`codex/release-3.2.3`, source testée `07383f1cd399e6f1993e93c8afb11e5cf829982a`,
sur la base de `main` `ad2588a62f7a19122bf1aa04b8532f27d5418905`.
La V4 reste hors périmètre. Aucune release GitHub n'a été publiée pendant ces
contrôles.

## Lot retenu

| PR | Changement | Décision |
| --- | --- | --- |
| #358 | Banc de validation V3, publication 3.2.3 et identité Percolating Studio | Retenue, avec les durcissements ajoutés sur le candidat final |
| #351 | `vue-color-input` 2.0.0 | Retenue après validation de l'interface couleur |
| #365 | `uuid` 14.0.3 | Retenue après génération d'un UUID v4 valide dans l'éditeur |

Le paquet local testé est `dist/prettyblocks-3.2.3.zip`, avec une racine unique
`prettyblocks/`. Son SHA-256 local est
`6a096ef803aa83c88cc07c402ccd59943169cd1bfaa9e0d80d6b6a8f70d7d02e`.

## Contrôles automatisés finaux

- les 14 tests Node du laboratoire de PR passent ;
- les workflows passent `actionlint` ;
- la construction Composer/Vite, la structure du ZIP, le manifeste et les
  assets de production sont validés ;
- l'installation et l'activation natives du ZIP passent sur PrestaShop 8.2.7 /
  PHP 8.1 et PrestaShop 9.1.4 / PHP 8.5 ;
- les contrôles de syntaxe PHP, routes, front-office, iframe, connexion BO et
  compilation SCSS réelle passent sur les deux versions.

Les logs finaux sont conservés sous `work/release-323/logs/`. Ils confirment
l'installation de PrettyBlocks 3.2.3 sur les deux boutiques propres.

## Validation manuelle de l'éditeur

Sur PrestaShop 9.1, les parcours ciblés de texte riche avec liste non ordonnée,
couleur et upload d'image passent après sauvegarde et rechargement.

Sur PrestaShop 8.2 :

- gras, lien, liste `<ul>` et code HTML restent présents après sauvegarde,
  rechargement et rendu dans l'iframe front ;
- le sélecteur de couleur est téléporté dans `body`, mesure 280 px, utilise un
  `z-index` de 9999, se ferme au clic extérieur et conserve `#123456` ;
- la génération retourne un UUID v4 valide ;
- l'upload PNG répond HTTP 200 avec `uploaded: true` ;
- aucune erreur JavaScript n'est relevée ; 14 avertissements non bloquants sont
  visibles dans la console.

Le premier délai d'automatisation PS8 ne révélait pas un défaut du module : la
boutique était en anglais (`Add new element`) alors que le sélecteur cherchait
le libellé français. Le parcours a passé après correction du sélecteur.

## Inventaire des autres PR ouvertes

| PR | Décision et motif |
| --- | --- |
| #211 | Exclue : cible la branche V2, hors périmètre de cette release V3. |
| #255 | Exclue malgré les smoke tests verts : `str_contains` contredit le PHP `>=5.6` déclaré, `HTTP_HOST` sert de frontière fragile et les clés `size`/`width`/`height` disparaissent pour plusieurs URL. |
| #311 | Exclue malgré les smoke tests verts : chaque `initStates()` sélectionne le dernier bloc, perd une partie de `currentBlock` et peut conserver l'identifiant d'un bloc supprimé. |
| #328 | Non reprise : le correctif est déjà présent dans `main`, avec l'attribution de Jonathan Danse. |
| #342 | Non reprise : le correctif `instance_id` d'origine est déjà dans `main`, avec l'attribution de Benoit Charpentier ; les commits LiteSpeed ajoutés ensuite n'ont pas été qualifiés. |
| #346 | Exclue : conflits avec `main`, historique de dépendances obsolète et échec de la politique de dépendances. |
| #360 | Exclue : `php-dev-tools` 5 ne fournit pas l'outil `autoindex` attendu par la chaîne actuelle. |
| #361 | Exclue malgré un smoke test vert : la compilation SCSS réelle échoue sur PS8/PS9 avec les appels League URI `new()` / `toUnixPath()`. |
| #362 | Exclue : le lot introduisant Quill 2 perd les listes `<ul>` après sauvegarde. |
| #363 | Exclue : TinyMCE Cloud 8 n'est pas qualifié sans la clé nécessaire. |
| #364 | Exclue : Tailwind CSS 4 n'est pas compatible avec la configuration PostCSS actuelle. |

## Portée de la décision

Le candidat 3.2.3 est validé pour le lot retenu et les deux environnements de
référence. Cette validation ne couvre pas les thèmes tiers, le multiboutique,
une mise à jour de boutique existante ni LiteSpeed. Après intégration dans
`main`, il reste à vérifier que le workflow publie le tag et la release 3.2.3
avec l'archive construite et testée par ce même workflow et son checksum,
sans modifier un asset déjà publié. Le checksum de l'asset publié doit être
vérifié séparément de celui du build local.
