CREATE OR REPLACE FUNCTION passer_commande(
    p_id_client           INTEGER,
    p_nom_livraison       TEXT,
    p_adresse_livraison   TEXT,
    p_telephone_livraison TEXT,
    p_code_wilaya         INTEGER,
    p_mode_paiement       TEXT,
    p_items               JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id_commande INTEGER;
    v_frais       NUMERIC(10,2);
    v_attendus    INTEGER;
    v_verrouilles INTEGER := 0;
    v_ligne       RECORD;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Le panier est vide.' USING ERRCODE = 'LU400';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_items) AS e
        WHERE CASE WHEN jsonb_typeof(e) = 'object' AND e->>'id_produit' ~ '^[0-9]{1,9}$'
                   THEN (e->>'id_produit')::INTEGER ELSE 0 END < 1
           OR CASE WHEN jsonb_typeof(e) = 'object' AND e->>'quantite' ~ '^[0-9]{1,6}$'
                   THEN (e->>'quantite')::INTEGER ELSE 0 END < 1
    ) THEN
        RAISE EXCEPTION 'Le panier contient une ligne invalide.' USING ERRCODE = 'LU400';
    END IF;

    SELECT count(DISTINCT (e->>'id_produit')::INTEGER) INTO v_attendus
    FROM jsonb_array_elements(p_items) AS e;

    FOR v_ligne IN
        SELECT p.id_produit, p.nom, p.stock, p.actif, q.quantite
        FROM (
            SELECT (e->>'id_produit')::INTEGER AS id_produit,
                   SUM((e->>'quantite')::INTEGER)::INTEGER AS quantite
            FROM jsonb_array_elements(p_items) AS e
            GROUP BY 1
        ) AS q
        JOIN produit AS p ON p.id_produit = q.id_produit
        ORDER BY p.id_produit
        FOR UPDATE OF p
    LOOP
        v_verrouilles := v_verrouilles + 1;
        IF NOT v_ligne.actif THEN
            RAISE EXCEPTION 'Le produit « % » n''est plus disponible.', v_ligne.nom USING ERRCODE = 'LU400';
        END IF;
        IF v_ligne.stock < v_ligne.quantite THEN
            RAISE EXCEPTION 'Stock insuffisant pour « % » : % demandé(s), % disponible(s).',
                v_ligne.nom, v_ligne.quantite, v_ligne.stock USING ERRCODE = 'LU409';
        END IF;
    END LOOP;

    IF v_verrouilles <> v_attendus THEN
        RAISE EXCEPTION 'Le panier contient un produit inconnu.' USING ERRCODE = 'LU400';
    END IF;

    SELECT frais_livraison INTO v_frais FROM wilaya WHERE code_wilaya = p_code_wilaya;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wilaya inconnue.' USING ERRCODE = 'LU400';
    END IF;

    INSERT INTO commande (mode_paiement, nom_livraison, adresse_livraison, telephone_livraison,
                          frais_livraison, id_client, code_wilaya)
    VALUES (p_mode_paiement, p_nom_livraison, p_adresse_livraison, p_telephone_livraison,
            v_frais, p_id_client, p_code_wilaya)
    RETURNING id_commande INTO v_id_commande;

    FOR v_ligne IN
        SELECT p.id_produit, p.prix, q.quantite
        FROM (
            SELECT (e->>'id_produit')::INTEGER AS id_produit,
                   SUM((e->>'quantite')::INTEGER)::INTEGER AS quantite
            FROM jsonb_array_elements(p_items) AS e
            GROUP BY 1
        ) AS q
        JOIN produit AS p ON p.id_produit = q.id_produit
        ORDER BY p.id_produit
    LOOP
        INSERT INTO ligne_commande (id_commande, id_produit, quantite, prix_unitaire)
        VALUES (v_id_commande, v_ligne.id_produit, v_ligne.quantite, v_ligne.prix);

        UPDATE produit SET stock = stock - v_ligne.quantite WHERE id_produit = v_ligne.id_produit;
    END LOOP;

    RETURN v_id_commande;
END;
$$;

CREATE OR REPLACE FUNCTION refuser_modif_ligne() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_statut VARCHAR(20);
BEGIN
    SELECT statut INTO v_statut FROM commande WHERE id_commande = OLD.id_commande;
    IF FOUND AND v_statut <> 'en_attente' THEN
        RAISE EXCEPTION 'Les lignes de la commande % ne sont plus modifiables (statut : %).',
            OLD.id_commande, v_statut USING ERRCODE = 'LU403';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ligne_commande_gel
BEFORE UPDATE OR DELETE ON ligne_commande
FOR EACH ROW EXECUTE FUNCTION refuser_modif_ligne();

CREATE OR REPLACE FUNCTION refuser_suppression_commande() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.statut <> 'en_attente' THEN
        RAISE EXCEPTION 'La commande % ne peut pas être supprimée (statut : %).',
            OLD.id_commande, OLD.statut USING ERRCODE = 'LU403';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_commande_suppression
BEFORE DELETE ON commande
FOR EACH ROW EXECUTE FUNCTION refuser_suppression_commande();

CREATE OR REPLACE FUNCTION annuler_commande(p_id_commande INTEGER, p_id_client INTEGER DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_commande commande%ROWTYPE;
BEGIN
    SELECT * INTO v_commande FROM commande WHERE id_commande = p_id_commande FOR UPDATE;
    IF NOT FOUND OR (p_id_client IS NOT NULL AND v_commande.id_client <> p_id_client) THEN
        RAISE EXCEPTION 'Commande introuvable.' USING ERRCODE = 'LU404';
    END IF;

    IF v_commande.statut NOT IN ('en_attente', 'confirmee') THEN
        RAISE EXCEPTION 'La commande % ne peut plus être annulée (statut : %).',
            p_id_commande, v_commande.statut USING ERRCODE = 'LU409';
    END IF;

    PERFORM 1
    FROM produit
    WHERE id_produit IN (SELECT id_produit FROM ligne_commande WHERE id_commande = p_id_commande)
    ORDER BY id_produit
    FOR UPDATE;

    UPDATE produit AS p
    SET stock = p.stock + l.quantite
    FROM ligne_commande AS l
    WHERE l.id_commande = p_id_commande AND l.id_produit = p.id_produit;

    UPDATE commande SET statut = 'annulee' WHERE id_commande = p_id_commande;
END;
$$;

CREATE OR REPLACE FUNCTION verifier_transition_statut() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.statut = OLD.statut THEN
        RETURN NEW;
    END IF;
    IF (OLD.statut, NEW.statut) IN (
        ('en_attente', 'confirmee'),
        ('confirmee', 'expediee'),
        ('expediee', 'livree'),
        ('en_attente', 'annulee'),
        ('confirmee', 'annulee')
    ) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Changement de statut interdit : % vers %.', OLD.statut, NEW.statut USING ERRCODE = 'LU403';
END;
$$;

CREATE TRIGGER trg_commande_statut
BEFORE UPDATE OF statut ON commande
FOR EACH ROW EXECUTE FUNCTION verifier_transition_statut();

CREATE OR REPLACE FUNCTION journaliser_statut() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO journal_commande (id_commande, ancien_statut, nouveau_statut)
    VALUES (NEW.id_commande, OLD.statut, NEW.statut);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_commande_journal
AFTER UPDATE OF statut ON commande
FOR EACH ROW WHEN (OLD.statut IS DISTINCT FROM NEW.statut)
EXECUTE FUNCTION journaliser_statut();

CREATE OR REPLACE FUNCTION rafraichir_ca_mensuel() RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW mv_ca_mensuel;
END;
$$;

CREATE OR REPLACE FUNCTION get_identifiants(p_email TEXT)
RETURNS TABLE (id_client INTEGER, prenom VARCHAR, nom VARCHAR, role VARCHAR, mot_de_passe_hash VARCHAR)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT c.id_client, c.prenom, c.nom, c.role, c.mot_de_passe_hash
    FROM client AS c
    WHERE lower(c.email) = lower(p_email)
$$;
