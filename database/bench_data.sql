BEGIN;

ALTER TABLE commande DISABLE TRIGGER trg_commande_suppression;
DELETE FROM commande WHERE id_client IN (SELECT id_client FROM client WHERE email LIKE 'bench%@example.com');
DELETE FROM client WHERE email LIKE 'bench%@example.com';
ALTER TABLE commande ENABLE TRIGGER trg_commande_suppression;

INSERT INTO client (nom, prenom, email, telephone, sexe, date_naissance, mot_de_passe_hash, date_inscription)
SELECT 'Nom' || g,
       'Prenom' || g,
       'bench' || g || '@example.com',
       '06' || lpad(g::text, 8, '0'),
       CASE WHEN random() < 0.5 THEN 'F' ELSE 'M' END,
       DATE '1960-01-01' + floor(random() * 15000)::INTEGER,
       'bench-not-a-real-hash',
       now() - floor(random() * 900) * INTERVAL '1 day'
FROM generate_series(1, 5000) AS g;

INSERT INTO commande (date_commande, statut, mode_paiement, nom_livraison, adresse_livraison,
                      telephone_livraison, frais_livraison, id_client, code_wilaya)
SELECT s.date_commande,
       (ARRAY['en_attente', 'confirmee', 'expediee', 'livree', 'livree', 'livree', 'annulee'])[1 + floor(random() * 7)::INTEGER],
       (ARRAY['credit', 'baridimob', 'cash'])[1 + floor(random() * 3)::INTEGER],
       'Client bench',
       'Adresse bench ' || s.g,
       '06' || lpad(s.g::text, 8, '0'),
       w.frais_livraison,
       s.id_client,
       s.code_wilaya
FROM (
    SELECT g,
           now() - random() * 730 * INTERVAL '1 day' AS date_commande,
           b.lo + floor(random() * b.n)::INTEGER AS id_client,
           1 + floor(random() * 58)::INTEGER AS code_wilaya
    FROM generate_series(1, 50000) AS g
    CROSS JOIN (SELECT min(id_client) AS lo, count(*) AS n FROM client WHERE email LIKE 'bench%@example.com') AS b
) AS s
JOIN wilaya AS w ON w.code_wilaya = s.code_wilaya;

INSERT INTO ligne_commande (id_commande, id_produit, quantite, prix_unitaire)
SELECT c.id_commande, p.id_produit, 1 + floor(random() * 3)::INTEGER, p.prix
FROM commande AS c
JOIN client AS cl ON cl.id_client = c.id_client AND cl.email LIKE 'bench%@example.com'
CROSS JOIN LATERAL (
    SELECT id_produit, prix FROM produit ORDER BY random() LIMIT 1 + floor(random() * 4)::INTEGER
) AS p;

COMMIT;

ANALYZE client;
ANALYZE commande;
ANALYZE ligne_commande;
REFRESH MATERIALIZED VIEW mv_ca_mensuel;
