CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO client (nom, prenom, email, telephone, sexe, date_naissance, mot_de_passe_hash, date_inscription, role)
VALUES
    ('Benali',  'Amina',  'amina.benali@example.com',  '0550000001', 'F', '1998-03-14', crypt('Demo@2025', gen_salt('bf', 10)), '2025-12-20 10:00+00', 'client'),
    ('Khelifi', 'Yacine', 'yacine.khelifi@example.com', '0550000002', 'M', '1995-07-02', crypt('Demo@2025', gen_salt('bf', 10)), '2025-12-28 15:30+00', 'client'),
    ('Mansouri','Lina',   'lina.mansouri@example.com',  '0550000003', 'F', '2001-11-23', crypt('Demo@2025', gen_salt('bf', 10)), '2026-01-05 09:15+00', 'client'),
    ('Haddad',  'Sofiane','sofiane.haddad@example.com', '0550000004', 'M', '1990-01-30', crypt('Demo@2025', gen_salt('bf', 10)), '2026-01-18 18:45+00', 'client'),
    ('Bouzid',  'Meriem', 'meriem.bouzid@example.com',  '0550000005', 'F', '1999-09-09', crypt('Demo@2025', gen_salt('bf', 10)), '2026-02-02 12:00+00', 'client'),
    ('Admin',   'Luna',   'admin@example.com',          '0550000000', 'F', '1990-01-01', crypt('Demo@2025', gen_salt('bf', 10)), '2025-12-01 08:00+00', 'admin')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    v_clients  INTEGER[];
    v_id       INTEGER;
    v_items    JSONB;
    v_nb       INTEGER;
    v_modes    TEXT[] := ARRAY['cash', 'baridimob', 'credit'];
    v_wilayas  INTEGER[] := ARRAY[16, 31, 25, 9, 19, 23, 6, 15, 5, 13];
    v_statuts  TEXT[] := ARRAY['livree', 'livree', 'livree', 'expediee', 'confirmee', 'livree', 'annulee', 'livree'];
    i          INTEGER;
    c          INTEGER;
    v_cible    TEXT;
BEGIN
    SELECT array_agg(id_client ORDER BY id_client) INTO v_clients
    FROM client
    WHERE email IN ('amina.benali@example.com', 'yacine.khelifi@example.com', 'lina.mansouri@example.com',
                    'sofiane.haddad@example.com', 'meriem.bouzid@example.com');

    IF EXISTS (SELECT 1 FROM commande WHERE id_client = ANY (v_clients)) THEN
        RAISE NOTICE 'Demo orders already loaded, nothing done.';
        RETURN;
    END IF;

    FOR i IN 1..25 LOOP
        c := v_clients[1 + ((i * 3 + i / 4) % 5)];
        v_nb := 1 + (i % 3);
        SELECT jsonb_agg(jsonb_build_object('id_produit', 1 + ((i * 7 + k * 5) % 28), 'quantite', 1 + ((i + k) % 2)))
        INTO v_items
        FROM generate_series(1, v_nb) AS k;

        v_id := passer_commande(c,
                                (SELECT prenom || ' ' || nom FROM client WHERE id_client = c),
                                'Rue ' || i || ', quartier des Jasmins',
                                (SELECT telephone FROM client WHERE id_client = c),
                                v_wilayas[1 + (i % 10)],
                                v_modes[1 + (i % 3)],
                                v_items);

        UPDATE commande
        SET date_commande = (DATE '2026-09-25' - (i * 10) * INTERVAL '1 day') + INTERVAL '11 hours' + (i * 7) * INTERVAL '1 minute'
        WHERE id_commande = v_id;

        v_cible := CASE WHEN i >= 24 THEN 'en_attente' ELSE v_statuts[1 + (i % 8)] END;
        IF v_cible = 'annulee' THEN
            PERFORM annuler_commande(v_id);
        END IF;
        IF v_cible IN ('confirmee', 'expediee', 'livree') THEN
            UPDATE commande SET statut = 'confirmee' WHERE id_commande = v_id;
        END IF;
        IF v_cible IN ('expediee', 'livree') THEN
            UPDATE commande SET statut = 'expediee' WHERE id_commande = v_id;
        END IF;
        IF v_cible = 'livree' THEN
            UPDATE commande SET statut = 'livree' WHERE id_commande = v_id;
        END IF;

        UPDATE journal_commande AS j
        SET date_changement = o.date_commande + r.rang * INTERVAL '1 day'
        FROM commande AS o,
             (SELECT id_journal, row_number() OVER (ORDER BY id_journal) AS rang
              FROM journal_commande WHERE id_commande = v_id) AS r
        WHERE j.id_journal = r.id_journal AND o.id_commande = v_id;
    END LOOP;
END;
$$;

INSERT INTO avis (id_client, id_produit, note, commentaire)
SELECT c.id_client, l.id_produit, 3 + (l.id_produit % 3), 'Très beau bijou, conforme à la description.'
FROM commande AS o
JOIN client AS c ON c.id_client = o.id_client
JOIN ligne_commande AS l ON l.id_commande = o.id_commande
WHERE o.statut = 'livree' AND c.email LIKE '%@example.com' AND l.id_produit % 2 = 0
ON CONFLICT DO NOTHING;

REFRESH MATERIALIZED VIEW mv_ca_mensuel;
