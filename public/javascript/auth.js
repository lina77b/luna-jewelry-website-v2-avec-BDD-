(function () {
  const formConnexion = document.getElementById('connexion');
  const formInscription = document.getElementById('inscription');
  if (!formConnexion && !formInscription) return;

  const parametres = new URLSearchParams(window.location.search);
  const retour = parametres.get('redirect');
  const destination = window.Luna.redirectionValide(retour);
  const zoneErreur = document.getElementById('form-error');

  function afficherErreur(message) {
    zoneErreur.textContent = message;
    zoneErreur.classList.add('active');
  }

  function masquerErreur() {
    zoneErreur.classList.remove('active');
  }

  if (retour) {
    document.querySelectorAll('.link a').forEach((lien) => {
      lien.href = lien.getAttribute('href') + '?redirect=' + encodeURIComponent(destination);
    });
  }

  if (formConnexion) {
    formConnexion.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      masquerErreur();
      const bouton = formConnexion.querySelector('button[type="submit"]');
      bouton.disabled = true;
      try {
        await window.Luna.api('/api/auth/login', {
          body: {
            email: document.getElementById('email').value,
            mot_de_passe: document.getElementById('password').value
          }
        });
        window.location.href = destination;
      } catch (erreur) {
        afficherErreur(erreur.message);
        bouton.disabled = false;
      }
    });
  }

  if (formInscription) {
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const passwordMatchError = document.getElementById('password-match-error');
    const passwordStrengthError = document.getElementById('password-strength-error');
    const birthdate = document.getElementById('birthdate');

    birthdate.max = new Date().toISOString().slice(0, 10);

    function isStrong(password) {
      const minLength = password.length >= 8;
      const hasUpperCase = /[A-Z]/.test(password);
      const hasLowerCase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
      return minLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
    }

    confirmPasswordInput.addEventListener('input', () => {
      const passwordsMatch = passwordInput.value === confirmPasswordInput.value;
      passwordMatchError.classList.toggle('active', !passwordsMatch);
    });

    passwordInput.addEventListener('input', () => {
      passwordStrengthError.classList.toggle('active', !isStrong(passwordInput.value));
      const passwordsMatch = passwordInput.value === confirmPasswordInput.value;
      passwordMatchError.classList.toggle('active', !passwordsMatch && Boolean(confirmPasswordInput.value));
    });

    formInscription.addEventListener('submit', async (evenement) => {
      evenement.preventDefault();
      masquerErreur();
      const password = passwordInput.value;

      if (!isStrong(password)) {
        passwordStrengthError.classList.add('active');
        return;
      }
      if (password !== confirmPasswordInput.value) {
        passwordMatchError.classList.add('active');
        return;
      }

      const bouton = formInscription.querySelector('button[type="submit"]');
      bouton.disabled = true;
      try {
        await window.Luna.api('/api/auth/register', {
          body: {
            nom: document.getElementById('lastname').value,
            prenom: document.getElementById('firstname').value,
            email: document.getElementById('email').value,
            telephone: document.getElementById('phone').value,
            sexe: document.getElementById('gender').value,
            date_naissance: birthdate.value,
            mot_de_passe: password,
            confirmation: confirmPasswordInput.value
          }
        });
        window.location.href = destination;
      } catch (erreur) {
        afficherErreur(erreur.message);
        bouton.disabled = false;
      }
    });
  }
})();
