(function () {
  const contenu = document.getElementById('admin-contenu');
  if (!contenu) return;

  const NEXT = {
    en_attente: ['confirmee', 'annulee'],
    confirmee: ['expediee', 'annulee'],
    expediee: ['livree'],
    livree: [],
    annulee: []
  };
  const OR = '#c9a227';
  const PALETTE = ['#c9a227', '#9a7b12', '#e0c46a', '#6b645a', '#e11d48'];
  const graphiques = {};
  let curseur = null;

  const $ = (id) => document.getElementById(id);

  function cellule(contenuCellule) {
    const td = document.createElement('td');
    td.append(contenuCellule);
    return td;
  }

  function afficherErreur(message) {
    const zone = $('admin-erreur');
    zone.textContent = message || '';
    zone.classList.toggle('active', Boolean(message));
  }

  function dessiner(id, type, libelles, valeurs, couleurs) {
    const canvas = $(id);
    if (!window.Chart) {
      const info = document.createElement('p');
      info.className = 'error active';
      info.textContent = 'Graphique indisponible : Chart.js n’a pas pu être chargé.';
      canvas.replaceWith(info);
      return;
    }
    if (graphiques[id]) graphiques[id].destroy();
    graphiques[id] = new window.Chart(canvas, {
      type,
      data: { labels: libelles, datasets: [{ data: valeurs, backgroundColor: couleurs || OR, borderColor: OR }] },
      options: {
        indexAxis: id === 'graph-ventes' ? 'y' : 'x',
        plugins: { legend: { display: type === 'doughnut' } },
        scales: type === 'doughnut' ? {} : { y: { beginAtZero: true } }
      }
    });
  }

  async function chargerStats() {
    const stats = await window.Luna.api('/api/admin/stats');
    dessiner('graph-mois', 'bar', stats.ca_mensuel.map((l) => l.mois), stats.ca_mensuel.map((l) => l.chiffre_affaires));
    dessiner('graph-ventes', 'bar', stats.meilleures_ventes.map((l) => l.nom), stats.meilleures_ventes.map((l) => l.quantite_vendue));
    dessiner('graph-wilaya', 'bar', stats.ca_wilaya.map((l) => l.wilaya), stats.ca_wilaya.map((l) => l.chiffre_affaires));
    dessiner('graph-statuts', 'doughnut', stats.statuts.map((l) => window.Luna.libelleStatut(l.statut)), stats.statuts.map((l) => l.nb), PALETTE);

    const corps = $('stock-faible');
    if (stats.stock_faible.length === 0) {
      const tr = document.createElement('tr');
      const td = cellule('Aucun produit en stock faible.');
      td.colSpan = 2;
      tr.append(td);
      corps.replaceChildren(tr);
      return;
    }
    corps.replaceChildren(
      ...stats.stock_faible.map((ligne) => {
        const tr = document.createElement('tr');
        tr.append(cellule(ligne.nom), cellule(String(ligne.stock)));
        return tr;
      })
    );
  }

  function ligneCommande(commande) {
    const suivants = NEXT[commande.statut];
    const actions = document.createElement('div');
    actions.className = 'actions-commande';
    if (suivants.length > 0) {
      const choix = document.createElement('select');
      choix.setAttribute('aria-label', 'Nouveau statut');
      suivants.forEach((statut) => {
        const option = document.createElement('option');
        option.value = statut;
        option.textContent = window.Luna.libelleStatut(statut);
        choix.append(option);
      });
      const appliquer = document.createElement('button');
      appliquer.type = 'button';
      appliquer.className = 'btn btn-petit';
      appliquer.dataset.action = 'statut';
      appliquer.dataset.id = commande.id_commande;
      appliquer.textContent = 'Appliquer';
      actions.append(choix, appliquer);
    }
    const journal = document.createElement('button');
    journal.type = 'button';
    journal.className = 'btn btn-petit btn-contour';
    journal.dataset.action = 'journal';
    journal.dataset.id = commande.id_commande;
    journal.textContent = 'Journal';
    actions.append(journal);

    const tr = document.createElement('tr');
    tr.dataset.id = commande.id_commande;
    tr.append(
      cellule('N°' + commande.id_commande),
      cellule(new Date(commande.date_commande).toLocaleDateString('fr-FR')),
      cellule(commande.client),
      cellule(commande.wilaya),
      cellule(window.Luna.libelleStatut(commande.statut)),
      cellule(window.Luna.dzd(commande.total)),
      cellule(actions)
    );
    return tr;
  }

  async function chargerCommandes(suite) {
    afficherErreur('');
    const parametres = new URLSearchParams({ limite: '20' });
    if ($('filtre-statut').value) parametres.set('statut', $('filtre-statut').value);
    if (suite && curseur) {
      parametres.set('apres_date', curseur.apres_date);
      parametres.set('apres_id', String(curseur.apres_id));
    }
    try {
      const reponse = await window.Luna.api('/api/admin/commandes?' + parametres.toString());
      const lignes = reponse.commandes.map(ligneCommande);
      if (suite) {
        $('commandes-admin').append(...lignes);
      } else {
        $('commandes-admin').replaceChildren(...lignes);
      }
      curseur = reponse.suivant;
      $('charger-plus').hidden = !curseur;
    } catch (erreur) {
      afficherErreur(erreur.message);
    }
  }

  async function basculerJournal(id, ligne) {
    const existant = ligne.nextElementSibling;
    if (existant && existant.classList.contains('journal-ligne')) {
      existant.remove();
      return;
    }
    const journal = await window.Luna.api('/api/admin/commandes/' + id + '/journal');
    const tr = document.createElement('tr');
    tr.className = 'journal-ligne';
    const td = document.createElement('td');
    td.colSpan = 7;
    td.textContent = journal.length
      ? journal
          .map((e) => new Date(e.date_changement).toLocaleString('fr-FR') + ' : ' + e.ancien_statut + ' → ' + e.nouveau_statut)
          .join('  |  ')
      : 'Aucun changement de statut enregistré.';
    tr.append(td);
    ligne.after(tr);
  }

  $('commandes-admin').addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('button[data-action]');
    if (!bouton) return;
    const id = bouton.dataset.id;
    const ligne = bouton.closest('tr');
    try {
      if (bouton.dataset.action === 'journal') {
        await basculerJournal(id, ligne);
        return;
      }
      const statut = ligne.querySelector('select').value;
      await window.Luna.api('/api/admin/commandes/' + id + '/statut', { method: 'PATCH', body: { statut } });
      window.Luna.notifier('Commande n°' + id + ' : ' + window.Luna.libelleStatut(statut));
      await Promise.all([chargerCommandes(false), chargerStats()]);
    } catch (erreur) {
      afficherErreur(erreur.message);
    }
  });

  $('filtre-statut').addEventListener('change', () => chargerCommandes(false));
  $('charger-plus').addEventListener('click', () => chargerCommandes(true));

  $('rafraichir').addEventListener('click', async () => {
    try {
      const reponse = await window.Luna.api('/api/admin/rafraichir', { method: 'POST' });
      $('rafraichir-info').textContent = reponse.message + ' (' + reponse.duree_ms + ' ms)';
      await chargerStats();
    } catch (erreur) {
      afficherErreur(erreur.message);
    }
  });

  async function demarrer() {
    const utilisateur = await window.Luna.moi();
    if (!utilisateur || utilisateur.role !== 'admin') {
      $('admin-refus').textContent = utilisateur
        ? 'Cette page est réservée à l’administrateur.'
        : 'Veuillez vous connecter avec un compte administrateur.';
      $('admin-acces').hidden = false;
      return;
    }
    contenu.hidden = false;
    try {
      await Promise.all([chargerStats(), chargerCommandes(false)]);
    } catch (erreur) {
      afficherErreur(erreur.message);
    }
  }

  demarrer();
})();
