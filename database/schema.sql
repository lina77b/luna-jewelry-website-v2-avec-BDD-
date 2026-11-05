CREATE TABLE categorie (
    id_categorie SERIAL PRIMARY KEY,
    nom          VARCHAR(60) NOT NULL,
    slug         VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE produit (
    id_produit   SERIAL PRIMARY KEY,
    nom          VARCHAR(150) NOT NULL,
    description  TEXT,
    prix         NUMERIC(10,2) NOT NULL CHECK (prix >= 0),
    stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    image        VARCHAR(100) NOT NULL,
    actif        BOOLEAN NOT NULL DEFAULT TRUE,
    id_categorie INTEGER NOT NULL REFERENCES categorie (id_categorie) ON DELETE RESTRICT,
    recherche    TSVECTOR GENERATED ALWAYS AS (
                     to_tsvector('french', nom || ' ' || coalesce(description, ''))
                 ) STORED
);

CREATE TABLE wilaya (
    code_wilaya     INTEGER PRIMARY KEY CHECK (code_wilaya BETWEEN 1 AND 58),
    nom             VARCHAR(60) NOT NULL,
    frais_livraison NUMERIC(10,2) NOT NULL CHECK (frais_livraison >= 0)
);

CREATE TABLE client (
    id_client         SERIAL PRIMARY KEY,
    nom               VARCHAR(60) NOT NULL,
    prenom            VARCHAR(60) NOT NULL,
    email             VARCHAR(254) NOT NULL,
    telephone         VARCHAR(10) NOT NULL CHECK (telephone ~ '^[0-9]{10}$'),
    sexe              CHAR(1) NOT NULL CHECK (sexe IN ('F', 'M')),
    date_naissance    DATE NOT NULL CHECK (date_naissance <= CURRENT_DATE),
    mot_de_passe_hash VARCHAR(100) NOT NULL,
    date_inscription  TIMESTAMPTZ NOT NULL DEFAULT now(),
    role              VARCHAR(10) NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin'))
);

CREATE UNIQUE INDEX uq_client_email ON client (lower(email));

CREATE TABLE commande (
    id_commande         SERIAL PRIMARY KEY,
    date_commande       TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              VARCHAR(20) NOT NULL DEFAULT 'en_attente'
                        CHECK (statut IN ('en_attente', 'confirmee', 'expediee', 'livree', 'annulee')),
    mode_paiement       VARCHAR(20) NOT NULL
                        CHECK (mode_paiement IN ('credit', 'baridimob', 'cash')),
    nom_livraison       VARCHAR(120) NOT NULL,
    adresse_livraison   VARCHAR(255) NOT NULL,
    telephone_livraison VARCHAR(10) NOT NULL CHECK (telephone_livraison ~ '^[0-9]{10}$'),
    frais_livraison     NUMERIC(10,2) NOT NULL CHECK (frais_livraison >= 0),
    id_client           INTEGER NOT NULL REFERENCES client (id_client) ON DELETE RESTRICT,
    code_wilaya         INTEGER NOT NULL REFERENCES wilaya (code_wilaya) ON DELETE RESTRICT
);

CREATE TABLE ligne_commande (
    id_commande   INTEGER NOT NULL REFERENCES commande (id_commande) ON DELETE CASCADE,
    id_produit    INTEGER NOT NULL REFERENCES produit (id_produit) ON DELETE RESTRICT,
    quantite      INTEGER NOT NULL CHECK (quantite > 0),
    prix_unitaire NUMERIC(10,2) NOT NULL CHECK (prix_unitaire >= 0),
    PRIMARY KEY (id_commande, id_produit)
);

CREATE INDEX idx_commande_client ON commande (id_client);
CREATE INDEX idx_commande_date ON commande (date_commande);
CREATE INDEX idx_produit_categorie ON produit (id_categorie);
CREATE INDEX idx_produit_recherche ON produit USING GIN (recherche);

CREATE TABLE journal_commande (
    id_journal       SERIAL PRIMARY KEY,
    id_commande      INTEGER NOT NULL REFERENCES commande (id_commande) ON DELETE CASCADE,
    ancien_statut    VARCHAR(20) NOT NULL,
    nouveau_statut   VARCHAR(20) NOT NULL,
    date_changement  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_journal_commande ON journal_commande (id_commande);

CREATE TABLE avis (
    id_client   INTEGER NOT NULL REFERENCES client (id_client) ON DELETE RESTRICT,
    id_produit  INTEGER NOT NULL REFERENCES produit (id_produit) ON DELETE RESTRICT,
    note        INTEGER NOT NULL CHECK (note BETWEEN 1 AND 5),
    commentaire VARCHAR(500),
    date_avis   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id_client, id_produit)
);

CREATE INDEX idx_avis_produit ON avis (id_produit);

CREATE TABLE session (
    sid    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
    sess   JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX idx_session_expire ON session (expire);
