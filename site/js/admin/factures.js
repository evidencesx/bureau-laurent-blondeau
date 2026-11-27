// factures.js — factures et avoirs : consulter, télécharger en PDF, émettre un avoir, exporter.
//
// Une facture est émise automatiquement au paiement (fonction « documents »). Elle ne se
// modifie pas et ne se supprime pas : en cas de retour ou de remboursement, on émet un
// avoir, sur tout ou partie de la facture, et il peut y en avoir plusieurs.
//
// Le montant d'un avoir n'est jamais calculé ici : la page dit quels livres elle reprend,
// la base relit les prix de la facture et fait l'addition (emettre_avoir).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { euros, echapper, dateFr, toast, erreurLisible, confirmer } from './outils.js';

const filtres = { du: '', au: '', texte: '' };
let ongletActif = 'factures';
const jourLocal = (iso) => new Date(iso).toLocaleDateString('sv-SE');

async function appelerDocuments(ctx, corps) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/documents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${ctx.session.access_token}` },
    body: JSON.stringify(corps),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erreur || `Erreur ${r.status}`);
  return d;
}

// Ouvre le PDF dans un nouvel onglet (lien temporaire vers le coffre privé).
async function ouvrirPdf(ctx, sorte, doc) {
  const fenetre = window.open('', '_blank'); // ouverte tout de suite, sinon le navigateur la bloque
  try {
    let chemin = doc.pdf_chemin;
    if (!chemin) {
      const d = await appelerDocuments(ctx, sorte === 'facture' ? { type: 'facture', facture_id: doc.id } : { type: 'avoir', avoir_id: doc.id });
      chemin = d.chemin;
      doc.pdf_chemin = chemin;
    }
    const { data, error } = await ctx.sb.storage.from('documents').createSignedUrl(chemin, 300);
    if (error) throw error;
    if (fenetre) fenetre.location.href = data.signedUrl; else location.href = data.signedUrl;
  } catch (err) {
    fenetre?.close();
    toast(erreurLisible(err), 'erreur');
  }
}

function correspond(date, champs) {
  const jour = jourLocal(date);
  if (filtres.du && jour < filtres.du) return false;
  if (filtres.au && jour > filtres.au) return false;
  if (filtres.texte) {
    const t = filtres.texte.toLowerCase();
    if (!champs.some((x) => String(x || '').toLowerCase().includes(t))) return false;
  }
  return true;
}

function exporterCsv(factures, avoirs) {
  const cellule = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const montant = (c) => (c / 100).toFixed(2).replace('.', ',');
  const lignes = [['Type', 'Numéro', 'Date', 'Commande', 'Client', 'Facture d’origine', 'Total HT', 'TVA', 'Total TTC']];
  for (const f of factures) lignes.push(['Facture', f.numero, jourLocal(f.emise_le), f.commande_numero, f.client?.nom, '', montant(f.total_ht_cents), montant(f.tva_cents), montant(f.total_ttc_cents)]);
  for (const a of avoirs) lignes.push(['Avoir', a.numero, jourLocal(a.emis_le), a.factures?.commande_numero, a.factures?.client?.nom, a.factures?.numero, montant(-a.total_ht_cents), montant(-a.tva_cents), montant(-a.total_ttc_cents)]);
  lignes.sort((x, y) => (x[2] + x[1]).localeCompare(y[2] + y[1]));
  const csv = '﻿' + lignes.map((l) => l.map(cellule).join(';')).join('\r\n'); // ; et BOM : Excel en français l'ouvre tel quel
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `factures-avoirs${filtres.du ? '-du-' + filtres.du : ''}${filtres.au ? '-au-' + filtres.au : ''}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function vueFactures(ctx) {
  const { sb, vue } = ctx;
  const [rf, ra] = await Promise.all([
    sb.from('factures').select('id, numero, emise_le, commande_numero, client, total_ttc_cents, tva_cents, total_ht_cents, pdf_chemin').order('emise_le', { ascending: false }).limit(2000),
    sb.from('avoirs').select('id, numero, emis_le, motif, facture_id, total_ttc_cents, tva_cents, total_ht_cents, pdf_chemin, factures(numero, commande_numero, client)').order('emis_le', { ascending: false }).limit(2000),
  ]);
  if (rf.error) throw rf.error;
  if (ra.error) throw ra.error;
  const factures = rf.data;
  const avoirs = ra.data;

  vue.innerHTML = `
    <h1>Factures et avoirs</h1>
    <p class="petit">Une facture est émise automatiquement à chaque paiement et jointe au récapitulatif du client. Elle ne se modifie pas : pour un retour ou un remboursement, on émet un avoir.</p>
    <form class="filtres-generaux" id="filtres" autocomplete="off">
      <label>Du<input type="date" name="du" value="${filtres.du}"></label>
      <label>Au<input type="date" name="au" value="${filtres.au}"></label>
      <label class="filtres-generaux__texte">Recherche<input type="search" name="texte" placeholder="N° de facture ou de commande, client" value="${echapper(filtres.texte)}"></label>
      <button type="reset" class="lien">Effacer les filtres</button>
      <button type="button" class="btn btn--clair" id="exporter">Exporter pour le comptable (CSV)</button>
    </form>
    <nav class="filtres" aria-label="Documents" id="onglets-docs">
      <button type="button" data-onglet="factures">Factures <span class="compteur" data-compteur="factures">0</span></button>
      <button type="button" data-onglet="avoirs">Avoirs <span class="compteur" data-compteur="avoirs">0</span></button>
    </nav>
    <p class="petit" id="bilan"></p>
    <ul class="cartes" id="liste-docs"></ul>`;

  const form = vue.querySelector('#filtres');
  const ul = vue.querySelector('#liste-docs');
  const bilan = vue.querySelector('#bilan');
  const avoirsDe = (f) => avoirs.filter((a) => a.facture_id === f.id);

  const filtrees = () => ({
    f: factures.filter((f) => correspond(f.emise_le, [f.numero, f.commande_numero, f.client?.nom, f.client?.email])),
    a: avoirs.filter((a) => correspond(a.emis_le, [a.numero, a.factures?.numero, a.factures?.commande_numero, a.factures?.client?.nom])),
  });

  function rendre() {
    const { f, a } = filtrees();
    vue.querySelector('[data-compteur="factures"]').textContent = f.length;
    vue.querySelector('[data-compteur="avoirs"]').textContent = a.length;
    vue.querySelectorAll('[data-onglet]').forEach((b) => b.toggleAttribute('aria-current', b.dataset.onglet === ongletActif));
    const somme = (l, k) => l.reduce((s, x) => s + x[k], 0);
    const net = somme(f, 'total_ttc_cents') - somme(a, 'total_ttc_cents');
    bilan.textContent = `Factures ${euros(somme(f, 'total_ttc_cents'))} TTC (dont TVA ${euros(somme(f, 'tva_cents'))}) · Avoirs ${euros(somme(a, 'total_ttc_cents'))} · Net ${euros(net)} TTC, dont TVA ${euros(somme(f, 'tva_cents') - somme(a, 'tva_cents'))}`;

    const liste = ongletActif === 'factures' ? f : a;
    ul.replaceChildren(...liste.map((d) => (ongletActif === 'factures' ? carteFacture(d) : carteAvoir(d))));
    if (!liste.length) ul.innerHTML = `<li class="vide">${ongletActif === 'factures' ? 'Aucune facture' : 'Aucun avoir'}${Object.values(filtres).some(Boolean) ? ' pour ces filtres' : ''}.</li>`;
  }

  function carteFacture(f) {
    const li = document.createElement('li');
    li.className = 'document';
    const lies = avoirsDe(f);
    const repris = lies.reduce((s, a) => s + a.total_ttc_cents, 0);
    li.innerHTML = `
      <div class="document__tete">
        <div><b>${echapper(f.numero)}</b> · ${dateFr(f.emise_le)}<br>
          <span class="petit">Commande ${echapper(f.commande_numero)} · ${echapper(f.client?.nom || '')}</span></div>
        <div class="document__montant"><b>${euros(f.total_ttc_cents)}</b><br><span class="petit">dont TVA ${euros(f.tva_cents)}</span></div>
      </div>
      ${lies.length ? `<p class="petit">${lies.map((a) => `Avoir ${echapper(a.numero)} · ${euros(a.total_ttc_cents)}`).join(' · ')}${repris >= f.total_ttc_cents ? ' · <b>entièrement remboursée</b>' : ''}</p>` : ''}
      <div class="document__actions">
        <button class="btn btn--clair" data-a="pdf">Facture PDF</button>
        ${repris < f.total_ttc_cents ? '<button class="lien" data-a="avoir">Émettre un avoir</button>' : ''}
      </div>
      <div class="document__avoir" hidden></div>`;
    li.querySelector('[data-a="pdf"]').addEventListener('click', () => ouvrirPdf(ctx, 'facture', f));
    li.querySelector('[data-a="avoir"]')?.addEventListener('click', () => formulaireAvoir(li.querySelector('.document__avoir'), f));
    return li;
  }

  function carteAvoir(a) {
    const li = document.createElement('li');
    li.className = 'document document--avoir';
    li.innerHTML = `
      <div class="document__tete">
        <div><b>${echapper(a.numero)}</b> · ${dateFr(a.emis_le)}<br>
          <span class="petit">Sur la facture ${echapper(a.factures?.numero || '')} · commande ${echapper(a.factures?.commande_numero || '')} · ${echapper(a.factures?.client?.nom || '')}</span></div>
        <div class="document__montant"><b>− ${euros(a.total_ttc_cents)}</b><br><span class="petit">dont TVA ${euros(a.tva_cents)}</span></div>
      </div>
      ${a.motif ? `<p class="petit">Motif : ${echapper(a.motif)}</p>` : ''}
      <div class="document__actions"><button class="btn btn--clair" data-a="pdf">Avoir PDF</button></div>`;
    li.querySelector('[data-a="pdf"]').addEventListener('click', () => ouvrirPdf(ctx, 'avoir', a));
    return li;
  }

  async function formulaireAvoir(zone, f) {
    if (!zone.hidden) { zone.hidden = true; return; }
    zone.hidden = false;
    zone.innerHTML = '<p class="chargement">Chargement…</p>';
    const { data: reste, error } = await sb.rpc('reste_avoirable', { p_facture_id: f.id });
    if (error) { zone.innerHTML = `<p class="message message--erreur">${echapper(erreurLisible(error))}</p>`; return; }
    zone.innerHTML = `
      <form class="ajout ajout--colonne">
        <p><b>Avoir sur la facture ${echapper(f.numero)}</b> · indiquez ce qui est repris.</p>
        ${reste.lignes.map((l) => `
          <label class="avoir__ligne">${echapper(l.designation)} · ${euros(l.pu_ttc_cents)} l’unité
            <span class="petit">${l.reprenable} sur ${l.quantite} encore reprenable${l.reprenable > 1 ? 's' : ''}</span>
            <input type="number" min="0" max="${l.reprenable}" value="${l.reprenable}" data-index="${l.index}" ${l.reprenable ? '' : 'disabled'}>
          </label>`).join('')}
        ${reste.livraison_reprenable ? `<label class="interrupteur"><input type="checkbox" name="livraison" checked> Rembourser aussi la livraison (${euros(reste.livraison_cents)})</label>
          <p class="petit">La livraison se rembourse en cas de rétractation ou d’annulation complète, pas pour un retour partiel.</p>` : ''}
        <label>Motif<input name="motif" placeholder="Rétractation, livre abîmé, commande annulée…" maxlength="200"></label>
        <p class="avoir__total"></p>
        <div class="deux-boutons"><button class="btn" type="submit">Émettre l’avoir</button><button class="lien" type="button" data-a="fermer">Annuler</button></div>
      </form>`;
    const form = zone.querySelector('form');
    const totalEl = zone.querySelector('.avoir__total');
    const calcul = () => {
      let t = 0;
      zone.querySelectorAll('[data-index]').forEach((i) => {
        const l = reste.lignes.find((x) => String(x.index) === i.dataset.index);
        t += l.pu_ttc_cents * Math.max(0, Math.min(+i.value || 0, l.reprenable));
      });
      if (form.livraison?.checked) t += reste.livraison_cents;
      totalEl.textContent = `Montant de l’avoir : ${euros(t)} TTC`;
      return t;
    };
    form.addEventListener('input', calcul);
    calcul();
    zone.querySelector('[data-a="fermer"]').addEventListener('click', () => { zone.hidden = true; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const total = calcul();
      if (total <= 0) { toast('Choisissez au moins un livre ou la livraison.', 'erreur'); return; }
      const ok = await confirmer(`Émettre un avoir de ${euros(total)} sur la facture ${f.numero} ? Un avoir ne se modifie plus et ne se supprime pas. Pensez à rembourser le client dans Stripe.`, { oui: 'Émettre l’avoir' });
      if (!ok) return;
      const bouton = form.querySelector('[type="submit"]');
      bouton.disabled = true;
      try {
        const lignes = [...zone.querySelectorAll('[data-index]')].map((i) => ({ index: +i.dataset.index, quantite: +i.value || 0 })).filter((l) => l.quantite > 0);
        const { data: avoir, error: e1 } = await sb.rpc('emettre_avoir', {
          p_facture_id: f.id, p_motif: form.motif.value, p_lignes: lignes, p_inclut_livraison: Boolean(form.livraison?.checked),
        });
        if (e1) throw e1;
        // Le PDF est fabriqué tout de suite, pour qu'il soit prêt au téléchargement.
        await appelerDocuments(ctx, { type: 'avoir', avoir_id: avoir.id }).catch((err) => console.error(err));
        toast(`Avoir ${avoir.numero} émis.`);
        ongletActif = 'avoirs';
        await vueFactures(ctx);
      } catch (err) {
        toast(erreurLisible(err), 'erreur');
        bouton.disabled = false;
      }
    });
  }

  vue.querySelector('#onglets-docs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-onglet]');
    if (!b) return;
    ongletActif = b.dataset.onglet;
    rendre();
  });
  form.addEventListener('input', () => {
    const d = new FormData(form);
    for (const k of Object.keys(filtres)) filtres[k] = String(d.get(k) || '').trim();
    rendre();
  });
  form.addEventListener('reset', () => { for (const k of Object.keys(filtres)) filtres[k] = ''; setTimeout(rendre); });
  form.addEventListener('submit', (e) => e.preventDefault());
  vue.querySelector('#exporter').addEventListener('click', () => { const { f, a } = filtrees(); exporterCsv(f, a); });

  rendre();
}
