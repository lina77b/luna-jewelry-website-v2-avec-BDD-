SELECT p.id_produit, p.nom, c.nom AS categorie, p.prix, p.stock
FROM produit AS p
JOIN categorie AS c ON c.id_categorie = p.id_categorie
WHERE p.actif
ORDER BY c.nom, p.nom;

SELECT c.nom AS categorie, count(*) AS nb_produits, round(avg(p.prix), 2) AS prix_moyen
FROM categorie AS c
JOIN produit AS p ON p.id_categorie = c.id_categorie
GROUP BY c.nom
ORDER BY prix_moyen DESC;

SELECT c.nom AS categorie, round(avg(p.prix), 2) AS prix_moyen
FROM categorie AS c
JOIN produit AS p ON p.id_categorie = c.id_categorie
GROUP BY c.nom
HAVING avg(p.prix) > 2500;

SELECT id_produit, nom, prix
FROM produit
WHERE prix > (SELECT avg(prix) FROM produit)
ORDER BY prix DESC, id_produit;

SELECT p.id_produit, p.nom, p.stock
FROM produit AS p
LEFT JOIN ligne_commande AS l ON l.id_produit = p.id_produit
WHERE l.id_produit IS NULL
ORDER BY p.id_produit;

SELECT t.id_commande, t.date_commande::date AS jour, cl.prenom || ' ' || cl.nom AS client,
       t.wilaya, t.statut, t.total
FROM v_total_commande AS t
JOIN client AS cl ON cl.id_client = t.id_client
ORDER BY t.date_commande DESC
LIMIT 10;

SELECT date_trunc('month', date_commande)::date AS mois, count(*) AS nb_commandes, sum(total) AS chiffre_affaires
FROM v_total_commande
WHERE statut <> 'annulee'
GROUP BY 1
ORDER BY 1;

SELECT wilaya, count(*) AS nb_commandes, sum(total) AS chiffre_affaires
FROM v_total_commande
WHERE statut <> 'annulee'
GROUP BY wilaya
ORDER BY chiffre_affaires DESC, wilaya;

SELECT cl.id_client, cl.prenom, cl.nom, count(*) AS nb_commandes
FROM client AS cl
JOIN commande AS c ON c.id_client = cl.id_client
GROUP BY cl.id_client, cl.prenom, cl.nom
HAVING count(*) > 1
ORDER BY nb_commandes DESC, cl.id_client;

SELECT mode_paiement, count(*) AS nb_commandes, round(avg(total), 2) AS panier_moyen
FROM v_total_commande
WHERE statut <> 'annulee'
GROUP BY mode_paiement
ORDER BY panier_moyen DESC;

SELECT categorie, rang, nom, quantite_vendue
FROM (
    SELECT cat.nom AS categorie, p.nom, SUM(l.quantite) AS quantite_vendue,
           ROW_NUMBER() OVER (PARTITION BY cat.id_categorie ORDER BY SUM(l.quantite) DESC, p.id_produit) AS rang
    FROM ligne_commande AS l
    JOIN commande AS c ON c.id_commande = l.id_commande AND c.statut <> 'annulee'
    JOIN produit AS p ON p.id_produit = l.id_produit
    JOIN categorie AS cat ON cat.id_categorie = p.id_categorie
    GROUP BY cat.id_categorie, cat.nom, p.id_produit, p.nom
) AS classement
WHERE rang <= 3
ORDER BY categorie, rang;

SELECT mois, ca_mensuel,
       SUM(ca_mensuel) OVER (ORDER BY mois) AS ca_cumule,
       ca_mensuel - LAG(ca_mensuel) OVER (ORDER BY mois) AS variation
FROM (
    SELECT date_trunc('month', date_commande)::date AS mois, sum(total) AS ca_mensuel
    FROM v_total_commande
    WHERE statut <> 'annulee'
    GROUP BY 1
) AS par_mois
ORDER BY mois;

SELECT RANK() OVER (ORDER BY SUM(t.total) DESC) AS rang,
       cl.prenom || ' ' || cl.nom AS client,
       SUM(t.total) AS depense_totale,
       round(100 * SUM(t.total) / SUM(SUM(t.total)) OVER (), 1) AS part_pct
FROM v_total_commande AS t
JOIN client AS cl ON cl.id_client = t.id_client
WHERE t.statut <> 'annulee'
GROUP BY cl.id_client, cl.prenom, cl.nom
ORDER BY rang;

WITH depenses AS (
    SELECT id_client, SUM(total) AS depense
    FROM v_total_commande
    WHERE statut <> 'annulee'
    GROUP BY id_client
)
SELECT cl.prenom, cl.nom, d.depense
FROM depenses AS d
JOIN client AS cl ON cl.id_client = d.id_client
WHERE d.depense > (SELECT avg(depense) FROM depenses)
ORDER BY d.depense DESC;
