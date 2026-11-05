(function () {
  const CLE_PANIER = 'lunajewelry-cart';
  const CLE_FAVORIS = 'lunajewelry-favoris';
  const QUANTITE_MAX = 99;
  let promesseMoi = null;

  async function appeler(url, options) {
    const reglages = { credentials: 'same-origin', headers: {} };
    if (options && options.method) reglages.method = options.method;
    if (options && options.body !== undefined) {
      reglages.method = reglages.method || 'POST';
      reglages.headers['Content-Type'] = 'application/json';
      reglages.body = JSON.stringify(options.body);
    }
    const reponse = await fetch(url, reglages);
    let donnees = null;
    try {
      donnees = await reponse.json();
    } catch (e) {
      donnees = null;
    }
    if (!reponse.ok) {
      const erreur = new Error((donnees && donnees.erreur) || 'Une erreur est survenue.');
      erreur.status = reponse.status;
      throw erreur;
    }
    return { donnees, reponse };
  }

  async function api(url, options) {
    return (await appeler(url, options)).donnees;
  }

  function moi() {
    if (!promesseMoi) {
      promesseMoi = api('/api/auth/me').catch(() => null);
    }
    return promesseMoi;
  }

  function normaliser(brut) {
    if (!Array.isArray(brut)) return [];
    const fusion = new Map();
    brut.forEach((article) => {
      const id = parseInt(article && article.id, 10);
      const valeur = article && (article.quantite !== undefined ? article.quantite : article.quantity);
      const quantite = parseInt(valeur, 10);
      if (!Number.isInteger(id) || id < 1 || !Number.isInteger(quantite) || quantite < 1) return;
      fusion.set(id, Math.min((fusion.get(id) || 0) + quantite, QUANTITE_MAX));
    });
    return Array.from(fusion, ([id, quantite]) => ({ id, quantite }));
  }

  function lirePanier() {
    try {
      return normaliser(JSON.parse(localStorage.getItem(CLE_PANIER)));
    } catch (e) {
      return [];
    }
  }

  function ecrirePanier(liste) {
    try {
      localStorage.setItem(CLE_PANIER, JSON.stringify(normaliser(liste)));
    } catch (e) {
      console.error('Erreur lors de la sauvegarde du panier:', e);
    }
    window.dispatchEvent(new Event('panier-modifie'));
  }

  function ajouterAuPanier(id) {
    const liste = lirePanier();
    const existant = liste.find((article) => article.id === id);
    if (existant) {
      existant.quantite = Math.min(existant.quantite + 1, QUANTITE_MAX);
    } else {
      liste.push({ id, quantite: 1 });
    }
    ecrirePanier(liste);
  }

  function ajouterLignes(lignes) {
    const liste = lirePanier();
    lignes.forEach((ligne) => {
      const existant = liste.find((article) => article.id === ligne.id);
      if (existant) {
        existant.quantite = Math.min(existant.quantite + ligne.quantite, QUANTITE_MAX);
      } else {
        liste.push({ id: ligne.id, quantite: Math.min(ligne.quantite, QUANTITE_MAX) });
      }
    });
    ecrirePanier(liste);
  }

  function compterPanier() {
    return lirePanier().reduce((somme, article) => somme + article.quantite, 0);
  }

  function lireFavoris() {
    try {
      const brut = JSON.parse(localStorage.getItem(CLE_FAVORIS));
      if (!Array.isArray(brut)) return [];
      return Array.from(new Set(brut.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
    } catch (e) {
      return [];
    }
  }

  function basculerFavori(id) {
    const liste = lireFavoris();
    const position = liste.indexOf(id);
    if (position === -1) {
      liste.push(id);
    } else {
      liste.splice(position, 1);
    }
    try {
      localStorage.setItem(CLE_FAVORIS, JSON.stringify(liste));
    } catch (e) {
      console.error('Erreur lors de la sauvegarde des favoris:', e);
    }
    window.dispatchEvent(new Event('favoris-modifie'));
    return position === -1;
  }

  const ICONES = {
    coeur: [['path', { d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' }]],
    loupe: [
      ['circle', { cx: 11, cy: 11, r: 8 }],
      ['path', { d: 'M21 21l-4.35-4.35' }]
    ],
    panier: [
      ['circle', { cx: 9, cy: 21, r: 1 }],
      ['circle', { cx: 20, cy: 21, r: 1 }],
      ['path', { d: 'M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6' }]
    ],
    utilisateur: [
      ['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }],
      ['circle', { cx: 12, cy: 7, r: 4 }]
    ]
  };

  function icone(nom) {
    const espace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(espace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icone icone-' + nom);
    svg.setAttribute('aria-hidden', 'true');
    ICONES[nom].forEach(([balise, attributs]) => {
      const forme = document.createElementNS(espace, balise);
      Object.keys(attributs).forEach((cle) => forme.setAttribute(cle, attributs[cle]));
      svg.append(forme);
    });
    return svg;
  }

  function notifier(message) {
    const ancien = document.querySelector('.toast');
    if (ancien) ancien.remove();
    const bulle = document.createElement('div');
    bulle.className = 'toast';
    bulle.setAttribute('role', 'status');
    bulle.textContent = message;
    document.body.append(bulle);
    requestAnimationFrame(() => bulle.classList.add('visible'));
    setTimeout(() => {
      bulle.classList.remove('visible');
      setTimeout(() => bulle.remove(), 300);
    }, 2200);
  }

  function dzd(valeur, decimales) {
    const nombre = Number(valeur);
    if (decimales === false && Number.isInteger(nombre)) return nombre + ' DZD';
    return nombre.toFixed(2) + ' DZD';
  }

  const STATUTS = {
    en_attente: 'En attente',
    confirmee: 'Confirmée',
    expediee: 'Expédiée',
    livree: 'Livrée',
    annulee: 'Annulée'
  };

  const MODES = {
    credit: 'Carte de crédit',
    baridimob: 'BaridiMob',
    cash: 'Paiement à la livraison'
  };

  function redirectionValide(valeur) {
    if (typeof valeur === 'string' && valeur.charAt(0) === '/' && valeur.charAt(1) !== '/' && valeur.indexOf('\\') === -1) {
      return valeur;
    }
    return '/index.html';
  }

  function versConnexion(retour) {
    window.location.href = '/content/authentification.html?redirect=' + encodeURIComponent(retour);
  }

  window.Luna = {
    api,
    apiBrut: appeler,
    moi,
    dzd,
    icone,
    notifier,
    redirectionValide,
    versConnexion,
    libelleStatut: (statut) => STATUTS[statut] || statut,
    libelleMode: (mode) => MODES[mode] || mode,
    favoris: { lire: lireFavoris, basculer: basculerFavori },
    panier: { lire: lirePanier, ecrire: ecrirePanier, ajouter: ajouterAuPanier, ajouterLignes, compter: compterPanier }
  };
})();
