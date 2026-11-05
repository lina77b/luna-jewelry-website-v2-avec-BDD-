(function () {
  const corps = document.getElementById('orders-body');
  if (!corps) return;

  const zoneErreur = document.getElementById('orders-error');
  let commandes = [];

  function cellule(contenu) {
    const td = document.createElement('td');
    td.append(contenu);
    return td;
  }

  function ligneCommande(commande) {
    const date = new Date(commande.date_commande).toLocaleDateString('fr-FR');
    const articles = document.createElement('ul');
    commande.lignes.forEach((ligne) => {
      const li = document.createElement('li');
      li.textContent = ligne.nom + ' (x' + ligne.quantite + ') - ' + window.Luna.dzd(ligne.sous_total);
      articles.append(li);
    });
    const actions = document.createElement('div');
    actions.className = 'actions-commande';
    const recommander = document.createElement('button');
    recommander.type = 'button';
    recommander.className = 'btn btn-petit';
    recommander.dataset.action = 'recommander';
    recommander.dataset.id = commande.id_commande;
    recommander.textContent = 'Commander à nouveau';
    actions.append(recommander);
    if (commande.statut === 'en_attente' || commande.statut === 'confirmee') {
      const annuler = document.createElement('button');
      annuler.type = 'button';
      annuler.className = 'btn btn-petit btn-danger';
      annuler.dataset.action = 'annuler';
      annuler.dataset.id = commande.id_commande;
      annuler.textContent = 'Annuler';
      actions.append(annuler);
    }
    const tr = document.createElement('tr');
    tr.append(
      cellule('N°' + commande.id_commande + ' - ' + date),
      cellule(window.Luna.libelleStatut(commande.statut)),
      cellule(window.Luna.libelleMode(commande.mode_paiement)),
      cellule(articles),
      cellule(window.Luna.dzd(commande.total) + ' (livraison ' + window.Luna.dzd(commande.frais_livraison) + ' incluse)'),
      cellule(actions)
    );
    return tr;
  }

  async function charger() {
    const utilisateur = await window.Luna.moi();
    if (!utilisateur) {
      window.Luna.versConnexion('/content/compte.html');
      return;
    }
    try {
      commandes = await window.Luna.api('/api/commandes/moi');
      if (commandes.length === 0) {
        const tr = document.createElement('tr');
        const td = cellule("Vous n'avez pas encore passé de commande.");
        td.colSpan = 6;
        tr.append(td);
        corps.replaceChildren(tr);
        return;
      }
      corps.replaceChildren(...commandes.map(ligneCommande));
    } catch (erreur) {
      zoneErreur.textContent = erreur.message;
      zoneErreur.classList.add('active');
    }
  }

  corps.addEventListener('click', async (evenement) => {
    const bouton = evenement.target.closest('button[data-action]');
    if (!bouton) return;
    const commande = commandes.find((c) => c.id_commande === parseInt(bouton.dataset.id, 10));
    if (!commande) return;
    if (bouton.dataset.action === 'recommander') {
      window.Luna.panier.ajouterLignes(commande.lignes.map((ligne) => ({ id: ligne.id_produit, quantite: ligne.quantite })));
      window.location.href = '/content/panier.html';
      return;
    }
    if (!window.confirm('Annuler la commande n°' + commande.id_commande + ' ?')) return;
    try {
      const reponse = await window.Luna.api('/api/commandes/' + commande.id_commande + '/annuler', { method: 'POST' });
      window.Luna.notifier(reponse.message);
      zoneErreur.classList.remove('active');
      charger();
    } catch (erreur) {
      zoneErreur.textContent = erreur.message;
      zoneErreur.classList.add('active');
    }
  });

  charger();
})();
