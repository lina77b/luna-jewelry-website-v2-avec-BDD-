CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SELECT round(total_exec_time::numeric, 1) AS total_ms,
       calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       rows,
       left(regexp_replace(query, '\s+', ' ', 'g'), 100) AS requete
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND query NOT ILIKE '%pg_stat_%'
ORDER BY total_exec_time DESC
LIMIT 10;

SELECT relname AS table_name,
       indexrelname AS index_name,
       idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS taille
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

SELECT relname AS table_name, seq_scan, idx_scan, n_live_tup
FROM pg_stat_user_tables
ORDER BY seq_scan DESC;
