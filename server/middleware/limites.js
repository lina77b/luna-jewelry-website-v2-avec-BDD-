const rateLimit = require('express-rate-limit');

function creerLimiteur(limite, ignorerSucces) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: limite,
    skipSuccessfulRequests: ignorerSucces,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { erreur: 'Trop de tentatives, réessayez dans 15 minutes.' }
  });
}

module.exports = {
  limiteurConnexion: creerLimiteur(10, true),
  limiteurInscription: creerLimiteur(10, false)
};
