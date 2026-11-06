# Banc de validation des PR PrettyBlocks V3

Le laboratoire teste une proposition **fusionnée avec le main courant**, dans un
checkout temporaire. Il construit un ZIP installable puis utilise uniquement ce
ZIP sur deux boutiques indépendantes : PrestaShop 8.2.7 / PHP 8.1 et PrestaShop
9.1.4 / PHP 8.5. La V4 reste hors périmètre.

## En local

Prérequis : Node.js 20.19+ (branche 20) ou 22.12+, Git, GitHub CLI (`gh auth login`), Docker Desktop lancé
avec Compose 2.24.4+ (support de `!override`), curl et unzip. Aucun abonnement IA,
clé API ou service d’hébergement n’est nécessaire.

```bash
# Inventaire des PR ouvertes et règles de revue connues
node scripts/pr-lab.mjs list

# Construire et tester une PR, puis supprimer ses boutiques
node scripts/pr-lab.mjs test 350

# Garder les boutiques pour examiner l’éditeur dans le BO
node scripts/pr-lab.mjs test 350 --keep \
  --output work/pr-lab/review-350 \
  --ps82-port 8682 --ps91-port 8691

# Arrêter seulement cette stack ; les rapports restent sur disque
node scripts/pr-lab.mjs down work/pr-lab/review-350
```

Les ports par défaut sont 8182 et 8191 ; choisir d’autres ports si une autre
stack les utilise. Chaque lancement a son propre projet Compose, ses réseaux et
ses bases. Les ports HTTP sont liés à `127.0.0.1`. Le checkout utilisateur et sa
branche restent intacts. En cas d’échec, les boutiques sont nettoyées, y compris
avec `--keep`.

Les boutiques conservées sont accessibles sur `/admin-dev/` :
`demo@prestashop.com` / `prestashop_demo`. Elles sont réservées à la validation
locale, avec des données de démonstration.

Le dossier de résultat contient :

- `report.md` et `result.json` : verdict technique, limites, head/base/merge exacts,
  version du harness, checksum du paquet et liens BO si conservés ;
- `pr.json`, `files.txt`, `changes.patch` : métadonnées et différences réellement
  introduites dans le main courant ;
- le ZIP construit, `build.log`, `test.log` et `logs/` : diagnostic exploitable
  après le nettoyage des conteneurs ;
- `conflicts.txt` si la PR ne peut pas être fusionnée.

Les répertoires de sortie sont uniques : un lancement ne remplace pas un rapport
existant. `--repository owner/name` permet d’expliciter le dépôt ; sinon `gh`
résout le remote courant, y compris le transfert de PrestaSafe vers
PercolatingStudio. Aucun push, review APPROVE ou merge n’est effectué.

## Automatisation GitHub

Le workflow **PR validation**, check **PR validation (PS8 + PS9)**, s’exécute sur
les nouvelles PR non draft vers `main` et leurs mises à jour. Les tests sont
annulés lorsqu’un lancement plus récent concerne la même PR. Chaque exécution
publie un résumé et un artefact de diagnostic, même en cas d’échec.

Pour reprendre une ancienne PR sans modifier sa branche : ouvrir **Actions → PR
validation → Run workflow** sur `main`, puis renseigner `pr_number`. Ce workflow
doit d’abord être intégré à `main`. Pour la première PR qui installe le
laboratoire, le harness n’existe pas encore dans sa base : un résumé explicite
signale ce bootstrap ; ce résultat ne constitue pas un test de cette première
PR. Celle-ci doit être validée localement.

Le runner refuse un changement de head ou de base pendant la préparation.
Après un nouveau commit sur la PR, le test est relancé automatiquement. Si
`main` a avancé depuis l’événement initial, mettre à jour la branche de PR pour
déclencher un nouveau check, ou lancer un test manuel par numéro pour obtenir
un rapport courant. Le check d’un lancement manuel appartient au workflow
dispatché, pas directement au head de la PR ; il ne remplace pas le check PR
requis par une protection de branche. Un rapport ancien décrit seulement les
SHAs qu’il affiche.

Le workflow utilise le harness de la branche de confiance (base de la PR), pas
les scripts proposés par le contributeur. Les modifications d’infrastructure
sont signalées et demandent donc une revue distincte. Le code du module,
Composer et Vite tournent dans Docker ; les jetons GitHub et fichiers de commande
Actions ne sont pas transmis aux subprocessus de build/test. Le workflow utilise
des permissions en lecture et ne repose pas sur `pull_request_target`. Les PR de
fork peuvent nécessiter l’autorisation de lancement habituelle de GitHub.
Ces choix suivent les [recommandations de sécurité GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use).

Le workflow de release conserve la responsabilité des pushes sur `main` et de
la publication des nouvelles versions. Si la version du module existe déjà,
les assets publiés restent inchangés ; une nouvelle release exige un bump de
version explicite. Le laboratoire ne crée aucune release.

## Valider une contribution

Un check vert confirme : merge possible, compilation, dépendances, racine
`prettyblocks/`, manifeste Vite et JS/CSS, installation/activation sur les deux
versions, syntaxe PHP, routes, front/iframe et page de connexion BO accessible.
Il ne confirme pas automatiquement la correction fonctionnelle demandée.

Le builder vérifie aussi les contraintes de l'éditeur riche et les transitions
de sélection, ainsi que l'adaptateur du calendrier (jour local, valeur vide,
Paris/New York). Les deux installations exécutent les tests PHP de métadonnées
des fichiers, de sérialisation des dates, du contrat du hook LiteSpeed et du
compilateur SCSS. Le test du hook ne remplace pas un essai sur un serveur
LiteSpeed Enterprise réel.

Pour la recette interactive du calendrier, le module de fixture
`tests/fixtures/prettyblocksqatest` peut être copié/installé **uniquement dans une
boutique de test**. Il fournit le bloc « QA date field » sans modifier les
fichiers PrettyBlocks installés. Vérifier sélection, effacement et
sauvegarde/rechargement d'une date. Les fixtures restent hors du ZIP.

Avant d’approuver une PR, vérifier dans les boutiques conservées :

1. Ouvrir PrettyBlocks dans le BO : aucun `manifest.json not exist`, chargement de
   l’éditeur et de l’iframe, aucune erreur bloquante de console/réseau.
2. Reproduire le problème de la PR, puis tester la correction sur PS8 et PS9.
3. Ajouter, déplacer, dupliquer, éditer, enregistrer et recharger un bloc. Vérifier
   les identifiants d’instance, les images et le rendu front.
4. Pour une modification PHP/SQL/installation, tester aussi une mise à jour d’une
   copie de boutique existante. Les boutiques neuves ne prouvent pas les migrations.
5. Pour une dépendance majeure, lire les changements incompatibles et tester les
   composants concernés : une compilation réussie ne suffit pas.
6. Relire `changes.patch`, puis approuver le **head testé** dans GitHub et merger
   seulement après les checks requis. Si le head a changé, retester et relire.

Les PR #255, #311 et #335 demandent une revue spécifique avant toute fusion ;
#346 et #211 restent hors périmètre/obsolètes. Le runner rappelle ces décisions.
Les contributions #328 et #342 ont déjà été intégrées avec leur attribution :
si un merge ne produit aucun changement, examiner le rapport avant d’agir sur
la PR d’origine.

## Protection de main

La protection de `main` exige déjà le statut **dependency-policy**, y compris
pour les administrateurs. Les mises à jour isolées de dépendances viennent du
Dependabot officiel, sauf exception mainteneur documentée dans CONTRIBUTING.md.
Pour rendre aussi les tests PrestaShop obligatoires après le bootstrap du lab,
ajouter le check **PR validation (PS8 + PS9)** et une approbation humaine, avec
branche à jour avant merge, en conservant la règle de dépendances existante.
L’auto-merge reste désactivé.

Le banc ne couvre pas encore les thèmes tiers, toutes les interactions de
l’éditeur, le multiboutique, les tests de charge ou l’upgrade automatique. Le
rapport rend ces limites visibles pour éviter de confondre smoke test et revue.
