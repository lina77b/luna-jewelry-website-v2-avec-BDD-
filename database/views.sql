CREATE OR REPLACE VIEW v_total_commande WITH (security_invoker = true) AS
SELECT c.id_commande,
       c.date_commande,
       c.statut,
       c.mode_paiement,
       c.nom_livraison,
       c.adresse_livraison,
       c.telephone_livraison,
       c.code_wilaya,
       w.nom AS wilaya,
       c.id_client,
       COALESCE(SUM(l.quantite * l.prix_unitaire), 0)::NUMERIC(10,2) AS sous_total,
       c.frais_livraison,
       (COALESCE(SUM(l.quantite * l.prix_unitaire), 0) + c.frais_livraison)::NUMERIC(10,2) AS total
FROM commande AS c
JOIN wilaya AS w ON w.code_wilaya = c.code_wilaya
LEFT JOIN ligne_commande AS l ON l.id_commande = c.id_commande
GROUP BY c.id_commande, w.nom;

CREATE OR REPLACE VIEW v_meilleures_ventes AS
SELECT p.id_produit,
       p.nom,
       cat.nom AS categorie,
       SUM(l.quantite) AS quantite_vendue,
       SUM(l.quantite * l.prix_unitaire)::NUMERIC(12,2) AS chiffre_affaires
FROM ligne_commande AS l
JOIN commande AS c ON c.id_commande = l.id_commande AND c.statut <> 'annulee'
JOIN produit AS p ON p.id_produit = l.id_produit
JOIN categorie AS cat ON cat.id_categorie = p.id_categorie
GROUP BY p.id_produit, p.nom, cat.nom
ORDER BY quantite_vendue DESC, p.id_produit;

CREATE OR REPLACE VIEW v_stock_faible AS
SELECT p.id_produit, p.nom, cat.nom AS categorie, p.stock
FROM produit AS p
JOIN categorie AS cat ON cat.id_categorie = p.id_categorie
WHERE p.stock < 5 AND p.actif
ORDER BY p.stock, p.id_produit;

CREATE OR REPLACE VIEW v_note_produit AS
SELECT p.id_produit,
       count(a.note) AS nb_avis,
       round(avg(a.note), 1) AS note_moyenne
FROM produit AS p
LEFT JOIN avis AS a ON a.id_produit = p.id_produit
GROUP BY p.id_produit;

DROP MATERIALIZED VIEW IF EXISTS mv_ca_mensuel;

CREATE MATERIALIZED VIEW mv_ca_mensuel AS
SELECT date_trunc('month', date_commande)::date AS mois,
       count(*) AS nb_commandes,
       sum(total)::NUMERIC(14,2) AS chiffre_affaires
FROM v_total_commande
WHERE statut <> 'annulee'
GROUP BY 1
ORDER BY 1;
