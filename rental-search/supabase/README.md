# Recherche locative Montparnasse — exploitation du collecteur (2026-11-23)

Ce dossier suit **uniquement** la recherche résidentielle Montparnasse et le projet Supabase `hemanobijzarxvnktccn`. Ne pas mélanger avec les données immobilières commerciales SMBG.

## Architecture déployée

- Site : `rental-search/index.html` sur GitHub Pages.
- API privée `rental-search` sur Supabase : renvoie les logements **hors statut `removed`**, y compris quand la vue utilisateur sélectionne l'historique. Son secret d'accès reste dans Supabase, jamais dans ce dépôt.
- `rental-monitor` : consultation protégée par JWT public **et** par la clé d'accès personnelle vérifiée côté serveur ; présente les nouvelles pistes non confirmées et l'état réel des collectes, avec les indicateurs de fiches contrôlées et de retraits.
- `rental-source-collector` : découverte prudente de candidats non confirmés. Version 10 : exploration ciblée, budgets de pages par source (18 / 9 / 4), exclusion des pages de catalogue PAP, contrôle du périmètre si les données d'adresse existent. N'affirme jamais un catalogue exhaustivement exploré sans preuve.
- `rental-listing-monitor` : ouvre périodiquement les URL originales des logements publiés, conserve les observations et retire automatiquement du site seulement les offres suffisamment démontrées disparues.

## Planification

Les 8 collecteurs historiques `rental-collector-batch-0` à `7` et la reprise `rental-collector-retry-missing` sont conservés. Quatre tâches supplémentaires `rental-listing-monitor-batch-0` à `3` passent à 9h05, 9h06, 9h07 et 9h08 (même séquence à 13h, 16h et 19h), heure de Paris. Chaque tâche ne s'exécute que lorsque l'heure locale correspond. Les tâches sont configurées dans `cron.job` et non dans GitHub Actions.

Les tâches techniques réussies ne prouvent ni l'exhaustivité des catalogues ni la disponibilité des appartements. Vérifier `cron.job_run_details`, `rental_source_checks` et `rental_listing_verification_events` après chaque passage.

## Règles de retrait

Le retrait du site est un **archivage logique** : `rental_listings.available_status='removed'`, `retired_at`, `retirement_reason`, sans suppression physique. L'API de consultation écarte toujours les annonces `removed`. Cela préserve les pièces de contrôle, les favoris, les visites, les rejets et évite les réintroductions accidentelles.

Cas autorisés :
1. Une fiche individuelle réellement ouverte répond en HTML et déclare explicitement que cette offre a expiré ou a été retirée.
2. L'URL originale répond en **HTTP 404 ou 410** lors de **deux contrôles séparés d'au moins trois heures**, dans une période de 14 jours, tandis que la page d'accueil du fournisseur demeure accessible (HTTP 200 à 399) ; aucun contrôle positif intermédiaire.

Un HTTP 403, 429, 5xx, un timeout, une redirection vers la page d'accueil, une page catalogue ou l'inaccessibilité par un seul outil **ne suffisent jamais** pour archiver. Les exceptions et pages génériques restent incertaines.

Les preuves réelles sont enregistrées dans `rental_listing_verification_events`; un contrôle réellement abouti est inscrit dans `rental_listing_checks`. La fonction SQL `rental_record_listing_verification` décide du retrait dans une transaction. Les preuves inventées ou les vérifications non effectuées sont interdites.

## Publication des nouveaux candidats

La table `rental_candidate_reviews` et `rental_publish_reviewed_candidate(url)` bloquent une mise en ligne sans vérification récente de l'original, type **vide**, surface habitable **>= 37 m²**, loyer **CC <= 1 800 €**, disponibilité, adresse numérotée à Paris, coordonnées exactes, conformité au **polygone d'origine + 500 m** et preuve explicite. Les rejets utilisateur ne peuvent pas être réintroduits. Les candidats incertains ne reçoivent aucun pin inventé. Le catalogue de sources est conservé, avec mise en veille réversible des sources non productives.

## Contrôles effectués lors du déploiement

- API privée de consultation : HTTP 200 ; 55 annonces visibles, aucune des 10 anciennes annonces déjà retirées.
- Vérification d'accès `rental-monitor` : clé erronée rejetée en HTTP 403, clé valide autorisée en HTTP 200.
- Autotest du collecteur v10 : 5/5.
- Autotest du vérificateur d'annonces v2 : réussi.
- Test transactionnel avec rollback : premier HTTP 410 sans retrait, second HTTP 410 simulé à plus de trois heures avec site principal accessible entraîne l'archivage en transaction ; aucune fausse donnée conservée.
- Site HTML/JS analysé et déployé ; seuls les liens d'annonces originaux sont utilisés, sans réimport automatique de photos.

IMPORTANT : ces tests **ne sont pas** une première ronde complète de contrôle des 55 URL originales. La réussite de la première ronde programmée doit être constatée sur les journaux avant de déclarer la surveillance pleinement opérationnelle.

## Sécurité et déploiement

Ne jamais ajouter d'identifiants de service, de tokens cron, de secrets d'accès personnel ni de clés `service_role` dans le dépôt, le navigateur ou les logs publics. L'API de consultation `rental-search` (avec sa configuration privée) n'est pas copiée dans ce dossier. Les autres fichiers de ce dossier sont des sources sans secrets. Les écritures restent limitées aux tables `public.rental_*`.
