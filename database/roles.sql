DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luna_app') THEN
        CREATE ROLE luna_app LOGIN PASSWORD 'luna_app_password';
    END IF;
END;
$$;

DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO luna_app', current_database());
END;
$$;

GRANT USAGE ON SCHEMA public TO luna_app;

GRANT SELECT ON categorie, produit, wilaya, commande, ligne_commande TO luna_app;
GRANT SELECT ON v_total_commande, v_meilleures_ventes, v_stock_faible, v_note_produit, mv_ca_mensuel, journal_commande TO luna_app;
GRANT SELECT, INSERT, UPDATE ON avis TO luna_app;
GRANT UPDATE (statut) ON commande TO luna_app;

REVOKE ALL ON client FROM luna_app;
GRANT SELECT (id_client, nom, prenom, email, role) ON client TO luna_app;
GRANT INSERT (nom, prenom, email, telephone, sexe, date_naissance, mot_de_passe_hash) ON client TO luna_app;
GRANT USAGE ON SEQUENCE client_id_client_seq TO luna_app;

REVOKE ALL ON FUNCTION passer_commande(INTEGER, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION passer_commande(INTEGER, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB) TO luna_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON session TO luna_app;

REVOKE ALL ON FUNCTION get_identifiants(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_identifiants(TEXT) TO luna_app;

REVOKE ALL ON FUNCTION annuler_commande(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION annuler_commande(INTEGER, INTEGER) TO luna_app;
REVOKE ALL ON FUNCTION rafraichir_ca_mensuel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rafraichir_ca_mensuel() TO luna_app;

ALTER TABLE commande ENABLE ROW LEVEL SECURITY;
ALTER TABLE ligne_commande ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commande_lecture ON commande;
DROP POLICY IF EXISTS commande_maj_admin ON commande;
DROP POLICY IF EXISTS ligne_lecture ON ligne_commande;

CREATE POLICY commande_lecture ON commande FOR SELECT TO luna_app
USING (id_client = nullif(current_setting('app.id_client', true), '')::INTEGER
       OR current_setting('app.role', true) = 'admin');

CREATE POLICY commande_maj_admin ON commande FOR UPDATE TO luna_app
USING (current_setting('app.role', true) = 'admin')
WITH CHECK (current_setting('app.role', true) = 'admin');

CREATE POLICY ligne_lecture ON ligne_commande FOR SELECT TO luna_app
USING (EXISTS (SELECT 1 FROM commande AS c WHERE c.id_commande = ligne_commande.id_commande));
