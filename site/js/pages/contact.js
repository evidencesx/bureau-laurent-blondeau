// contact.js — envoie le formulaire à la fonction serveur envoyer-message,
// qui l'enregistre (Administration > Messages) et le transmet par e-mail à Laurent.

import { baseConfiguree, fonction } from '../client.js';

const form = document.getElementById('form-contact');
const statut = document.getElementById('statut-contact');
const bouton = form.querySelector('button[type="submit"]');

function dire(texte, type) {
  statut.textContent = texte;
  statut.className = `formulaire__statut formulaire__statut--${type}`;
  statut.hidden = false;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  if (!baseConfiguree) {
    dire('Le formulaire n’est pas encore relié. En attendant, écrivez à evidencesx@gmail.com.', 'erreur');
    return;
  }
  bouton.disabled = true;
  bouton.textContent = 'Envoi…';
  try {
    await fonction('envoyer-message', Object.fromEntries(new FormData(form)));
    form.reset();
    dire('Merci, votre message est bien parti. Je vous réponds dès que possible.', 'ok');
  } catch (err) {
    dire(err.message || 'Le message n’a pas pu partir. Réessayez dans un instant.', 'erreur');
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Envoyer';
  }
});
