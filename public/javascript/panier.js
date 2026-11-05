(function () {
  const corpsPanier = document.getElementById('cart-items');
  if (!corpsPanier) return;

  const $ = (id) => document.getElementById(id);
  const tableau = $('cart-wrap');
  const resume = $('cart-summary');
  const recap = $('order-recap');
  const formLivraison = $('delivery-form');
  const formPaiement = $('payment-form');
  const blocCommande = $('order-details');
  const selectWilaya = $('wilaya');
  const boutonValider = $('validate-cart-btn');

  let produits = new Map();
  let wilayas = new Map();
  let utilisateur = null;
  let avis = null;

  function cellule(contenu) {
    const td = document.createElement('td');
    td.append(contenu);
    return td;
  }

  function sousTotal() {
    return window.Luna.panier.lire().reduce((somme, article) => {
      const produit = produits.get(article.id);
      return produit ? somme + Number(produit.prix) * article.quantite : somme;
    }, 0);
  }

  function afficherAvis(message) {
    if (!avis) {
      avis = document.createElement('p');
      avis.className = 'error';
      tableau.parentNode.insertBefore(avis, tableau);
    }
    avis.textContent = message || '';
    avis.classList.toggle('active', Boolean(message));
  }

  function afficher() {
    const panier = window.Luna.panier.lire();
    corpsPanier.replaceChildren();

    if (panier.length === 0) {
      const ligne = document.createElement('tr');
      const td = cellule('Le panier est vide');
      td.colSpan = 5;
      ligne.append(td);
      corpsPanier.append(ligne);
      boutonValider.disabled = true;
    } else {
      panier.forEach((article) => {
        const produit = produits.get(article.id);
        if (!produit) return;
        const champ = document.createElement('input');
        champ.type = 'number';
        champ.min = '1';
        champ.max = String(Math.min(produit.stock, 99));
        champ.value = String(article.quantite);
        champ.dataset.id = article.id;

        const supprimer = document.createElement('button');
        supprimer.className = 'btn';
        supprimer.textContent = 'Supprimer';
        supprimer.dataset.id = article.id;

        const ligne = document.createElement('tr');
        ligne.append(
          cellule(produit.nom),
          cellule(window.Luna.dzd(produit.prix)),
          cellule(champ),
          cellule(window.Luna.dzd(Number(produit.prix) * article.quantite)),
          cellule(supprimer)
        );
        corpsPanier.append(ligne);
      });
      boutonValider.disabled = false;
    }

    $('subtotal').textContent = window.Luna.dzd(sousTotal());
    $('recap-subtotal').textContent = window.Luna.dzd(sousTotal());
    majRecap();
  }

  function majRecap() {
    const wilaya = wilayas.get(Number(selectWilaya.value));
    if (!wilaya) {
      $('shipping').textContent = 'Choisissez une wilaya';
      $('total').textContent = '-';
      return;
    }
    $('shipping').textContent = window.Luna.dzd(wilaya.frais_livraison);
    $('total').textContent = window.Luna.dzd(sousTotal() + Number(wilaya.frais_livraison));
  }

  async function chargerProduits() {
    const panier = window.Luna.panier.lire();
    if (panier.length === 0) {
      produits = new Map();
      return afficher();
    }
    try {
      const liste = await window.Luna.api('/api/produits?ids=' + panier.map((article) => article.id).join(','));
      produits = new Map(liste.map((produit) => [produit.id_produit, produit]));
    } catch (erreur) {
      afficherAvis('Impossible de charger votre panier pour le moment.');
      return;
    }

    let modifie = false;
    let retires = false;
    const corrige = [];
    panier.forEach((article) => {
      const produit = produits.get(article.id);
      if (!produit || produit.stock <= 0) {
        retires = true;
        modifie = true;
        return;
      }
      if (article.quantite > produit.stock) {
        corrige.push({ id: article.id, quantite: produit.stock });
        modifie = true;
        return;
      }
      corrige.push(article);
    });
    if (modifie) {
      window.Luna.panier.ecrire(corrige);
      afficherAvis(
        retires
          ? "Certains articles ne sont plus disponibles ; votre panier a été mis à jour."
          : 'Certaines quantités ont été ajustées au stock disponible.'
      );
    }
    afficher();
  }

  async function chargerWilayas() {
    try {
      const liste = await window.Luna.api('/api/wilayas');
      liste.forEach((wilaya) => {
        wilayas.set(wilaya.code_wilaya, wilaya);
        const option = document.createElement('option');
        option.value = String(wilaya.code_wilaya);
        option.textContent = wilaya.nom;
        selectWilaya.append(option);
      });
    } catch (erreur) {
      afficherAvis('Impossible de charger la liste des wilayas.');
    }
  }

  async function preremplir() {
    if ($('name').value === '') {
      $('name').value = utilisateur.prenom + ' ' + utilisateur.nom;
    }
    try {
      const commandes = await window.Luna.api('/api/commandes/moi');
      const derniere = commandes[0];
      if (derniere) {
        if ($('address').value === '') $('address').value = derniere.adresse_livraison;
        if ($('phone').value === '') $('phone').value = derniere.telephone_livraison;
        if (selectWilaya.value === '') selectWilaya.value = String(derniere.code_wilaya);
        majRecap();
      }
    } catch (erreur) {
      return;
    }
  }

  async function validerPanier() {
    if (window.Luna.panier.lire().length === 0) {
      alert('Votre panier est vide !');
      return;
    }
    utilisateur = await window.Luna.moi();
    if (!utilisateur) {
      window.Luna.versConnexion('/content/panier.html');
      return;
    }
    tableau.hidden = true;
    resume.hidden = true;
    recap.hidden = false;
    formLivraison.hidden = false;
    afficherAvis('');
    preremplir();
  }

  function retourPanier(message) {
    formPaiement.hidden = true;
    formLivraison.hidden = true;
    recap.hidden = true;
    tableau.hidden = false;
    resume.hidden = false;
    chargerProduits().then(() => afficherAvis(message));
  }

  function passerAuPaiement(evenement) {
    evenement.preventDefault();
    if (!$('name').value || !$('address').value || !$('phone').value || !selectWilaya.value) {
      alert('Veuillez remplir tous les champs de livraison.');
      return;
    }
    formLivraison.hidden = true;
    formPaiement.hidden = false;
  }

  function ligneInfo(libelle, valeur) {
    const p = document.createElement('p');
    const fort = document.createElement('strong');
    fort.textContent = libelle;
    p.append(fort, ' ' + valeur);
    return p;
  }

  function afficherConfirmation(commande) {
    const contenu = $('order-content');
    const liste = document.createElement('ul');
    commande.lignes.forEach((ligne) => {
      const li = document.createElement('li');
      li.textContent = ligne.nom + ' (x' + ligne.quantite + ') - ' + window.Luna.dzd(ligne.sous_total);
      liste.append(li);
    });
    const titre = document.createElement('h4');
    titre.textContent = 'Articles commandés:';
    const merci = document.createElement('p');
    merci.className = 'success active';
    merci.textContent = 'Votre commande n°' + commande.id_commande + ' a été enregistrée. Merci pour votre achat!';

    contenu.replaceChildren(
      ligneInfo('Commande n°:', String(commande.id_commande)),
      ligneInfo('Nom:', commande.nom_livraison),
      ligneInfo('Adresse:', commande.adresse_livraison),
      ligneInfo('Téléphone:', commande.telephone_livraison),
      ligneInfo('Wilaya:', commande.wilaya),
      ligneInfo('Mode de paiement:', window.Luna.libelleMode(commande.mode_paiement)),
      titre,
      liste,
      ligneInfo('Sous-total:', window.Luna.dzd(commande.sous_total)),
      ligneInfo('Frais de livraison:', window.Luna.dzd(commande.frais_livraison)),
      ligneInfo('Total:', window.Luna.dzd(commande.total)),
      merci
    );
    blocCommande.hidden = false;
    formPaiement.hidden = true;
    recap.hidden = true;
  }

  async function confirmerCommande(evenement) {
    evenement.preventDefault();
    const paiement = $('payment').value;
    const erreur = $('order-error');
    const bouton = $('confirm-order-btn');
    erreur.classList.remove('active');

    if (!paiement) {
      alert('Veuillez sélectionner un mode de paiement.');
      return;
    }

    bouton.disabled = true;
    try {
      const commande = await window.Luna.api('/api/commandes', {
        body: {
          items: window.Luna.panier.lire().map((article) => ({ id_produit: article.id, quantite: article.quantite })),
          nom: $('name').value,
          adresse: $('address').value,
          telephone: $('phone').value,
          code_wilaya: Number(selectWilaya.value),
          mode_paiement: paiement
        }
      });
      window.Luna.panier.ecrire([]);
      afficherConfirmation(commande);
      $('delivery-details').reset();
      $('payment-details').reset();
    } catch (err) {
      if (err.status === 401) {
        window.Luna.versConnexion('/content/panier.html');
        return;
      }
      if (err.status === 409) {
        retourPanier(err.message + ' Veuillez ajuster votre panier.');
        return;
      }
      erreur.textContent = err.message;
      erreur.classList.add('active');
    } finally {
      bouton.disabled = false;
    }
  }

  corpsPanier.addEventListener('change', (evenement) => {
    const champ = evenement.target.closest('input[data-id]');
    if (!champ) return;
    const id = parseInt(champ.dataset.id, 10);
    const produit = produits.get(id);
    let quantite = parseInt(champ.value, 10) || 1;
    if (quantite < 1) quantite = 1;
    if (produit && quantite > produit.stock) {
      quantite = produit.stock;
      afficherAvis('Stock disponible pour « ' + produit.nom + ' » : ' + produit.stock + '.');
    }
    quantite = Math.min(quantite, 99);
    window.Luna.panier.ecrire(
      window.Luna.panier.lire().map((article) => (article.id === id ? { id, quantite } : article))
    );
    afficher();
  });

  corpsPanier.addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('button[data-id]');
    if (!bouton) return;
    const id = parseInt(bouton.dataset.id, 10);
    window.Luna.panier.ecrire(window.Luna.panier.lire().filter((article) => article.id !== id));
    afficher();
  });

  boutonValider.addEventListener('click', validerPanier);
  $('delivery-details').addEventListener('submit', passerAuPaiement);
  $('payment-details').addEventListener('submit', confirmerCommande);
  selectWilaya.addEventListener('change', majRecap);

  chargerWilayas();
  chargerProduits();
})();
