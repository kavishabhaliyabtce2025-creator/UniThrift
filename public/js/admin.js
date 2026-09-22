'use strict';
/* Admin dashboard wiring – live moderation queue + management panels */
(() => {
  const CT = window.CT;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let st = { stats: null, pending: [], listings: [], users: [], orders: [], rentals: [], reports: [], categories: [] };

  const typeLabel = (t) => (t === 'SALE' ? 'DIRECT SALE' : t === 'RENT' ? 'RENTAL' : 'SALE + RENT');
  const priceOf = (l) => (l.salePrice != null ? CT.money(l.salePrice) : (CT.money(l.rentPrice) + '/day'));
  const imgOf = (l) => (l.images && l.images[0] && l.images[0].image_url) || `https://picsum.photos/seed/ct-${l.id}/600/450`;

  // ---------------- stat cards ----------------
  function renderStats() {
    const s = st.stats;
    if (!s) return;
    const section = $$('section.grid').find((x) => x.className.includes('lg:grid-cols-6'));
    if (section) {
      $$(':scope > div', section).forEach((card) => {
        const labelEl = $('span', card.querySelector(':scope > div'));
        const label = labelEl ? labelEl.textContent.trim() : '';
        const valueEl = $('.font-headline-xl', card);
        const footerEl = card.querySelector(':scope > div:last-child');
        const footSpan = footerEl ? $$('span', footerEl).pop() : null;
        if (label === 'Registered') { if (valueEl) valueEl.textContent = s.students; }
        else if (label === 'Active Stock') {
          if (valueEl) valueEl.textContent = s.activeListings;
          const avail = st.listings.filter((l) => l.status === 'AVAILABLE');
          const sale = avail.filter((l) => ['SALE', 'BOTH'].includes(l.type)).length;
          const rent = avail.filter((l) => ['RENT', 'BOTH'].includes(l.type)).length;
          if (footSpan) footSpan.textContent = `${sale} Sale / ${rent} Rent`;
        }
        else if (label === 'Pending Review') { if (valueEl) valueEl.textContent = s.pendingListings; if (footSpan) footSpan.textContent = 'Awaiting moderation'; }
        else if (label === 'Circulating') { if (valueEl) valueEl.textContent = s.activeRentals; if (footSpan) footSpan.textContent = `${s.pendingRentals} requests · ${s.overdueRentals} overdue`; }
        else if (label === 'Open Incidents') { if (valueEl) valueEl.textContent = s.openReports; if (footSpan) footSpan.textContent = `${s.totalReports} total filed`; }
        else if (label === 'Term Turnover') { if (valueEl) valueEl.textContent = CT.money(s.salesVolume); if (footSpan) footSpan.textContent = `${s.completedSales} sales completed`; }
      });
    }
    // DBMS drawer mini-cards
    $$('div.bg-surface-container').forEach((card) => {
      const labelEl = $('span', $(':scope > div', card));
      const label = labelEl ? labelEl.textContent.trim() : '';
      const valueEl = $('.font-headline-sm', card);
      if (label === 'Hold Triggers' && valueEl) valueEl.textContent = `${s.pendingRentals} Pending Holds`;
      if (label === 'Dispute Log Vault' && valueEl) valueEl.textContent = `${s.openReports} Open Reports`;
    });
    // queue badge
    const badge = $$('span').find((x) => /Submissions/.test(x.textContent) && x.textContent.trim().endsWith('Submissions'));
    if (badge) badge.textContent = `${s.pendingListings} Submissions`;
  }

  // ---------------- moderation queue ----------------
  function renderQueue() {
    const tbody = $('#queue-body');
    if (!tbody) return;
    const rows = st.pending;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-on-surface-variant font-body-md">No submissions pending approval — everything is moderated. 🎉</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((l) => `
    <tr class="hover:bg-surface-container/60 transition-colors group" data-id="${l.id}">
      <td class="py-3.5 px-4">
        <div class="flex items-center gap-3">
          <img class="w-12 h-14 object-cover rounded shadow flex-shrink-0 ring-1 ring-outline-variant/40" src="${imgOf(l)}" alt="">
          <div class="min-w-0">
            <span class="font-label-lg text-white font-semibold block truncate">${esc(l.product.name)}</span>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="px-1.5 py-0.5 bg-surface-container-high border border-outline-variant/40 text-primary font-label-sm text-[11px] rounded">${esc(l.category || '')}</span>
              <span class="font-body-sm text-[12px] text-on-surface-variant truncate">${esc(l.product.author || l.product.condition || '')}</span>
            </div>
          </div>
        </div>
      </td>
      <td class="py-3.5 px-4">
        <div>
          <p class="font-label-lg text-white font-medium">${esc(l.seller.name)}</p>
          <p class="font-body-sm text-body-sm text-on-surface-variant">${esc(l.seller.department || '')} · ${esc(l.seller.year || '')}</p>
        </div>
      </td>
      <td class="py-3.5 px-4">
        <div class="flex flex-col">
          <span class="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-label-sm text-[10px] uppercase font-bold w-max mb-1">${typeLabel(l.type)}</span>
          <span class="font-headline-sm text-headline-sm text-white font-bold">${priceOf(l)}</span>
          <span class="font-body-sm text-body-sm text-on-surface-variant">Condition: ${esc(l.product.condition)}</span>
        </div>
      </td>
      <td class="py-3.5 px-4">
        <div class="flex items-center gap-1.5">
          <span class="material-symbols-outlined text-primary text-[18px]">meeting_room</span>
          <span class="font-body-sm text-body-sm text-on-surface">${esc(l.location)}</span>
        </div>
      </td>
      <td class="py-3.5 px-4"><span class="font-body-sm text-body-sm text-on-surface">${esc((l.createdAt || '').slice(0, 16).replace('T', ' '))}</span></td>
      <td class="py-3.5 px-4 text-right">
        <div class="flex items-center justify-end gap-1.5">
          <button class="px-2.5 py-1 rounded bg-emerald-600/90 text-white hover:bg-emerald-500 font-label-md text-label-md transition-all flex items-center gap-1 shadow-sm" onclick="approveRow(this)">
            <span class="material-symbols-outlined text-[16px]">check</span> Approve
          </button>
          <button class="px-2.5 py-1 rounded bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600 hover:text-white font-label-md text-label-md transition-all flex items-center gap-1" onclick="openRejectModal(this)">
            <span class="material-symbols-outlined text-[16px]">close</span> Reject
          </button>
        </div>
      </td>
    </tr>`).join('');
  }

  // ---------------- extra management panels ----------------
  function renderExtra() {
    const main = document.querySelector('main');
    if (!main) return;
    let box = $('#ct-admin-extra');
    if (!box) {
      box = document.createElement('div');
      box.id = 'ct-admin-extra';
      box.className = 'max-w-7xl mx-auto px-4 w-full pb-12';
      main.appendChild(box);
    }

    const users = st.users.map((u) => `
      <tr class="border-t border-outline-variant/20">
        <td class="py-2.5 px-3 font-medium text-on-surface">${esc(u.name)}</td>
        <td class="py-2.5 px-3 text-on-surface-variant text-[13px]">${esc(u.email)}</td>
        <td class="py-2.5 px-3 text-on-surface-variant text-[13px]">${esc(u.studentId)}</td>
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">${esc(u.department)} · ${esc(u.year)}</td>
        <td class="py-2.5 px-3 text-[13px]">${CT.statusChip(u.status)}</td>
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant text-center">${u.listings}</td>
        <td class="py-2.5 px-3 text-[13px] text-center">${u.role === 'ADMIN' ? '<span class="text-primary text-[11px] font-bold uppercase">Admin</span>' : (u.status === 'ACTIVE'
          ? `<button class="px-2 py-1 rounded bg-rose-600/20 border border-rose-500/30 text-rose-300 hover:bg-rose-600 hover:text-white text-[12px]" data-act="user-block" data-id="${u.id}">Block</button>`
          : `<button class="px-2 py-1 rounded bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white text-[12px]" data-act="user-block" data-id="${u.id}">Activate</button>`)}</td>
      </tr>`).join('');

    const orders = st.orders.map((o) => `
      <tr class="border-t border-outline-variant/20">
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">#${o.id}</td>
        <td class="py-2.5 px-3 font-medium text-on-surface">${esc(o.listing.product.name)}</td>
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">${esc(o.buyer.name)} <span class="text-outline">(${esc(o.buyer.dept)})</span></td>
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">${esc(o.listing.seller.name)}</td>
        <td class="py-2.5 px-3 font-semibold text-on-surface">${CT.money(o.amount)}</td>
        <td class="py-2.5 px-3">${CT.statusChip(o.status)}</td>
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">${esc(o.paymentStatus || '')} · ${esc(o.paymentMethod || '')}</td>
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">${esc((o.date || '').slice(0, 10))}</td>
      </tr>`).join('');

    const rentals = st.rentals.map((r) => `
      <tr class="border-t border-outline-variant/20">
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">#${r.id}</td>
        <td class="py-2.5 px-3 font-medium text-on-surface">${esc(r.listing.product.name)}</td>
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">${esc(r.renter.name)} <span class="text-outline">(${esc(r.renter.dept)})</span></td>
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">${esc(r.startDate)} → ${esc(r.returnDate)}</td>
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">${CT.money(r.pricePerDay)}/day · dep ${CT.money(r.deposit)}</td>
        <td class="py-2.5 px-3 font-semibold text-on-surface">${CT.money(r.totalAmount)}</td>
        <td class="py-2.5 px-3">${CT.statusChip(r.status)}</td>
      </tr>`).join('');

    const reports = st.reports.map((r) => `
      <tr class="border-t border-outline-variant/20">
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">#${r.report_id}</td>
        <td class="py-2.5 px-3 font-medium text-on-surface">${esc(r.listing_name)} <span class="text-outline text-[11px]">by ${esc(r.seller_name)}</span></td>
        <td class="py-2.5 px-3 text-[13px] text-on-surface-variant">${esc(r.reporter)}</td>
        <td class="py-2.5 px-3 text-[13px]"><span class="text-amber-300">${esc(r.reason)}</span><br><span class="text-on-surface-variant text-[12px]">${esc(r.description || '')}</span></td>
        <td class="py-2.5 px-3">${CT.statusChip(r.status)}</td>
        <td class="py-2.5 px-3"><div class="flex gap-1.5">
          <button class="px-2 py-1 rounded bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white text-[12px]" data-act="report" data-id="${r.report_id}" data-status="RESOLVE">Resolve</button>
          <button class="px-2 py-1 rounded bg-slate-500/20 border border-slate-500/30 text-slate-300 hover:bg-slate-600 hover:text-white text-[12px]" data-act="report" data-id="${r.report_id}" data-status="DISMISS">Dismiss</button>
        </div></td>
      </tr>`).join('');

    const cats = st.categories.map((c) => `
      <div class="flex items-center justify-between py-2 border-b border-outline-variant/20 last:border-0">
        <div>
          <p class="font-label-md text-on-surface">${esc(c.category_name)}</p>
          <p class="text-[12px] text-on-surface-variant">${c.product_count || 0} products</p>
        </div>
        <button class="px-2 py-1 rounded bg-rose-600/20 border border-rose-500/30 text-rose-300 hover:bg-rose-600 hover:text-white text-[12px]" data-act="cat-del" data-id="${c.category_id}">Delete</button>
      </div>`).join('');

    const panel = (title, count, head, body, extra) => `
      <div class="bg-surface-container-low border border-outline-variant/30 rounded-lg overflow-hidden mb-6">
        <div class="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface">
          <h2 class="font-headline-sm text-headline-sm text-white font-semibold">${title}</h2>
          <span class="px-2.5 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary font-label-sm text-[11px]">${count}</span>
        </div>
        ${extra || ''}
        <div class="overflow-x-auto"><table class="w-full text-sm">${head}${body}</table></div>
      </div>`;

    const th = (label) => `<th class="py-2 px-3 text-left font-label-md text-[11px] uppercase tracking-wider text-outline">${label}</th>`;

    box.innerHTML = `
      ${panel('Registered Students & Accounts', st.users.length,
        `<thead><tr>${th('Name')}${th('Email')}${th('Student ID')}${th('Dept · Year')}${th('Status')}${th('Listings')}${th('Manage')}</tr></thead><tbody>${users}</tbody>`)}
      ${panel('All Orders (Buy Flow)', st.orders.length,
        `<thead><tr>${th('ID')}${th('Item')}${th('Buyer')}${th('Seller')}${th('Amount')}${th('Status')}${th('Payment')}${th('Date')}</tr></thead><tbody>${orders}</tbody>`)}
      ${panel('All Rentals (Date-Ledger)', st.rentals.length,
        `<thead><tr>${th('ID')}${th('Item')}${th('Renter')}${th('Period')}${th('Rate · Deposit')}${th('Total')}${th('Status')}</tr></thead><tbody>${rentals}</tbody>`)}
      ${panel('Dispute / Report Vault', st.reports.length,
        `<thead><tr>${th('ID')}${th('Listing')}${th('Reporter')}${th('Reason')}${th('Status')}${th('Actions')}</tr></thead><tbody>${reports}</tbody>`,
        `<div class="p-4 bg-surface-container-lowest border-b border-outline-variant/20 flex gap-2 items-center">
          <input id="ct-new-cat" class="flex-1 bg-surface-container px-3 py-2 rounded text-sm text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary" placeholder="Add a new category…">
          <button class="px-3 py-2 bg-primary text-white rounded text-sm" data-act="cat-add">Add Category</button>
        </div>
        <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">${cats}</div>`)}
      <p class="text-center text-[12px] text-outline pb-4">UniThrift Admin Console · all mutations go through the JSON API and are reflected instantly across the marketplace.</p>`;

    box.addEventListener('click', onAction);
  }

  async function onAction(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = +btn.dataset.id;
    try {
      if (act === 'user-block') {
        const u = st.users.find((x) => x.id === id);
        await CT.api(`/api/admin/users/${id}`, { method: 'PATCH', body: { status: u && u.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE' } });
      } else if (act === 'report') {
        await CT.api(`/api/admin/reports/${id}`, { method: 'PATCH', body: { action: btn.dataset.status } });
      } else if (act === 'cat-del') {
        await CT.api(`/api/admin/categories/${id}`, { method: 'DELETE' });
      } else if (act === 'cat-add') {
        const input = $('#ct-new-cat');
        const name = input ? input.value.trim() : '';
        if (!name) { CT.showToast('Enter a category name.', true); return; }
        await CT.api('/api/admin/categories', { body: { name } });
        input.value = '';
      }
      CT.showToast('Done.');
      refresh();
    } catch (err) {
      CT.showToast(err.message, true);
    }
  }

  // ---------------- overrides for inline page functions ----------------
  let __rejectId = null;
  window.approveRow = async (btn) => {
    const rowEl = btn.closest('tr');
    const id = +rowEl.dataset.id;
    try {
      await CT.api(`/api/admin/listings/${id}`, { method: 'PATCH', body: { action: 'APPROVE' } });
      CT.showToast('Listing approved — now live in the marketplace.');
      refresh();
    } catch (err) { CT.showToast(err.message, true); }
  };
  window.openRejectModal = (btn) => {
    const rowEl = btn.closest('tr');
    if (!rowEl) return;
    __rejectId = +rowEl.dataset.id;
    const labels = $$('.font-label-lg', rowEl);
    if ($('#modal-item-title')) $('#modal-item-title').textContent = labels[0] ? labels[0].textContent : 'Item';
    if ($('#modal-seller-name')) $('#modal-seller-name').textContent = labels[1] ? labels[1].textContent : 'Seller';
    const modal = $('#reject-modal');
    if (modal) modal.classList.remove('hidden');
  };
  window.closeRejectModal = () => { const m = $('#reject-modal'); if (m) m.classList.add('hidden'); };
  window.confirmRejection = async () => {
    if (!__rejectId) return;
    const reason = $('#rejection-reason') ? $('#rejection-reason').value : 'Unacceptable listing';
    const notes = $('#rejection-notes') ? $('#rejection-notes').value : '';
    try {
      await CT.api(`/api/admin/listings/${__rejectId}`, { method: 'PATCH', body: { action: 'REJECT' } });
      CT.showToast(`Listing rejected — ${reason}${notes ? ' · ' + notes : ''}`);
      window.closeRejectModal();
      refresh();
    } catch (err) { CT.showToast(err.message, true); }
  };

  // ---------------- boot ----------------
  async function refresh() {
    const [stat, pending, listings, users, orders, rentals, reports, categories] = await Promise.all([
      CT.api('/api/admin/stats'),
      CT.api('/api/admin/listings?status=PENDING'),
      CT.api('/api/admin/listings'),
      CT.api('/api/admin/users'),
      CT.api('/api/admin/orders'),
      CT.api('/api/admin/rentals'),
      CT.api('/api/admin/reports'),
      CT.api('/api/categories'),
    ]);
    st = { stats: stat.stats, pending: pending.listings, listings: listings.listings,
      users: users.users, orders: orders.orders, rentals: rentals.rentals,
      reports: reports.reports, categories: categories.categories };
    renderStats();
    renderQueue();
    renderExtra();
  }

  (async () => {
    const u = await CT.me(true);
    if (!u || u.role !== 'ADMIN') {
      CT.showToast('Admin access required.', true);
      setTimeout(() => { location.href = '/login.html'; }, 800);
      return;
    }
    try { await refresh(); } catch (err) { CT.showToast(err.message, true); }
  })();
})();