(function () {
  const grille = document.querySelector('.product-grid');
  if (!grille) return;

  const modeFavoris = grille.hasAttribute('data-favoris');
  const LIMITE = 12;
  const etat = {
    q: new URLSearchParams(window.location.search).get('q') || '',
    tri: '',
    prix_min: '',
    prix_max: '',
    en_stock: false,
    page: 1,
    total: 0
  };
  let produits = [];
  let pagination = null;
  let delai = null;

  function texte(balise, classe, contenu) {
    const element = document.createElement(balise);
    if (classe) element.className = classe;
    element.textContent = contenu;
    return element;
  }

  function boutonIcone(classe, icone, libelle) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = classe;
    bouton.setAttribute('aria-label', libelle);
    bouton.title = libelle;
    bouton.append(window.Luna.icone(icone));
    return bouton;
  }

  function etoiles(note) {
    const pleines = Math.round(note);
    return '★'.repeat(pleines) + '☆'.repeat(5 - pleines);
  }

  function carte(produit) {
    const conteneur = document.createElement('div');
    conteneur.className = 'product';

    const image = document.createElement('img');
    image.src = '/images/' + produit.image;
    image.alt = produit.nom;
    image.loading = 'lazy';
    image.decoding = 'async';

    const favori = boutonIcone('fav-btn', 'coeur', 'Ajouter aux favoris');
    const estFavori = window.Luna.favoris.lire().indexOf(produit.id_produit) !== -1;
    favori.classList.toggle('actif', estFavori);
    favori.setAttribute('aria-pressed', String(estFavori));
    favori.dataset.id = produit.id_produit;
    favori.dataset.nom = produit.nom;

    const media = document.createElement('div');
    media.className = 'product-media';
    media.append(image, favori);
    if (produit.stock <= 0) media.append(texte('span', 'badge-epuise', 'Épuisé'));

    const note = texte(
      'button',
      'note-btn',
      produit.nb_avis > 0
        ? etoiles(produit.note_moyenne) + ' ' + produit.note_moyenne.toFixed(1) + ' (' + produit.nb_avis + ')'
        : 'Aucun avis'
    );
    note.type = 'button';
    note.dataset.id = produit.id_produit;
    note.dataset.nom = produit.nom;

    const panier = boutonIcone('cart-btn', 'panier', produit.stock > 0 ? 'Ajouter au panier' : 'Épuisé');
    panier.disabled = produit.stock <= 0;
    panier.dataset.id = produit.id_produit;
    panier.dataset.nom = produit.nom;

    const pied = document.createElement('div');
    pied.className = 'product-footer';
    pied.append(texte('p', 'price', window.Luna.dzd(produit.prix, false)), panier);

    const corps = document.createElement('div');
    corps.className = 'product-body';
    corps.append(texte('h3', '', produit.nom), note, texte('p', 'description', produit.description || ''), pied);

    conteneur.append(media, corps);
    return conteneur;
  }

  function squelettes() {
    return Array.from({ length: 8 }, () => {
      const element = document.createElement('div');
      element.className = 'product skeleton';
      element.setAttribute('aria-hidden', 'true');
      const image = document.createElement('div');
      image.className = 'sk-image';
      const corps = document.createElement('div');
      corps.className = 'product-body';
      ['sk-ligne', 'sk-ligne court', 'sk-ligne'].forEach((classe) => {
        const ligne = document.createElement('div');
        ligne.className = classe;
        corps.append(ligne);
      });
      element.append(image, corps);
      return element;
    });
  }

  function etatVide(message, avecLien) {
    const bloc = document.createElement('div');
    bloc.className = 'empty-state';
    bloc.append(texte('p', '', message));
    if (avecLien) {
      const lien = document.createElement('a');
      lien.className = 'btn';
      lien.href = '/content/bague.html';
      lien.textContent = 'Découvrir nos bijoux';
      bloc.append(lien);
    }
    return bloc;
  }

  function champ(balise, attributs) {
    const element = document.createElement(balise);
    Object.keys(attributs).forEach((cle) => element.setAttribute(cle, attributs[cle]));
    return element;
  }

  function construireBarre() {
    const barre = champ('form', { class: 'catalogue-barre', role: 'search' });
    const recherche = champ('input', { type: 'search', name: 'q', placeholder: 'Rechercher un bijou…', 'aria-label': 'Rechercher' });
    recherche.value = etat.q;
    const tri = champ('select', { name: 'tri', 'aria-label': 'Trier' });
    [
      ['', 'Pertinence'],
      ['prix_asc', 'Prix croissant'],
      ['prix_desc', 'Prix décroissant'],
      ['nom', 'Nom (A-Z)'],
      ['note', 'Mieux notés']
    ].forEach(([valeur, libelle]) => {
      const option = champ('option', { value: valeur });
      option.textContent = libelle;
      tri.append(option);
    });
    const min = champ('input', { type: 'number', name: 'prix_min', min: '0', placeholder: 'Prix min', 'aria-label': 'Prix minimum' });
    const max = champ('input', { type: 'number', name: 'prix_max', min: '0', placeholder: 'Prix max', 'aria-label': 'Prix maximum' });
    const stock = champ('input', { type: 'checkbox', name: 'en_stock' });
    const etiquette = champ('label', { class: 'case' });
    etiquette.append(stock, ' En stock');
    barre.append(recherche, tri, min, max, etiquette);

    const maj = () => {
      etat.q = recherche.value.trim();
      etat.tri = tri.value;
      etat.prix_min = min.value;
      etat.prix_max = max.value;
      etat.en_stock = stock.checked;
      etat.page = 1;
      charger();
    };
    barre.addEventListener('submit', (evenement) => {
      evenement.preventDefault();
      maj();
    });
    barre.addEventListener('input', () => {
      clearTimeout(delai);
      delai = setTimeout(maj, 300);
    });
    barre.addEventListener('change', maj);
    grille.before(barre);

    pagination = champ('nav', { class: 'pagination', 'aria-label': 'Pagination' });
    pagination.addEventListener('click', (evenement) => {
      const bouton = evenement.target.closest('button[data-page]');
      if (!bouton || bouton.disabled) return;
      etat.page = parseInt(bouton.dataset.page, 10);
      charger();
      grille.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    grille.after(pagination);
  }

  function majPagination() {
    const pages = Math.max(Math.ceil(etat.total / LIMITE), 1);
    pagination.replaceChildren();
    pagination.hidden = pages <= 1;
    const precedent = texte('button', 'btn btn-contour', 'Précédent');
    precedent.type = 'button';
    precedent.dataset.page = String(etat.page - 1);
    precedent.disabled = etat.page <= 1;
    const suivant = texte('button', 'btn btn-contour', 'Suivant');
    suivant.type = 'button';
    suivant.dataset.page = String(etat.page + 1);
    suivant.disabled = etat.page >= pages;
    pagination.append(precedent, texte('span', '', 'Page ' + etat.page + ' / ' + pages + ' - ' + etat.total + ' bijoux'), suivant);
  }

  function afficher() {
    let liste = produits;
    if (modeFavoris) {
      const favoris = window.Luna.favoris.lire();
      liste = produits.filter((produit) => favoris.indexOf(produit.id_produit) !== -1);
      if (liste.length === 0) {
        return grille.replaceChildren(
          etatVide("Vous n'avez pas encore de favoris. Cliquez sur le cœur d'un bijou pour le retrouver ici.", true)
        );
      }
    } else if (liste.length === 0) {
      return grille.replaceChildren(etatVide('Aucun bijou ne correspond à votre recherche.', false));
    }
    grille.replaceChildren(...liste.map(carte));
  }

  async function ouvrirAvis(id, nom) {
    const dialogue = document.createElement('dialog');
    dialogue.className = 'avis-dialog';
    const liste = document.createElement('div');
    const message = texte('p', 'error', '');
    const fermer = texte('button', 'btn btn-contour', 'Fermer');
    fermer.type = 'button';
    fermer.addEventListener('click', () => dialogue.close ? dialogue.close() : dialogue.removeAttribute('open'));
    dialogue.addEventListener('close', () => dialogue.remove());
    dialogue.append(texte('h3', '', 'Avis : ' + nom), liste);

    async function chargerAvis() {
      try {
        const avis = await window.Luna.api('/api/produits/' + id + '/avis');
        if (avis.length === 0) {
          liste.replaceChildren(texte('p', 'vide', "Aucun avis pour l'instant."));
          return;
        }
        liste.replaceChildren(
          ...avis.map((a) => {
            const bloc = document.createElement('div');
            bloc.className = 'avis';
            const date = new Date(a.date_avis).toLocaleDateString('fr-FR');
            bloc.append(texte('strong', '', a.prenom + ' '), texte('span', 'etoiles', etoiles(a.note)), texte('small', '', ' ' + date));
            if (a.commentaire) bloc.append(texte('p', '', a.commentaire));
            return bloc;
          })
        );
      } catch (erreur) {
        liste.replaceChildren(texte('p', 'error active', erreur.message));
      }
    }

    const utilisateur = await window.Luna.moi();
    if (utilisateur) {
      const formulaire = champ('form', { class: 'avis-form' });
      const note = champ('select', { name: 'note', 'aria-label': 'Note' });
      [5, 4, 3, 2, 1].forEach((valeur) => {
        const option = champ('option', { value: String(valeur) });
        option.textContent = etoiles(valeur) + ' (' + valeur + '/5)';
        note.append(option);
      });
      const commentaire = champ('input', { type: 'text', name: 'commentaire', maxlength: '500', placeholder: 'Votre commentaire (facultatif)' });
      const envoyer = texte('button', 'btn', 'Publier mon avis');
      envoyer.type = 'submit';
      formulaire.append(note, commentaire, envoyer);
      formulaire.addEventListener('submit', async (evenement) => {
        evenement.preventDefault();
        message.classList.remove('active');
        try {
          await window.Luna.api('/api/produits/' + id + '/avis', {
            body: { note: parseInt(note.value, 10), commentaire: commentaire.value }
          });
          commentaire.value = '';
          window.Luna.notifier('Merci pour votre avis !');
          await chargerAvis();
          if (!modeFavoris) charger();
        } catch (erreur) {
          message.textContent = erreur.message;
          message.classList.add('active');
        }
      });
      dialogue.append(formulaire, message);
    } else {
      const lien = texte('a', 'btn', 'Se connecter pour donner un avis');
      lien.href = '/content/authentification.html?redirect=' + encodeURIComponent(window.location.pathname);
      dialogue.append(lien);
    }
    dialogue.append(fermer);
    document.body.append(dialogue);
    if (typeof dialogue.showModal === 'function') {
      dialogue.showModal();
    } else {
      dialogue.setAttribute('open', '');
    }
    chargerAvis();
  }

  grille.addEventListener('click', (evenement) => {
    const favori = evenement.target.closest('.fav-btn');
    if (favori) {
      const ajoute = window.Luna.favoris.basculer(parseInt(favori.dataset.id, 10));
      favori.classList.toggle('actif', ajoute);
      favori.setAttribute('aria-pressed', String(ajoute));
      window.Luna.notifier(favori.dataset.nom + (ajoute ? ' ajouté aux favoris' : ' retiré des favoris'));
      return;
    }
    const note = evenement.target.closest('.note-btn');
    if (note) {
      ouvrirAvis(parseInt(note.dataset.id, 10), note.dataset.nom);
      return;
    }
    const panier = evenement.target.closest('.cart-btn');
    if (panier && !panier.disabled) {
      window.Luna.panier.ajouter(parseInt(panier.dataset.id, 10));
      window.Luna.notifier(panier.dataset.nom + ' ajouté au panier');
    }
  });

  async function charger() {
    grille.replaceChildren(...squelettes());
    try {
      if (modeFavoris) {
        const ids = window.Luna.favoris.lire();
        produits = ids.length ? await window.Luna.api('/api/produits?ids=' + ids.join(',')) : [];
      } else {
        const parametres = new URLSearchParams();
        if (grille.dataset.categorie) parametres.set('categorie', grille.dataset.categorie);
        if (etat.q) parametres.set('q', etat.q);
        if (etat.tri) parametres.set('tri', etat.tri);
        if (etat.prix_min) parametres.set('prix_min', etat.prix_min);
        if (etat.prix_max) parametres.set('prix_max', etat.prix_max);
        if (etat.en_stock) parametres.set('en_stock', '1');
        parametres.set('limite', String(LIMITE));
        parametres.set('page', String(etat.page));
        const resultat = await window.Luna.apiBrut('/api/produits?' + parametres.toString());
        produits = resultat.donnees;
        etat.total = parseInt(resultat.reponse.headers.get('X-Total-Count'), 10) || 0;
        majPagination();
      }
      afficher();
    } catch (erreur) {
      grille.replaceChildren(texte('p', 'error active', 'Impossible de charger les produits pour le moment.'));
    }
  }

  if (modeFavoris) {
    window.addEventListener('favoris-modifie', afficher);
  } else {
    construireBarre();
  }
  charger();
})();
