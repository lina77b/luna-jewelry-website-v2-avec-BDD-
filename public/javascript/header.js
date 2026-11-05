(function () {
  const PAGES_CATEGORIES = {
    bagues: 'bague.html',
    colliers: 'collier.html',
    bracelets: 'bracelet.html',
    boucles: 'boucles.html'
  };
  const PAGES_ACCUEIL = ['/', '/index.html'];
  const PAGES_CATALOGUE = [
    '/content/bague.html',
    '/content/collier.html',
    '/content/bracelet.html',
    '/content/boucles.html'
  ];
  const PAGES_PROFIL = ['/content/authentification.html', '/content/inscription.html', '/content/compte.html'];

  const enTete = document.getElementById('site-header');
  const pied = document.getElementById('site-footer');
  const etat = { utilisateur: null, categories: null };

  function creer(balise, attributs, enfants) {
    const element = document.createElement(balise);
    Object.keys(attributs || {}).forEach((cle) => element.setAttribute(cle, attributs[cle]));
    (enfants || []).forEach((enfant) => element.append(enfant));
    return element;
  }

  function actif(pages) {
    return pages.indexOf(window.location.pathname) !== -1;
  }

  function lien(href, classe, enfants) {
    return creer('a', { href, class: classe }, enfants);
  }

  function lienTexte(href, libelle, estActif) {
    return lien(href, 'nav-link' + (estActif ? ' active' : ''), [libelle]);
  }

  function lienAction(href, icone, libelle, estActif, extra, libelleVisible) {
    const etiquette = creer('span', { class: 'nav-label' + (libelleVisible ? ' visible' : '') }, [libelle]);
    const enfants = [window.Luna.icone(icone), etiquette];
    return lien(href, 'nav-link nav-action' + (estActif ? ' active' : ''), extra ? enfants.concat(extra) : enfants);
  }

  function sousMenu(liens) {
    return creer(
      'ul',
      { class: 'dropdown-menu' },
      liens.map((element) => creer('li', {}, [element]))
    );
  }

  function itemCategories() {
    const principal = lienTexte('#', 'Catégories', actif(PAGES_CATALOGUE));
    const liens = (etat.categories || [])
      .filter((categorie) => PAGES_CATEGORIES[categorie.slug])
      .map((categorie) => lienTexte('/content/' + PAGES_CATEGORIES[categorie.slug], categorie.nom, false));
    return creer('li', { class: 'dropdown' }, [principal, sousMenu(liens)]);
  }

  function itemRecherche() {
    const element = lienAction('/content/recherche.html', 'loupe', 'Recherche', actif(['/content/recherche.html']));
    element.setAttribute('aria-label', 'Recherche');
    return creer('li', {}, [element]);
  }

  function itemFavoris() {
    const badge = creer('span', { id: 'fav-count', class: 'badge' });
    const element = lienAction('/content/favoris.html', 'coeur', 'Favoris', actif(['/content/favoris.html']), [badge]);
    element.id = 'fav-link';
    element.setAttribute('aria-label', 'Favoris');
    return creer('li', {}, [element]);
  }

  function itemPanier() {
    const badge = creer('span', { id: 'cart-count', class: 'badge' });
    const element = lienAction('/content/panier.html', 'panier', 'Panier', actif(['/content/panier.html']), [badge]);
    element.setAttribute('aria-label', 'Panier');
    return creer('li', {}, [element]);
  }

  function itemProfil() {
    if (etat.utilisateur) {
      const principal = lienAction(
        '/content/compte.html',
        'utilisateur',
        'Bonjour ' + etat.utilisateur.prenom,
        actif(PAGES_PROFIL),
        null,
        true
      );
      const deconnexion = lien('#', 'nav-link', ['Déconnexion']);
      deconnexion.id = 'logout-link';
      const liens = [];
      if (etat.utilisateur.role === 'admin') {
        liens.push(lienTexte('/content/admin.html', 'Administration', false));
      } else {
        liens.push(lienTexte('/content/compte.html', 'Mes commandes', false));
      }
      liens.push(deconnexion);
      return creer('li', { class: 'dropdown' }, [principal, sousMenu(liens)]);
    }
    const principal = lienAction('/content/authentification.html', 'utilisateur', 'Profil', actif(PAGES_PROFIL));
    principal.setAttribute('aria-label', 'Profil');
    return creer('li', { class: 'dropdown' }, [
      principal,
      sousMenu([
        lienTexte('/content/authentification.html', 'Connexion', false),
        lienTexte('/content/inscription.html', 'Inscription', false)
      ])
    ]);
  }

  function majCompteurs() {
    const panier = window.Luna.panier.compter();
    const favoris = window.Luna.favoris.lire().length;
    const compteurPanier = document.getElementById('cart-count');
    const compteurFavoris = document.getElementById('fav-count');
    const lienFavoris = document.getElementById('fav-link');
    if (compteurPanier) compteurPanier.textContent = panier > 0 ? String(panier) : '';
    if (compteurFavoris) compteurFavoris.textContent = favoris > 0 ? String(favoris) : '';
    if (lienFavoris) lienFavoris.classList.toggle('plein', favoris > 0);
  }

  function construireMenu() {
    const menu = enTete.querySelector('.nav-menu');
    const accueil = creer('li', {}, [lienTexte('/index.html', 'Accueil', actif(PAGES_ACCUEIL))]);
    const estAdmin = Boolean(etat.utilisateur) && etat.utilisateur.role === 'admin';
    const elements = [accueil, itemCategories(), itemRecherche()];
    if (!estAdmin) elements.push(itemFavoris(), itemPanier());
    elements.push(itemProfil());
    menu.replaceChildren(...elements);
    majCompteurs();
  }

  function construireEntete() {
    const logo = lien('/index.html', 'logo', [
      creer('img', { src: '/images/logo.png', alt: 'Logo luna jewelry' }),
      'Luna jewelry'
    ]);
    const bouton = creer('button', { class: 'nav-toggle', 'aria-label': 'Ouvrir le menu' }, [
      creer('span', { class: 'hamburger' })
    ]);
    enTete.replaceChildren(creer('nav', {}, [logo, bouton, creer('ul', { class: 'nav-menu' })]));
    construireMenu();
  }

  function iconeContact(href, icone, alt) {
    return lien(href, '', [creer('img', { src: '/images/' + icone, alt })]);
  }

  function construirePied() {
    if (!pied) return;
    const contacts = creer('div', { class: 'con' }, [
      iconeContact('mailto:contact@lunajewelry.com', 'icons8-email-open-50.png', 'email'),
      iconeContact('tel:+1234567890', 'icons8-phone-80.png', 'telephone'),
      iconeContact('https://www.tiktok.com/@lunajewelry', 'icons8-tiktok-logo-94.png', 'tiktok'),
      iconeContact('https://www.facebook.com/lunajewelry', 'icons8-facebook-logo-48.png', 'facebook'),
      iconeContact('https://www.instagram.com/lunajewelry', 'icons8-instagram-logo-94.png', 'instagram')
    ]);
    pied.replaceChildren(
      creer('h2', {}, ['Contactez-nous']),
      contacts,
      creer('p', {}, ['© 2025 Luna Jewelry. Projet pédagogique. Icônes : ', lien('https://icons8.com', '', ['Icons8']), '.'])
    );
  }

  document.addEventListener('click', async (evenement) => {
    if (!evenement.target.closest('#logout-link')) return;
    evenement.preventDefault();
    try {
      await window.Luna.api('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    window.location.href = '/index.html';
  });

  window.addEventListener('panier-modifie', majCompteurs);
  window.addEventListener('favoris-modifie', majCompteurs);
  window.addEventListener('storage', majCompteurs);

  if (enTete) {
    construireEntete();
    construirePied();

    window.Luna.moi().then((utilisateur) => {
      etat.utilisateur = utilisateur;
      construireMenu();
    });

    window.Luna.api('/api/categories')
      .then((categories) => {
        etat.categories = categories;
        construireMenu();
      })
      .catch(() => {});
  }
})();
