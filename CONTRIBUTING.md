# Contribuer à PrettyBlocks V3

Les corrections et fonctionnalités sont proposées dans des PR vers `main`.
Préserver l’attribution des auteurs, décrire le problème corrigé et vérifier la
compatibilité PrestaShop 8/9. La V4 est gérée dans un autre dépôt.

## Mises à jour des dépendances : une seule source

Les mises à jour courantes npm/Composer sont gérées par le **Dependabot officiel
de PercolatingStudio/prettyblocks**. Ne pas remonter les PR Dependabot d’un fork
sous forme d’un agrégat : cela duplique les propositions et peut réintroduire
des versions anciennes.

- Les mises à jour mineures et patch sont groupées mensuellement par écosystème.
- Les versions majeures restent dans des PR séparées et demandent une revue de
  compatibilité. Les alertes de sécurité conservent leur traitement spécifique.
- Avant de proposer une mise à jour manuelle, rechercher une PR Dependabot
  existante et signaler le besoin dans celle-ci.
- Une correction fonctionnelle peut modifier une dépendance si elle en explique
  la nécessité ; elle suit la revue habituelle.

Le statut **dependency-policy** signale en échec les PR limitées aux manifests
et lockfiles de dépendances qui ne viennent pas du Dependabot officiel. Des
changements de workflows accompagnant ces fichiers ne suffisent pas à rendre
un agrégat de mises à jour fonctionnel.

Les manifests modifiés uniquement pour leurs métadonnées (auteur, site, etc.)
ne sont pas assimilés à une mise à jour de dépendances. Les PR mixtes restent
soumis à une revue humaine : le contrôle ne prouve pas l’absence de doublons.

Pour une exception justifiée, un mainteneur peut ajouter le label
`dependencies:manual-approved`. Le contrôle est alors relancé. Retirer le label
supprime la dérogation. Réexaminer ou retirer ce label après un nouveau commit :
il reste techniquement attaché à la PR tant qu’il n’est pas retiré. Ce label est
une décision de maintenance, pas une approbation du
code ou des tests. Les droits GitHub du contributeur ne sont pas modifiés.

Le workflow **Dependency policy** analyse uniquement les fichiers et métadonnées
via l’API GitHub. Il n’exécute jamais le code ni les scripts du contributeur.
Il peut être lancé manuellement par numéro pour examiner une ancienne PR.
Aucune PR n’est fermée et aucun utilisateur n’est bloqué automatiquement.
