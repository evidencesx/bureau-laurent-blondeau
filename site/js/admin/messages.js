// messages.js — les messages du formulaire de contact.
// Ils arrivent aussi par e-mail chez Laurent ; ici, on garde la trace et on suit ce qui est traité.

import { echapper, dateHeure, toast, erreurLisible, confirmer } from './outils.js';

export async function vueMessages(ctx, filtre = 'actifs') {
  const { sb, vue } = ctx;
  let requete = sb.from('messages_contact').select('id, nom, email, sujet, message, statut, created_at').order('created_at', { ascending: false }).limit(300);
  requete = filtre === 'archives' ? requete.eq('statut', 'archive') : requete.in('statut', ['nouveau', 'traite']);
  const { data: messages, error } = await requete;
  if (error) throw error;

  vue.innerHTML = `
    <h1>Messages</h1>
    <nav class="filtres" aria-label="Filtrer">
      <a href="#messages/actifs"${filtre !== 'archives' ? ' aria-current="page"' : ''}>Reçus</a>
      <a href="#messages/archives"${filtre === 'archives' ? ' aria-current="page"' : ''}>Archivés</a>
    </nav>
    <ul class="cartes" id="liste-messages"></ul>`;
  const ul = vue.querySelector('#liste-messages');
  if (!messages.length) ul.innerHTML = '<li class="vide">Aucun message.</li>';

  for (const m of messages) {
    const li = document.createElement('li');
    li.className = `message-recu${m.statut === 'nouveau' ? ' message-recu--nouveau' : ''}`;
    const sujetReponse = encodeURIComponent(`Re : ${m.sujet || 'votre message'}`);
    li.innerHTML = `
      <div class="commande__tete">
        <div><b>${echapper(m.nom)}</b> · ${echapper(m.sujet || 'Autre')}<br><span class="petit">${dateHeure(m.created_at)} · ${echapper(m.email)}</span></div>
        ${m.statut === 'nouveau' ? '<span class="badge badge--alerte">Nouveau</span>' : m.statut === 'traite' ? '<span class="badge badge--ok">Traité</span>' : ''}
      </div>
      <p class="message-recu__texte"></p>
      <div class="ligne__actions">
        <a class="btn btn--clair" href="mailto:${echapper(m.email)}?subject=${sujetReponse}">Répondre</a>
        ${m.statut === 'nouveau' ? '<button class="lien" data-s="traite">Marquer comme traité</button>' : ''}
        ${m.statut !== 'archive' ? '<button class="lien" data-s="archive">Archiver</button>' : '<button class="lien" data-s="traite">Désarchiver</button>'}
        <button class="lien lien--danger" data-s="suppr">Supprimer</button>
      </div>`;
    li.querySelector('.message-recu__texte').textContent = m.message;
    li.addEventListener('click', async (e) => {
      const s = e.target.closest('[data-s]')?.dataset.s;
      if (!s) return;
      if (s === 'suppr') {
        if (!(await confirmer(`Supprimer le message de ${m.nom} ?`, { oui: 'Supprimer', danger: true }))) return;
        const { error: e1 } = await sb.from('messages_contact').delete().eq('id', m.id);
        if (e1) { toast(erreurLisible(e1), 'erreur'); return; }
      } else {
        const { error: e2 } = await sb.from('messages_contact').update({ statut: s }).eq('id', m.id);
        if (e2) { toast(erreurLisible(e2), 'erreur'); return; }
      }
      ctx.rafraichirPastilles();
      vueMessages(ctx, filtre);
    });
    ul.append(li);
  }
}
