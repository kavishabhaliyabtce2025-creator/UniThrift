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
      tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400 font-semibold">No submissions pending approval — everything is moderated. 🎉</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((l) => `
    <tr class="hover:bg-slate-50/80 transition-colors group" data-id="${l.id}">
      <td class="py-3.5 px-4">
        <div class="flex items-center gap-3">
          <img class="w-12 h-14 object-cover rounded-xl shadow-2xs flex-shrink-0 border-2 border-slate-200" src="${imgOf(l)}" alt="">
          <div class="min-w-0">
            <span class="font-bold text-slate-900 block truncate text-xs">${esc(l.product.name)}</span>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold rounded-md">${esc(l.category || '')}</span>
              <span class="text-[11px] text-slate-500 truncate">${esc(l.product.author || l.product.condition || '')}</span>
            </div>
          </div>
        </div>
      </td>
      <td class="py-3.5 px-4">
        <div>
          <p class="font-bold text-slate-900 text-xs">${esc(l.seller.name)}</p>
          <p class="text-[11px] text-slate-500">${esc(l.seller.department || '')} · ${esc(l.seller.year || '')}</p>
        </div>
      </td>
      <td class="py-3.5 px-4">
        <div class="flex flex-col">
          <span class="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-[10px] font-bold uppercase w-max mb-1">${typeLabel(l.type)}</span>
          <span class="font-extrabold text-slate-900 text-xs">${priceOf(l)}</span>
          <span class="text-[11px] text-slate-500">Condition: ${esc(l.product.condition)}</span>
        </div>
      </td>
      <td class="py-3.5 px-4">
        <div class="flex items-center gap-1.5">
          <span class="material-symbols-outlined text-indigo-600 text-[16px]">location_on</span>
          <span class="text-xs font-medium text-slate-700">${esc(l.location)}</span>
        </div>
      </td>
      <td class="py-3.5 px-4"><span class="text-xs text-slate-500">${esc((l.createdAt || '').slice(0, 16).replace('T', ' '))}</span></td>
      <td class="py-3.5 px-4 text-right">
        <div class="flex items-center justify-end gap-1.5">
          <button class="px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold transition-all flex items-center gap-1 shadow-xs border border-emerald-700" onclick="approveRow(this)">
            <span class="material-symbols-outlined text-[15px]">check</span> Approve
          </button>
          <button class="px-3 py-1.5 rounded-xl bg-rose-50 border-2 border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-all flex items-center gap-1" onclick="openRejectModal(this)">
            <span class="material-symbols-outlined text-[15px]">close</span> Reject
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
      box.className = 'max-w-7xl mx-auto w-full pb-12';
      main.appendChild(box);
    }

    const users = st.users.map((u) => `
      <tr class="border-t-2 border-slate-100 hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-3.5 font-bold text-slate-900">${esc(u.name)}</td>
        <td class="py-3 px-3.5 text-slate-600 text-[12px]">${esc(u.email)}</td>
        <td class="py-3 px-3.5 text-slate-600 text-[12px] font-mono">${esc(u.studentId)}</td>
        <td class="py-3 px-3.5 text-[12px] text-slate-700">${esc(u.department)} · ${esc(u.year)}</td>
        <td class="py-3 px-3.5 text-[12px]">${CT.statusChip(u.status)}</td>
        <td class="py-3 px-3.5 text-[12px] text-slate-600 text-center font-bold">${u.listings}</td>
        <td class="py-3 px-3.5 text-[12px] text-center">${u.role === 'ADMIN' ? '<span class="text-indigo-700 bg-indigo-50 border border-indigo-300 px-2.5 py-0.5 rounded-md font-bold uppercase text-[10px]">Admin</span>' : (u.status === 'ACTIVE'
          ? `<button class="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 text-[11px] font-bold" data-act="user-block" data-id="${u.id}">Block</button>`
          : `<button class="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold" data-act="user-block" data-id="${u.id}">Activate</button>`)}</td>
      </tr>`).join('');

    const orders = st.orders.map((o) => `
      <tr class="border-t-2 border-slate-100 hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-3.5 text-[12px] text-slate-500 font-mono font-bold">#${o.id}</td>
        <td class="py-3 px-3.5 font-bold text-slate-900">${esc(o.listing.product.name)}</td>
        <td class="py-3 px-3.5 text-[12px] text-slate-700">${esc(o.buyer.name)} <span class="text-slate-400">(${esc(o.buyer.dept)})</span></td>
        <td class="py-3 px-3.5 text-[12px] text-slate-700">${esc(o.listing.seller.name)}</td>
        <td class="py-3 px-3.5 font-extrabold text-slate-900">${CT.money(o.amount)}</td>
        <td class="py-3 px-3.5">${CT.statusChip(o.status)}</td>
        <td class="py-3 px-3.5 text-[12px] text-slate-600">${esc(o.paymentStatus || '')} · ${esc(o.paymentMethod || '')}</td>
        <td class="py-3 px-3.5 text-[12px] text-slate-500">${esc((o.date || '').slice(0, 10))}</td>
      </tr>`).join('');

    const rentals = st.rentals.map((r) => `
      <tr class="border-t-2 border-slate-100 hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-3.5 text-[12px] text-slate-500 font-mono font-bold">#${r.id}</td>
        <td class="py-3 px-3.5 font-bold text-slate-900">${esc(r.listing.product.name)}</td>
        <td class="py-3 px-3.5 text-[12px] text-slate-700">${esc(r.renter.name)} <span class="text-slate-400">(${esc(r.renter.dept)})</span></td>
        <td class="py-3 px-3.5 text-[12px] text-slate-600">${esc(r.startDate)} → ${esc(r.returnDate)}</td>
        <td class="py-3 px-3.5 text-[12px] text-slate-700">${CT.money(r.pricePerDay)}/day · dep ${CT.money(r.deposit)}</td>
        <td class="py-3 px-3.5 font-extrabold text-slate-900">${CT.money(r.totalAmount)}</td>
        <td class="py-3 px-3.5">${CT.statusChip(r.status)}</td>
      </tr>`).join('');

    const reports = st.reports.map((r) => `
      <tr class="border-t-2 border-slate-100 hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-3.5 text-[12px] text-slate-500 font-mono font-bold">#${r.report_id}</td>
        <td class="py-3 px-3.5 font-bold text-slate-900">${esc(r.listing_name)} <span class="text-slate-500 font-normal text-[11px]">by ${esc(r.seller_name)}</span></td>
        <td class="py-3 px-3.5 text-[12px] text-slate-700">${esc(r.reporter)}</td>
        <td class="py-3 px-3.5 text-[12px]"><span class="text-amber-800 font-bold">${esc(r.reason)}</span><br><span class="text-slate-500 text-[11px]">${esc(r.description || '')}</span></td>
        <td class="py-3 px-3.5">${CT.statusChip(r.status)}</td>
        <td class="py-3 px-3.5"><div class="flex gap-1.5">
          <button class="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold" data-act="report" data-id="${r.report_id}" data-status="RESOLVE">Resolve</button>
          <button class="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 text-[11px] font-bold" data-act="report" data-id="${r.report_id}" data-status="DISMISS">Dismiss</button>
        </div></td>
      </tr>`).join('');

    const cats = st.categories.map((c) => `
      <div class="flex items-center justify-between p-3 rounded-xl border-2 border-slate-200/80 bg-slate-50/60 hover:border-indigo-300 transition-colors">
        <div>
          <p class="font-bold text-slate-900 text-xs">${esc(c.category_name)}</p>
          <p class="text-[11px] text-slate-500">${c.product_count || 0} products registered</p>
        </div>
        <button class="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 text-[11px] font-bold" data-act="cat-del" data-id="${c.category_id}">Delete</button>
      </div>`).join('');

    const panel = (title, count, head, body, extra) => `
      <div class="bg-white border-2 border-slate-200/90 rounded-2xl shadow-sm overflow-hidden mb-6">
        <div class="p-4 sm:p-5 border-b-2 border-slate-100 flex items-center justify-between">
          <h2 class="font-heading font-extrabold text-slate-900 text-sm sm:text-base">${title}</h2>
          <span class="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">${count}</span>
        </div>
        ${extra || ''}
        <div class="overflow-x-auto"><table class="w-full text-xs">${head}<tbody>${body}</tbody></table></div>
      </div>`;

    const th = (label) => `<th class="py-3 px-3.5 text-left font-bold text-[11px] uppercase tracking-wider text-slate-600 bg-slate-50/90 border-b-2 border-slate-200/90">${label}</th>`;

    box.innerHTML = `
      ${panel('Registered Students & Accounts', st.users.length,
        `<thead><tr>${th('Name')}${th('Email')}${th('Student ID')}${th('Dept · Year')}${th('Status')}${th('Listings')}${th('Manage')}</tr></thead>`, users)}
      ${panel('All Orders (Direct Purchases)', st.orders.length,
        `<thead><tr>${th('ID')}${th('Item')}${th('Buyer')}${th('Seller')}${th('Amount')}${th('Status')}${th('Payment')}${th('Date')}</tr></thead>`, orders)}
      ${panel('All Rentals (Circulation Ledger)', st.rentals.length,
        `<thead><tr>${th('ID')}${th('Item')}${th('Renter')}${th('Period')}${th('Rate · Deposit')}${th('Total')}${th('Status')}</tr></thead>`, rentals)}
      ${panel('Reports & Academic Categories', st.reports.length,
        `<thead><tr>${th('ID')}${th('Listing')}${th('Reporter')}${th('Reason')}${th('Status')}${th('Actions')}</tr></thead>`, reports,
        `<div class="p-4 bg-slate-50/70 border-b-2 border-slate-100 flex gap-2.5 items-center">
          <input id="ct-new-cat" class="flex-1 bg-white px-3.5 py-2 rounded-xl text-xs text-slate-800 border border-slate-300 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" placeholder="Add a new campus course category…">
          <button class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors border border-indigo-700 shrink-0" data-act="cat-add">Add Category</button>
        </div>
        <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-white">${cats}</div>`)}
      <p class="text-center text-[11px] text-slate-400 pb-4">UniThrift Campus Admin Console · Live Student Peer Marketplace</p>`;

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
    const labels = $$('.font-semibold', rowEl);
    if ($('#modal-item-title')) $('#modal-item-title').textContent = labels[0] ? labels[0].textContent : 'Item';
    if ($('#modal-seller-name')) {
      const p = rowEl.querySelector('td:nth-child(2) p');
      $('#modal-seller-name').textContent = p ? p.textContent : 'Seller';
    }
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