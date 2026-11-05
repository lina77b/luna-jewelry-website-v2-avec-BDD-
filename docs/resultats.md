# Résultats bruts

Environnement : PostgreSQL 16.15 installé directement sous Ubuntu avec apt, hors Docker, port 5433, base luna, utilisateur luna, `shared_preload_libraries = pg_stat_statements`. Les mesures ont été prises après `npm run db:reset`, `npm run db:demo` et `npm run db:bench`. Les durées dépendent de la machine : elles servent à comparer des plans entre eux, pas à donner des valeurs absolues.

Chaque requête EXPLAIN a été exécutée une première fois ; le plan affiché est celui de la deuxième exécution, avec un cache chaud. Les index supprimés pour la comparaison ont été recréés avec les définitions de schema.sql.

## 1. EXPLAIN (ANALYZE, BUFFERS) avec et sans index

**effectifs après npm run db:bench**

```
 clients | commandes | lignes 
---------+-----------+--------
    5006 |     50025 | 200050
(1 row)
```

**Q1 commandes d'un client - SANS idx_commande_client**

```
EXPLAIN (ANALYZE, BUFFERS) SELECT id_commande, date_commande, statut FROM commande WHERE id_client = 15 ORDER BY date_commande DESC;
                                                  QUERY PLAN                                                  
--------------------------------------------------------------------------------------------------------------
 Sort  (cost=1367.48..1367.50 rows=10 width=20) (actual time=3.846..3.847 rows=10 loops=1)
   Sort Key: date_commande DESC
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=745
   ->  Seq Scan on commande  (cost=0.00..1367.31 rows=10 width=20) (actual time=0.058..3.771 rows=10 loops=1)
         Filter: (id_client = 15)
         Rows Removed by Filter: 50015
         Buffers: shared hit=742
 Planning:
   Buffers: shared hit=100
 Planning Time: 0.214 ms
 Execution Time: 3.880 ms
(12 rows)
```

**Q1 commandes d'un client - AVEC idx_commande_client**

```
EXPLAIN (ANALYZE, BUFFERS) SELECT id_commande, date_commande, statut FROM commande WHERE id_client = 15 ORDER BY date_commande DESC;
                                                             QUERY PLAN                                                             
------------------------------------------------------------------------------------------------------------------------------------
 Sort  (cost=41.18..41.20 rows=10 width=20) (actual time=0.078..0.079 rows=10 loops=1)
   Sort Key: date_commande DESC
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=15
   ->  Bitmap Heap Scan on commande  (cost=4.37..41.01 rows=10 width=20) (actual time=0.017..0.061 rows=10 loops=1)
         Recheck Cond: (id_client = 15)
         Heap Blocks: exact=10
         Buffers: shared hit=12
         ->  Bitmap Index Scan on idx_commande_client  (cost=0.00..4.37 rows=10 width=0) (actual time=0.011..0.011 rows=10 loops=1)
               Index Cond: (id_client = 15)
               Buffers: shared hit=2
 Planning:
   Buffers: shared hit=115
 Planning Time: 0.236 ms
 Execution Time: 0.115 ms
(15 rows)
```

**Q2 chiffre d'affaires d'un mois - SANS idx_commande_date**

```
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) AS nb_commandes, sum(total) AS chiffre_affaires FROM v_total_commande WHERE statut <> 'annulee' AND date_commande >= '2026-03-01' AND date_commande < '2026-04-01';
                                                                                                            QUERY PLAN                                                                                                            
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=5795.15..5795.16 rows=1 width=40) (actual time=36.002..36.004 rows=1 loops=1)
   Buffers: shared hit=2018
   ->  HashAggregate  (cost=5566.42..5689.58 rows=7038 width=1134) (actual time=35.395..35.887 rows=1726 loops=1)
         Group Key: c.id_commande, w.nom
         Batches: 1  Memory Usage: 977kB
         Buffers: shared hit=2018
         ->  Hash Join  (cost=1659.11..5478.44 rows=7038 width=156) (actual time=3.822..32.546 rows=6898 loops=1)
               Hash Cond: (c.code_wilaya = w.code_wilaya)
               Buffers: shared hit=2018
               ->  Hash Right Join  (cost=1639.44..5440.11 rows=7038 width=22) (actual time=3.780..31.610 rows=6898 loops=1)
                     Hash Cond: (l.id_commande = c.id_commande)
                     Buffers: shared hit=2017
                     ->  Seq Scan on ligne_commande l  (cost=0.00..3275.50 rows=200050 width=13) (actual time=0.004..12.527 rows=200050 loops=1)
                           Buffers: shared hit=1275
                     ->  Hash  (cost=1617.44..1617.44 rows=1760 width=13) (actual time=3.760..3.760 rows=1726 loops=1)
                           Buckets: 2048  Batches: 1  Memory Usage: 97kB
                           Buffers: shared hit=742
                           ->  Seq Scan on commande c  (cost=0.00..1617.44 rows=1760 width=13) (actual time=0.008..3.553 rows=1726 loops=1)
                                 Filter: (((statut)::text <> 'annulee'::text) AND (date_commande >= '2026-03-01 00:00:00+00'::timestamp with time zone) AND (date_commande < '2026-04-01 00:00:00+00'::timestamp with time zone))
                                 Rows Removed by Filter: 48299
                                 Buffers: shared hit=742
               ->  Hash  (cost=14.30..14.30 rows=430 width=142) (actual time=0.035..0.035 rows=58 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 11kB
                     Buffers: shared hit=1
                     ->  Seq Scan on wilaya w  (cost=0.00..14.30 rows=430 width=142) (actual time=0.007..0.021 rows=58 loops=1)
                           Buffers: shared hit=1
 Planning:
   Buffers: shared hit=288
 Planning Time: 0.648 ms
 Execution Time: 36.218 ms
(30 rows)
```

**Q2 chiffre d'affaires d'un mois - AVEC idx_commande_date**

```
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) AS nb_commandes, sum(total) AS chiffre_affaires FROM v_total_commande WHERE statut <> 'annulee' AND date_commande >= '2026-03-01' AND date_commande < '2026-04-01';
                                                                                             QUERY PLAN                                                                                             
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Aggregate  (cost=5000.93..5000.94 rows=1 width=40) (actual time=33.258..33.262 rows=1 loops=1)
   Buffers: shared hit=1990
   ->  HashAggregate  (cost=4772.19..4895.36 rows=7038 width=1134) (actual time=32.642..33.149 rows=1726 loops=1)
         Group Key: c.id_commande, w.nom
         Batches: 1  Memory Usage: 977kB
         Buffers: shared hit=1990
         ->  Hash Join  (cost=864.89..4684.22 rows=7038 width=156) (actual time=1.428..29.938 rows=6898 loops=1)
               Hash Cond: (c.code_wilaya = w.code_wilaya)
               Buffers: shared hit=1990
               ->  Hash Right Join  (cost=845.22..4645.89 rows=7038 width=22) (actual time=1.395..29.018 rows=6898 loops=1)
                     Hash Cond: (l.id_commande = c.id_commande)
                     Buffers: shared hit=1989
                     ->  Seq Scan on ligne_commande l  (cost=0.00..3275.50 rows=200050 width=13) (actual time=0.004..12.406 rows=200050 loops=1)
                           Buffers: shared hit=1275
                     ->  Hash  (cost=823.22..823.22 rows=1760 width=13) (actual time=1.377..1.378 rows=1726 loops=1)
                           Buckets: 2048  Batches: 1  Memory Usage: 97kB
                           Buffers: shared hit=714
                           ->  Bitmap Heap Scan on commande c  (cost=45.27..823.22 rows=1760 width=13) (actual time=0.260..1.188 rows=1726 loops=1)
                                 Recheck Cond: ((date_commande >= '2026-03-01 00:00:00+00'::timestamp with time zone) AND (date_commande < '2026-04-01 00:00:00+00'::timestamp with time zone))
                                 Filter: ((statut)::text <> 'annulee'::text)
                                 Rows Removed by Filter: 298
                                 Heap Blocks: exact=706
                                 Buffers: shared hit=714
                                 ->  Bitmap Index Scan on idx_commande_date  (cost=0.00..44.83 rows=2054 width=0) (actual time=0.183..0.183 rows=2024 loops=1)
                                       Index Cond: ((date_commande >= '2026-03-01 00:00:00+00'::timestamp with time zone) AND (date_commande < '2026-04-01 00:00:00+00'::timestamp with time zone))
                                       Buffers: shared hit=8
               ->  Hash  (cost=14.30..14.30 rows=430 width=142) (actual time=0.025..0.026 rows=58 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 11kB
                     Buffers: shared hit=1
                     ->  Seq Scan on wilaya w  (cost=0.00..14.30 rows=430 width=142) (actual time=0.009..0.013 rows=58 loops=1)
                           Buffers: shared hit=1
 Planning:
   Buffers: shared hit=317
 Planning Time: 0.670 ms
 Execution Time: 33.478 ms
(35 rows)
```

## 2. Vue matérialisée mv_ca_mensuel contre la requête directe

**chiffre d'affaires mensuel - requête directe sur v_total_commande**

```
EXPLAIN (ANALYZE, BUFFERS) SELECT date_trunc('month', date_commande)::date AS mois, count(*) AS nb_commandes, sum(total) AS chiffre_affaires FROM v_total_commande WHERE statut <> 'annulee' GROUP BY 1 ORDER BY 1;
                                                                                        QUERY PLAN                                                                                        
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Sort  (cost=30344.29..30344.79 rows=200 width=44) (actual time=192.048..192.051 rows=25 loops=1)
   Sort Key: ((date_trunc('month'::text, v_total_commande.date_commande))::date)
   Sort Method: quicksort  Memory: 26kB
   Buffers: shared hit=201739
   ->  HashAggregate  (cost=30333.15..30336.65 rows=200 width=44) (actual time=192.029..192.035 rows=25 loops=1)
         Group Key: (date_trunc('month'::text, v_total_commande.date_commande))::date
         Batches: 1  Memory Usage: 48kB
         Buffers: shared hit=201736
         ->  Subquery Scan on v_total_commande  (cost=1.53..29047.79 rows=171381 width=20) (actual time=0.091..187.603 rows=42830 loops=1)
               Buffers: shared hit=201736
               ->  GroupAggregate  (cost=1.53..26477.07 rows=171381 width=1134) (actual time=0.086..179.487 rows=42830 loops=1)
                     Group Key: c.id_commande, w.nom
                     Buffers: shared hit=201736
                     ->  Incremental Sort  (cost=1.53..21335.64 rows=171381 width=164) (actual time=0.065..131.898 rows=171276 loops=1)
                           Sort Key: c.id_commande, w.nom
                           Presorted Key: c.id_commande
                           Full-sort Groups: 5353  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
                           Buffers: shared hit=201736
                           ->  Merge Left Join  (cost=1.10..16622.76 rows=171381 width=164) (actual time=0.024..104.675 rows=171276 loops=1)
                                 Merge Cond: (c.id_commande = l.id_commande)
                                 Buffers: shared hit=201733
                                 ->  Nested Loop  (cost=0.45..3256.43 rows=42856 width=155) (actual time=0.016..21.328 rows=42830 loops=1)
                                       Buffers: shared hit=996
                                       ->  Index Scan using commande_pkey on commande c  (cost=0.29..2176.73 rows=42856 width=21) (actual time=0.004..9.917 rows=42830 loops=1)
                                             Filter: ((statut)::text <> 'annulee'::text)
                                             Rows Removed by Filter: 7195
                                             Buffers: shared hit=880
                                       ->  Memoize  (cost=0.16..0.18 rows=1 width=142) (actual time=0.000..0.000 rows=1 loops=42830)
                                             Cache Key: c.code_wilaya
                                             Cache Mode: logical
                                             Hits: 42772  Misses: 58  Evictions: 0  Overflows: 0  Memory Usage: 7kB
                                             Buffers: shared hit=116
                                             ->  Index Scan using wilaya_pkey on wilaya w  (cost=0.15..0.17 rows=1 width=142) (actual time=0.001..0.001 rows=1 loops=58)
                                                   Index Cond: (code_wilaya = c.code_wilaya)
                                                   Buffers: shared hit=116
                                 ->  Index Scan using ligne_commande_pkey on ligne_commande l  (cost=0.42..11057.17 rows=200050 width=13) (actual time=0.006..60.929 rows=200050 loops=1)
                                       Buffers: shared hit=200737
 Planning:
   Buffers: shared hit=318
 Planning Time: 0.651 ms
 Execution Time: 192.154 ms
(41 rows)
```

**chiffre d'affaires mensuel - SELECT sur la vue matérialisée mv_ca_mensuel**

```
EXPLAIN (ANALYZE, BUFFERS) SELECT mois, nb_commandes, chiffre_affaires FROM mv_ca_mensuel ORDER BY mois;
                                                    QUERY PLAN                                                     
-------------------------------------------------------------------------------------------------------------------
 Sort  (cost=97.16..100.66 rows=1400 width=30) (actual time=0.065..0.066 rows=25 loops=1)
   Sort Key: mois
   Sort Method: quicksort  Memory: 26kB
   Buffers: shared hit=4
   ->  Seq Scan on mv_ca_mensuel  (cost=0.00..24.00 rows=1400 width=30) (actual time=0.006..0.007 rows=25 loops=1)
         Buffers: shared hit=1
 Planning:
   Buffers: shared hit=44
 Planning Time: 0.097 ms
 Execution Time: 0.083 ms
(10 rows)
```

**REFRESH MATERIALIZED VIEW mv_ca_mensuel (3 exécutions)**

```
\timing on
Timing is on.
REFRESH MATERIALIZED VIEW mv_ca_mensuel;
REFRESH MATERIALIZED VIEW
Time: 156.385 ms
REFRESH MATERIALIZED VIEW mv_ca_mensuel;
REFRESH MATERIALIZED VIEW
Time: 149.252 ms
REFRESH MATERIALIZED VIEW mv_ca_mensuel;
REFRESH MATERIALIZED VIEW
Time: 146.864 ms
```

## 3. Pagination (OFFSET contre curseur) et recherche plein texte

**pagination - LIMIT 20 OFFSET 40000**

```
EXPLAIN (ANALYZE, BUFFERS) SELECT id_commande, date_commande, statut FROM commande ORDER BY date_commande DESC, id_commande DESC LIMIT 20 OFFSET 40000;
                                                                         QUERY PLAN                                                                          
-------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=5217.65..5220.26 rows=20 width=20) (actual time=16.155..16.157 rows=20 loops=1)
   Buffers: shared hit=40195
   ->  Incremental Sort  (cost=0.39..6525.22 rows=50025 width=20) (actual time=0.092..15.031 rows=40020 loops=1)
         Sort Key: date_commande DESC, id_commande DESC
         Presorted Key: date_commande
         Full-sort Groups: 1251  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
         Buffers: shared hit=40195
         ->  Index Scan Backward using idx_commande_date on commande  (cost=0.29..4274.10 rows=50025 width=20) (actual time=0.008..9.827 rows=40021 loops=1)
               Buffers: shared hit=40185
 Planning:
   Buffers: shared hit=107
 Planning Time: 0.197 ms
 Execution Time: 16.179 ms
(13 rows)
```

**pagination - curseur (comparaison de lignes sur date_commande, id_commande) LIMIT 20**

```
EXPLAIN (ANALYZE, BUFFERS) SELECT id_commande, date_commande, statut FROM commande WHERE (date_commande, id_commande) < ('2025-02-24 10:05:34.116135+00'::timestamptz, 13212) ORDER BY date_commande DESC, id_commande DESC LIMIT 20;
                                                                        QUERY PLAN                                                                        
----------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=0.63..8.08 rows=20 width=20) (actual time=0.065..0.067 rows=20 loops=1)
   Buffers: shared hit=33
   ->  Incremental Sort  (cost=0.63..3765.75 rows=10106 width=20) (actual time=0.064..0.065 rows=20 loops=1)
         Sort Key: date_commande DESC, id_commande DESC
         Presorted Key: date_commande
         Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 26kB  Peak Memory: 26kB
         Buffers: shared hit=33
         ->  Index Scan Backward using idx_commande_date on commande  (cost=0.29..3310.98 rows=10106 width=20) (actual time=0.014..0.047 rows=21 loops=1)
               Index Cond: (date_commande <= '2025-02-24 10:05:34.116135+00'::timestamp with time zone)
               Filter: (ROW(date_commande, id_commande) < ROW('2025-02-24 10:05:34.116135+00'::timestamp with time zone, 13212))
               Rows Removed by Filter: 1
               Buffers: shared hit=24
 Planning:
   Buffers: shared hit=115
 Planning Time: 0.242 ms
 Execution Time: 0.097 ms
(16 rows)
```

**recherche plein texte - choix du planificateur sur 32 produits**

```
EXPLAIN (ANALYZE, BUFFERS) SELECT id_produit, nom FROM produit WHERE recherche @@ to_tsquery('french', 'bagu:*') ORDER BY ts_rank(recherche, to_tsquery('french', 'bagu:*')) DESC;
                                                QUERY PLAN                                                
----------------------------------------------------------------------------------------------------------
 Sort  (cost=11.52..11.52 rows=2 width=326) (actual time=0.036..0.036 rows=8 loops=1)
   Sort Key: (ts_rank(recherche, '''bagu'':*'::tsquery)) DESC
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=6
   ->  Seq Scan on produit  (cost=0.00..11.51 rows=2 width=326) (actual time=0.006..0.016 rows=8 loops=1)
         Filter: (recherche @@ '''bagu'':*'::tsquery)
         Rows Removed by Filter: 24
         Buffers: shared hit=3
 Planning:
   Buffers: shared hit=162
 Planning Time: 0.737 ms
 Execution Time: 0.051 ms
(12 rows)
```

**recherche plein texte - même requête avec enable_seqscan = off (idx_produit_recherche est utilisable)**

```
SET enable_seqscan = off;
SET
EXPLAIN (ANALYZE, BUFFERS) SELECT id_produit, nom FROM produit WHERE recherche @@ to_tsquery('french', 'bagu:*') ORDER BY ts_rank(recherche, to_tsquery('french', 'bagu:*')) DESC;
                                                              QUERY PLAN                                                              
--------------------------------------------------------------------------------------------------------------------------------------
 Sort  (cost=26.55..26.55 rows=2 width=326) (actual time=0.049..0.049 rows=8 loops=1)
   Sort Key: (ts_rank(recherche, '''bagu'':*'::tsquery)) DESC
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=9
   ->  Bitmap Heap Scan on produit  (cost=21.19..26.54 rows=2 width=326) (actual time=0.023..0.030 rows=8 loops=1)
         Recheck Cond: (recherche @@ '''bagu'':*'::tsquery)
         Heap Blocks: exact=3
         Buffers: shared hit=6
         ->  Bitmap Index Scan on idx_produit_recherche  (cost=0.00..21.19 rows=2 width=0) (actual time=0.018..0.019 rows=13 loops=1)
               Index Cond: (recherche @@ '''bagu'':*'::tsquery)
               Buffers: shared hit=3
 Planning:
   Buffers: shared hit=162
 Planning Time: 0.740 ms
 Execution Time: 0.072 ms
(15 rows)
```

## 4. pg_stat_statements et usage des index après une charge de travail

**$ npm run db:stats  (après pg_stat_statements_reset(), queries.sql et des appels d'API : statistiques admin, liste des commandes, recherche de produits)**

```
> luna-jewelry@1.0.0 db:stats
> node scripts/setup-db.js --stats


CREATE EXTENSION IF NOT EXISTS pg_stat_statements

SELECT round(total_exec_time::numeric, 1) AS total_ms,
┌─────────┬──────────┬───────┬──────────┬────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ (index) │ total_ms │ calls │ mean_ms  │ rows   │ requete                                                                                                │
├─────────┼──────────┼───────┼──────────┼────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 0       │ '556.1'  │ '3'   │ '185.37' │ '24'   │ 'SELECT wilaya, count(*)::int AS nb_commandes, sum(total)::float8 AS chiffre_affaires FROM v_total_co' │
│ 1       │ '352.6'  │ '3'   │ '117.52' │ '24'   │ 'SELECT nom, quantite_vendue::int AS quantite_vendue, chiffre_affaires::float8 AS chiffre_affaires FR' │
│ 2       │ '204.5'  │ '1'   │ '204.46' │ '10'   │ 'SELECT t.id_commande, t.date_commande::date AS jour, cl.prenom || $1 || cl.nom AS client, t.wilaya, ' │
│ 3       │ '195.0'  │ '1'   │ '195.03' │ '5004' │ 'SELECT RANK() OVER (ORDER BY SUM(t.total) DESC) AS rang, cl.prenom || $1 || cl.nom AS client, SUM(t.' │
│ 4       │ '181.0'  │ '1'   │ '181.05' │ '2368' │ 'WITH depenses AS ( SELECT id_client, SUM(total) AS depense FROM v_total_commande WHERE statut <> $1 ' │
│ 5       │ '171.7'  │ '1'   │ '171.67' │ '25'   │ 'SELECT date_trunc($1, date_commande)::date AS mois, count(*) AS nb_commandes, sum(total) AS chiffre_' │
│ 6       │ '169.2'  │ '1'   │ '169.23' │ '3'    │ 'SELECT mode_paiement, count(*) AS nb_commandes, round(avg(total), $1) AS panier_moyen FROM v_total_c' │
│ 7       │ '165.6'  │ '1'   │ '165.64' │ '25'   │ 'SELECT mois, ca_mensuel, SUM(ca_mensuel) OVER (ORDER BY mois) AS ca_cumule, ca_mensuel - LAG(ca_mens' │
│ 8       │ '163.9'  │ '1'   │ '163.88' │ '58'   │ 'SELECT wilaya, count(*) AS nb_commandes, sum(total) AS chiffre_affaires FROM v_total_commande WHERE ' │
│ 9       │ '64.5'   │ '1'   │ '64.46'  │ '11'   │ 'SELECT categorie, rang, nom, quantite_vendue FROM ( SELECT cat.nom AS categorie, p.nom, SUM(l.quanti' │
└─────────┴──────────┴───────┴──────────┴────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────┘

SELECT relname AS table_name,
┌─────────┬────────────────────┬─────────────────────────┬──────────┬───────────┐
│ (index) │ table_name         │ index_name              │ idx_scan │ taille    │
├─────────┼────────────────────┼─────────────────────────┼──────────┼───────────┤
│ 0       │ 'commande'         │ 'commande_pkey'         │ '200329' │ '1112 kB' │
│ 1       │ 'produit'          │ 'produit_pkey'          │ '200114' │ '16 kB'   │
│ 2       │ 'wilaya'           │ 'wilaya_pkey'           │ '51137'  │ '16 kB'   │
│ 3       │ 'client'           │ 'client_pkey'           │ '50253'  │ '128 kB'  │
│ 4       │ 'ligne_commande'   │ 'ligne_commande_pkey'   │ '179'    │ '5912 kB' │
│ 5       │ 'categorie'        │ 'categorie_pkey'        │ '173'    │ '16 kB'   │
│ 6       │ 'journal_commande' │ 'idx_journal_commande'  │ '25'     │ '16 kB'   │
│ 7       │ 'session'          │ 'session_pkey'          │ '15'     │ '16 kB'   │
│ 8       │ 'avis'             │ 'avis_pkey'             │ '13'     │ '16 kB'   │
│ 9       │ 'commande'         │ 'idx_commande_client'   │ '11'     │ '472 kB'  │
│ 10      │ 'commande'         │ 'idx_commande_date'     │ '10'     │ '1112 kB' │
│ 11      │ 'categorie'        │ 'categorie_slug_key'    │ '10'     │ '16 kB'   │
│ 12      │ 'client'           │ 'uq_client_email'       │ '7'      │ '352 kB'  │
│ 13      │ 'produit'          │ 'idx_produit_recherche' │ '2'      │ '24 kB'   │
│ 14      │ 'journal_commande' │ 'journal_commande_pkey' │ '0'      │ '16 kB'   │
│ 15      │ 'avis'             │ 'idx_avis_produit'      │ '0'      │ '16 kB'   │
│ 16      │ 'session'          │ 'idx_session_expire'    │ '0'      │ '16 kB'   │
│ 17      │ 'produit'          │ 'idx_produit_categorie' │ '0'      │ '16 kB'   │
└─────────┴────────────────────┴─────────────────────────┴──────────┴───────────┘

SELECT relname AS table_name, seq_scan, idx_scan, n_live_tup
┌─────────┬────────────────────┬──────────┬──────────┬────────────┐
│ (index) │ table_name         │ seq_scan │ idx_scan │ n_live_tup │
├─────────┼────────────────────┼──────────┼──────────┼────────────┤
│ 0       │ 'produit'          │ '168'    │ '200116' │ '32'       │
│ 1       │ 'categorie'        │ '49'     │ '183'    │ '4'        │
│ 2       │ 'avis'             │ '32'     │ '13'     │ '13'       │
│ 3       │ 'journal_commande' │ '27'     │ '25'     │ '54'       │
│ 4       │ 'commande'         │ '24'     │ '200350' │ '50025'    │
│ 5       │ 'ligne_commande'   │ '15'     │ '179'    │ '200050'   │
│ 6       │ 'client'           │ '14'     │ '50260'  │ '5006'     │
│ 7       │ 'wilaya'           │ '7'      │ '51137'  │ '58'       │
│ 8       │ 'mv_ca_mensuel'    │ '6'      │ null     │ '25'       │
│ 9       │ 'session'          │ '2'      │ '15'     │ '1'        │
└─────────┴────────────────────┴──────────┴──────────┴────────────┘
```

## 5. pg_dump et restauration dans une base vierge

```
$ pg_dump -h localhost -p 5433 -U luna -d luna -Fc -f /tmp/ev/luna.dump
2092061 bytes  luna.dump

$ dropdb --if-exists luna_restore && createdb luna_restore
$ pg_restore -h localhost -p 5433 -U luna -d luna_restore --no-owner /tmp/ev/luna.dump
pg_restore exit code 0

-- row counts in database luna (before)
    table_name    | count  
------------------+--------
 journal_commande |     54
 wilaya           |     58
 produit          |     32
 avis             |     13
 categorie        |      4
 session          |      1
 client           |   5006
 commande         |  50025
 ligne_commande   | 200050
(9 rows)

-- row counts in database luna_restore (after restore)
    table_name    | count  
------------------+--------
 session          |      1
 categorie        |      4
 avis             |     13
 produit          |     32
 journal_commande |     54
 wilaya           |     58
 client           |   5006
 commande         |  50025
 ligne_commande   | 200050
(9 rows)

-- objects present in luna_restore
 index | triggers | vues | vues_materialisees | politiques_rls | fonctions_luna 
-------+----------+------+--------------------+----------------+----------------
    18 |        4 |    6 |                  1 |              3 |              7
(1 row)
```

## 6. Sécurité par ligne et utilisateur applicatif restreint

```
$ node scripts/setup-db.js --roles
$ psql "postgres://luna:...@localhost:5433/luna" -f rls.sql   (SET LOCAL ROLE luna_app inside a transaction)
BEGIN;
BEGIN
SET LOCAL ROLE luna_app;
SET
SELECT current_user;
 current_user 
--------------
 luna_app
(1 row)

SELECT count(*) AS commandes_visibles_sans_contexte FROM commande;
 commandes_visibles_sans_contexte 
----------------------------------
                                0
(1 row)

SELECT set_config('app.id_client', '15', true), set_config('app.role', 'client', true);
 set_config | set_config 
------------+------------
 15         | client
(1 row)

SELECT count(*) AS commandes_visibles, count(DISTINCT id_client) AS clients_distincts FROM commande;
 commandes_visibles | clients_distincts 
--------------------+-------------------
                 10 |                 1
(1 row)

SELECT count(*) AS lignes_visibles FROM ligne_commande;
 lignes_visibles 
-----------------
              40
(1 row)

SELECT set_config('app.role', 'admin', true);
 set_config 
------------
 admin
(1 row)

SELECT count(*) AS commandes_visibles_en_admin, count(DISTINCT id_client) AS clients_distincts FROM commande;
 commandes_visibles_en_admin | clients_distincts 
-----------------------------+-------------------
                       50025 |              5005
(1 row)

ROLLBACK;
ROLLBACK

$ psql "postgres://luna_app:luna_app_password@localhost:5433/luna" -f deny.sql
SELECT current_user;
 current_user 
--------------
 luna_app
(1 row)

UPDATE produit SET prix = 1 WHERE id_produit = 1;
psql:deny.sql:2: ERROR:  permission denied for table produit
```

## 7. npm test

```
$ npm test
> node --test tests/api.test.js
ok 1 - catalogue : 4 categories, 58 wilayas, 8 bagues
ok 2 - commande sans connexion : 401
ok 3 - me sans session renvoie null
ok 4 - inscription invalide : mot de passe faible, telephone, sexe
ok 5 - inscription, me, deconnexion, connexion
ok 6 - e-mail deja utilise : 409
ok 7 - commande valide : prix serveur, total, stock decremente
ok 8 - stock insuffisant : 409 et stock inchange
ok 9 - commande invalide : 400
ok 10 - mes commandes
ok 11 - recherche plein texte, tri, filtres et pagination
ok 12 - avis : connexion requise, produit commande, note valide, mise a jour
ok 13 - annulation par le client : stock remis, double annulation 409, commande d un autre 404
ok 14 - administration : refusee a un client, autorisee a un administrateur
# tests 14
# pass 14
# fail 0
> node --test tests/fonctions.test.js
ok 1 - succes : lignes fusionnees, prix lu dans produit, stock decremente, total par la vue
ok 2 - stock insuffisant sur la seconde ligne : tout est annule
ok 3 - produit inactif, produit inconnu, panier vide, wilaya inconnue : refuses
ok 4 - declencheur : lignes modifiables en attente, gelees ensuite
ok 5 - contraintes : stock negatif, telephone invalide, produit vendu non supprimable
ok 6 - machine a etats : seules les transitions autorisees passent, le journal les enregistre
ok 7 - annuler_commande : stock remis, journal, refus apres expedition, controle du proprietaire
ok 8 - avis : note entre 1 et 5, une seule note par client et produit, vue des moyennes
# tests 8
# pass 8
# fail 0
> node --test tests/concurrence.test.js
ok 1 - deux connexions, une seule unite : un seul succes, stock a 0
ok 2 - la seconde transaction attend le verrou puis echoue apres le COMMIT de la premiere
# tests 2
# pass 2
# fail 0
> node --test tests/rls.test.js
ok 1 - sans contexte, le role restreint ne voit aucune commande
ok 2 - un client ne voit que ses propres commandes, lignes et totaux
ok 3 - un client ne peut pas changer un statut, un administrateur le peut
ok 4 - un administrateur voit toutes les commandes
ok 5 - le role restreint ne peut pas lire les mots de passe hachés
ok 6 - le role restreint ne peut pas fixer le role à l'inscription
ok 7 - get_identifiants renvoie le hash d'un seul compte, sans tenir compte de la casse
# tests 7
# pass 7
# fail 0
> node --test tests/limites.test.js
ok 1 - la onzième tentative de connexion échouée est refusée avec le code 429
ok 2 - les en-têtes de sécurité sont présents
# tests 2
# pass 2
# fail 0
```
