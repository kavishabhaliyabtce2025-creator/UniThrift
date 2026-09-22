'use strict';
/* UniThrift – shared client helpers (loaded on every page) */
window.CT = (() => {
  let meCache = null;

  async function api(path, opts = {}) {
    const init = { credentials: 'same-origin', headers: {} };
    if (opts.body) {
      init.method = opts.method || 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    } else if (opts.method) {
      init.method = opts.method;
    }
    const res = await fetch(path, init);
    let data = null;
    try { data = await res.json(); } catch { /* no json */ }
    if (res.status === 401) meCache = null;
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  async function me(force = false) {
    if (meCache && !force) return meCache;
    try { const d = await api('/api/auth/me'); meCache = d.user; }
    catch { meCache = null; }
    return meCache;
  }

  const money = (n) => (n === null || n === undefined) ? '—' : `₹${(+n).toFixed(2).replace(/\.00$/, '')}`;

  const PAGE_MAP = {
    'marketplace': '/index.html',
    'browse': '/index.html',
    'product-details': '/product.html',
    'post-an-item': '/post.html',
    'admin-dashboard': '/admin.html',
    'my-rentals-and-orders': '/orders.html',
    'my-orders': '/orders.html',
    'my-rentals': '/rentals.html',
    'rentals': '/rentals.html',
    'wishlist': '/wishlist.html',
    'messages': '/messages.html',
    'profile': '/profile.html',
    'my-profile': '/profile.html',
    'login': '/login.html',
    'sign-in': '/login.html',
    'register': '/register.html',
    'sign-up': '/register.html',
  };

  function rewriteNav() {
    document.querySelectorAll('[data-path]').forEach((a) => {
      const key = a.getAttribute('data-path');
      a.href = PAGE_MAP[key] || (key === 'notifications' ? '/messages.html' : '/index.html');
    });
  }

  const STATUS_META = {
    PENDING: ['Pending', 'bg-amber-400/10 border border-amber-400/30 text-amber-300'],
    AVAILABLE: ['Available', 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'],
    RESERVED: ['Reserved', 'bg-blue-500/10 border border-blue-500/30 text-blue-300'],
    RENTED: ['Rented', 'bg-violet-500/10 border border-violet-500/30 text-violet-300'],
    SOLD: ['Sold', 'bg-slate-500/10 border border-slate-500/30 text-slate-400'],
    REJECTED: ['Rejected', 'bg-rose-500/10 border border-rose-500/30 text-rose-300'],
    REMOVED: ['Removed', 'bg-slate-500/10 border border-slate-500/30 text-slate-400'],
    OVERDUE: ['Overdue', 'bg-rose-500/10 border border-rose-500/30 text-rose-300'],
    ACCEPTED: ['Accepted', 'bg-blue-500/10 border border-blue-500/30 text-blue-300'],
    COMPLETED: ['Completed', 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'],
    CANCELLED: ['Cancelled', 'bg-slate-500/10 border border-slate-500/30 text-slate-400'],
    RETURNED: ['Returned', 'bg-slate-500/10 border border-slate-500/30 text-slate-400'],
    APPROVED: ['Approved', 'bg-blue-500/10 border border-blue-500/30 text-blue-300'],
    ACTIVE: ['Active', 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'],
    OPEN: ['Open', 'bg-amber-400/10 border border-amber-400/30 text-amber-300'],
    RESOLVED: ['Resolved', 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'],
    DISMISSED: ['Dismissed', 'bg-slate-500/10 border border-slate-500/30 text-slate-400'],
    BLOCKED: ['Blocked', 'bg-rose-500/10 border border-rose-500/30 text-rose-300'],
  };
  const statusChip = (s) => {
    const m = STATUS_META[s] || [s, 'bg-slate-500/10 border border-slate-500/30 text-slate-400'];
    return `<span class="px-2 py-0.5 rounded-full font-label-sm text-[10px] uppercase font-bold w-max ${m[1]}">${m[0]}</span>`;
  };

  const typeLabel = (t) => (t === 'BOTH' ? 'Buy / Rent' : t === 'SALE' ? 'Buy' : 'Rent');

  function cardHTML(l) {
    const img = (l.images && l.images[0] && l.images[0].image_url) || `https://picsum.photos/seed/ct-${l.id}/600/450`;
    const author = l.product.author || l.product.brand || l.product.condition;
    const price = l.salePrice != null ? money(l.salePrice) : null;
    const rent = l.rentPrice != null ? `${money(l.rentPrice)}/day` : null;
    const rating = l.avgRating != null ? l.avgRating.toFixed(1) : '—';
    return `
<article class="bg-[#1a1b21] border border-[#272a34] hover:border-primary/50 rounded-xl shadow-sm hover:shadow-[0_8px_30px_rgba(0,0,0,0.6)] transition-all flex flex-col group overflow-hidden cursor-pointer" data-goto="/product.html?id=${l.id}">
<div class="relative aspect-[4/3] overflow-hidden bg-[#0d0e13]">
<img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90 group-hover:opacity-100" loading="lazy" src="${img}" alt="${l.product.name}">
<div class="absolute top-2 left-2 flex flex-col gap-1">
<span class="bg-[#0d0e13]/90 border border-primary/40 text-primary font-badge-label text-badge-label px-2 py-0.5 rounded-full shadow-sm backdrop-blur">${l.product.condition}</span>
<span class="bg-primary-container text-white font-badge-label text-badge-label px-2 py-0.5 rounded-full shadow-sm">${typeLabel(l.type)}</span>
</div>
<button data-wish="${l.id}" aria-label="Save to Wishlist" class="wish-btn absolute top-2 right-2 w-8 h-8 rounded-full bg-[#0d0e13]/80 border border-[#272a34] backdrop-blur hover:bg-[#1a1b21] text-[#94a3b8] hover:text-red-400 flex items-center justify-center transition-colors">
<span class="material-symbols-outlined text-[18px]">bookmark</span>
</button>
<div class="absolute bottom-2 left-2 bg-[#0d0e13]/90 border border-[#272a34] px-2 py-0.5 rounded font-label-sm text-label-sm text-[#cbd5e1]">${l.seller.department || ''}</div>
</div>
<div class="p-4 flex-1 flex flex-col justify-between gap-3">
<div>
<h2 class="font-title-md text-title-md text-[#f8fafc] line-clamp-1 group-hover:text-primary transition-colors">${l.product.name}</h2>
<p class="font-body-sm text-body-sm text-[#94a3b8] truncate">${author || ''}</p>
<div class="mt-2 flex items-center gap-1.5 text-body-sm font-body-sm text-[#94a3b8]">
<span class="material-symbols-outlined text-[15px] text-primary">location_on</span>
<span class="truncate">${l.location || ''}</span>
</div>
</div>
<div class="pt-1 space-y-3">
<div class="flex items-baseline justify-between">
<div class="flex items-baseline gap-1">
<span class="font-headline-sm text-headline-sm text-primary font-bold">${price || ''}</span>
${rent ? `<span class="font-body-sm text-body-sm text-[#64748b]">${price ? 'or ' : ''}${rent}</span>` : ''}
</div>
<div class="flex items-center gap-1 font-label-sm text-label-sm text-[#cbd5e1]" title="${l.seller.name}">
<span class="material-symbols-outlined text-[14px] text-amber-400" style="font-variation-settings: 'FILL' 1;">star</span>
<span>${rating}</span>
<span class="text-[#64748b] truncate max-w-[80px]">(${l.seller.name.split(' ')[0]})</span>
</div>
</div>
<button class="view-btn w-full border border-primary/40 text-primary hover:bg-primary hover:text-white font-label-md text-label-md py-2 rounded-lg transition-all">View &amp; Reserve</button>
</div>
</div>
</article>`;
  }

  let toastTimer = null;
  function showToast(message, isErr = false) {
    let t = document.getElementById('ct-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ct-toast';
      t.className = 'ct-toast fixed bottom-6 right-6 z-[100] bg-[#1e1f25] border border-[#272a34] text-white px-4 py-2.5 rounded-lg shadow-2xl text-sm flex items-center gap-2 transition-all duration-300 translate-y-24 opacity-0';
      t.innerHTML = '<span class="material-symbols-outlined text-[18px] text-primary">check_circle</span><span class="ct-toast-msg font-body-md"></span>';
      document.body.appendChild(t);
    }
    t.querySelector('.material-symbols-outlined').textContent = isErr ? 'error' : 'check_circle';
    t.querySelector('.material-symbols-outlined').className = `material-symbols-outlined text-[18px] ${isErr ? 'text-rose-400' : 'text-primary'}`;
    t.querySelector('.ct-toast-msg').textContent = message || (isErr ? 'Something went wrong' : 'Done');
    t.classList.remove('translate-y-24', 'opacity-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('translate-y-24', 'opacity-0'), 2800);
  }

  async function updateWishBadge() {
    const badge = document.querySelector('a[data-path="wishlist"] .w-4');
    const u = await me();
    if (!badge) return;
    if (!u) { badge.style.display = 'none'; return; }
    try {
      const w = await api('/api/my/wishlist');
      badge.textContent = w.wishlist.length;
      badge.style.display = w.wishlist.length ? 'flex' : 'none';
    } catch { /* ignore */ }
  }

  async function toggleWish(listingId) {
    const u = await me();
    if (!u) { location.href = '/login.html'; return false; }
    try {
      const d = await api('/api/wishlist/' + listingId, { method: 'POST' });
      showToast('Saved to your wishlist.');
      updateWishBadge();
      return d.wishlisted;
    } catch (e) {
      // already wishlisted? try toggling off
      try { await api('/api/wishlist/' + listingId, { method: 'DELETE' }); showToast('Removed from wishlist.'); updateWishBadge(); }
      catch (e2) { showToast(e2.message || 'Could not update wishlist', true); }
      return false;
    }
  }

  async function initAuth() {
    const u = await me(true);
    const nameEl = document.querySelector('header .flex-col.text-right span');
    const subEl = nameEl ? nameEl.parentElement.querySelector('span:last-child') : null;
    const avatar = document.querySelector('header img[alt="Profile"]');
    const wishBadge = document.querySelector('a[data-path="wishlist"] .w-4');
    const adminLink = document.querySelector('a[data-path="admin-dashboard"]');

    if (u) {
      if (nameEl) nameEl.textContent = u.name;
      if (subEl) subEl.textContent = `${u.department} · ${u.year}`;
      if (avatar) { avatar.src = '/assets/avatar.png'; avatar.style.cursor = 'pointer'; avatar.onclick = () => { location.href = '/profile.html'; }; }
      if (adminLink) adminLink.style.display = u.role === 'ADMIN' ? '' : 'none';
      if (wishBadge) wishBadge.style.display = 'flex';
    } else {
      if (nameEl) nameEl.textContent = 'Guest';
      if (subEl) subEl.textContent = 'Sign in to continue';
      if (avatar) { avatar.src = '/assets/avatar.png'; avatar.style.cursor = 'pointer'; avatar.onclick = () => { location.href = '/login.html'; }; }
      if (adminLink) adminLink.style.display = 'none';
      if (wishBadge) wishBadge.style.display = 'none';
    }
    updateWishBadge();
  }

  function el(htmlStr) {
    const t = document.createElement('template');
    t.innerHTML = htmlStr.trim();
    return t.content.firstElementChild;
  }

  rewriteNav();
  initAuth();

  return { api, me, money, cardHTML, statusChip, showToast, updateWishBadge, toggleWish, initAuth, el };
})();