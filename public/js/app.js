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
    const currentPath = location.pathname;
    document.querySelectorAll('[data-path]').forEach((a) => {
      const key = a.getAttribute('data-path');
      const targetHref = PAGE_MAP[key] || (key === 'notifications' ? '/messages.html' : '/index.html');
      a.href = targetHref;

      // Active state styling if it's a nav link in the header nav
      if (a.closest('nav') && !a.classList.contains('admin-link')) {
        const isCurrent = 
          (targetHref === '/index.html' && (currentPath === '/' || currentPath.endsWith('/index.html') || currentPath.endsWith('/browse.html'))) ||
          (targetHref !== '/index.html' && currentPath.endsWith(targetHref));

        if (isCurrent) {
          a.className = 'px-3.5 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold transition-all rounded-xl shadow-xs';
        } else {
          a.className = 'px-3.5 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all rounded-xl';
        }
      }
    });
  }

  const STATUS_META = {
    PENDING: ['Pending', 'bg-amber-50 border border-amber-200 text-amber-800'],
    AVAILABLE: ['Available', 'bg-emerald-50 border border-emerald-200 text-emerald-700'],
    RESERVED: ['Reserved', 'bg-indigo-50 border border-indigo-200 text-indigo-700'],
    RENTED: ['Rented', 'bg-purple-50 border border-purple-200 text-purple-700'],
    SOLD: ['Sold', 'bg-slate-100 border border-slate-200 text-slate-600'],
    REJECTED: ['Rejected', 'bg-rose-50 border border-rose-300 text-rose-800 font-bold'],
    REMOVED: ['Removed', 'bg-slate-100 border border-slate-300 text-slate-700'],
    OVERDUE: ['Overdue', 'bg-rose-50 border border-rose-300 text-rose-800 font-bold'],
    ACCEPTED: ['Accepted', 'bg-indigo-50 border border-indigo-300 text-indigo-800 font-bold'],
    COMPLETED: ['Completed', 'bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold'],
    CANCELLED: ['Cancelled', 'bg-slate-100 border border-slate-300 text-slate-700'],
    RETURNED: ['Returned', 'bg-slate-100 border border-slate-300 text-slate-700'],
    APPROVED: ['Approved', 'bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold'],
    ACTIVE: ['Active', 'bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold'],
    OPEN: ['Open', 'bg-amber-50 border border-amber-300 text-amber-900 font-bold'],
    RESOLVED: ['Resolved', 'bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold'],
    DISMISSED: ['Dismissed', 'bg-slate-100 border border-slate-300 text-slate-700'],
    BLOCKED: ['Blocked', 'bg-rose-50 border border-rose-300 text-rose-800 font-bold'],
  };
  const statusChip = (s) => {
    const m = STATUS_META[s] || [s, 'bg-slate-100 border border-slate-300 text-slate-700'];
    return `<span class="px-2 py-0.5 rounded-full font-label-sm text-[10px] uppercase font-bold w-max ${m[1]}">${m[0]}</span>`;
  };

  const typeLabel = (t) => (t === 'BOTH' ? 'Buy / Rent' : t === 'SALE' ? 'Buy' : 'Rent');

  function cardHTML(l) {
    const img = (l.images && l.images[0] && l.images[0].image_url) || `https://picsum.photos/seed/ct-${l.id}/600/450`;
    const author = l.product.author || l.product.brand || l.product.edition || '';
    const price = l.salePrice != null ? money(l.salePrice) : null;
    const rent = l.rentPrice != null ? `${money(l.rentPrice)}/day` : null;
    const rating = l.avgRating != null ? l.avgRating.toFixed(1) : '—';
    const condition = l.product.condition || 'Good';
    
    // Condition color accents (Complementary palette with high contrast borders)
    const condColor = condition.toLowerCase().includes('new') 
      ? 'text-emerald-800 border-emerald-300 bg-emerald-50'
      : condition.toLowerCase().includes('good')
      ? 'text-indigo-800 border-indigo-300 bg-indigo-50'
      : 'text-amber-900 border-amber-300 bg-amber-50';

    const typeBadge = l.type === 'SALE'
      ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 border border-indigo-700 text-white shadow-xs">Buy</span>'
      : l.type === 'RENT'
      ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-600 border border-amber-700 text-white shadow-xs">Rent</span>'
      : '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 border border-emerald-700 text-white shadow-xs">Buy / Rent</span>';

    return `
<article class="bg-white border-2 border-slate-200/90 hover:border-indigo-500 rounded-2xl shadow-xs hover:shadow-md transition-all duration-300 flex flex-col group overflow-hidden cursor-pointer" data-goto="/product.html?id=${l.id}">
  <div class="relative aspect-[4/3] overflow-hidden bg-slate-100 border-b border-slate-200">
    <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" src="${img}" alt="${l.product.name}">
    <div class="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent pointer-events-none"></div>
    <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap max-w-[calc(100%-48px)]">
      <span class="text-[11px] font-bold px-2 py-0.5 rounded-full border shadow-xs ${condColor}">${condition}</span>
      ${typeBadge}
    </div>
    <button data-wish="${l.id}" aria-label="Save to Wishlist" class="wish-btn absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 border border-slate-300 hover:bg-white text-slate-500 hover:text-rose-500 flex items-center justify-center transition-all hover:scale-110 shadow-xs">
      <span class="material-symbols-outlined text-[17px]">bookmark</span>
    </button>
    ${l.seller && l.seller.department ? `
    <div class="absolute bottom-2.5 left-2.5 bg-slate-900/90 backdrop-blur-xs border border-white/20 px-2 py-0.5 rounded-md text-[11px] font-medium text-white flex items-center gap-1 shadow-xs">
      <span class="material-symbols-outlined text-[13px] text-indigo-300">school</span>
      <span>${l.seller.department}</span>
    </div>` : ''}
  </div>
  <div class="p-4 flex-1 flex flex-col justify-between gap-3">
    <div>
      <h2 class="font-heading font-bold text-sm text-slate-900 line-clamp-1 group-hover:text-indigo-600 transition-colors tracking-tight">${l.product.name}</h2>
      ${author ? `<p class="text-xs text-slate-500 truncate mt-0.5 font-normal">${author}</p>` : ''}
      <div class="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 font-medium">
        <span class="material-symbols-outlined text-[14px] text-indigo-600">location_on</span>
        <span class="truncate">${l.location || 'Campus Center'}</span>
      </div>
    </div>
    <div class="pt-3 border-t-2 border-slate-100 space-y-2.5">
      <div class="flex items-baseline justify-between">
        <div class="flex items-baseline gap-1.5">
          ${price ? `<span class="text-base font-extrabold text-slate-900 tracking-tight">${price}</span>` : ''}
          ${rent ? `<span class="text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">${rent}</span>` : ''}
        </div>
        <div class="flex items-center gap-1 text-xs text-slate-700 font-medium bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg" title="${l.seller ? l.seller.name : ''}">
          <span class="material-symbols-outlined text-[14px] text-amber-500" style="font-variation-settings: 'FILL' 1;">star</span>
          <span class="font-bold text-slate-800">${rating}</span>
          ${l.seller ? `<span class="text-slate-400 text-[11px]">(${l.seller.name.split(' ')[0]})</span>` : ''}
        </div>
      </div>
      <button class="view-btn w-full border border-indigo-300 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 font-bold text-xs py-2 rounded-xl transition-all duration-200 shadow-xs flex items-center justify-center gap-1 group-hover:bg-indigo-600 group-hover:text-white">
        <span>View Details</span>
        <span class="material-symbols-outlined text-[15px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
      </button>
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
      t.className = 'ct-toast fixed bottom-6 right-6 z-[100] bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-xs font-medium flex items-center gap-2.5 transition-all duration-300 translate-y-24 opacity-0 border border-slate-800';
      t.innerHTML = '<span class="material-symbols-outlined text-[18px] text-indigo-400">check_circle</span><span class="ct-toast-msg font-body-md"></span>';
      document.body.appendChild(t);
    }
    t.querySelector('.material-symbols-outlined').textContent = isErr ? 'error' : 'check_circle';
    t.querySelector('.material-symbols-outlined').className = `material-symbols-outlined text-[18px] ${isErr ? 'text-rose-400' : 'text-emerald-400'}`;
    t.querySelector('.ct-toast-msg').textContent = message || (isErr ? 'Something went wrong' : 'Done');
    t.classList.remove('translate-y-24', 'opacity-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('translate-y-24', 'opacity-0'), 2800);
  }

  async function updateWishBadge() {
    const badges = document.querySelectorAll('.wishlist-badge, a[data-path="wishlist"] .badge-counter');
    const u = await me();
    if (!u) {
      badges.forEach(b => { b.style.display = 'none'; });
      return;
    }
    try {
      const w = await api('/api/my/wishlist');
      const count = (w.wishlist && w.wishlist.length) || 0;
      badges.forEach(b => {
        b.textContent = count;
        b.style.display = count > 0 ? 'flex' : 'none';
      });
    } catch { /* ignore */ }
  }

  async function toggleWish(listingId) {
    const u = await me();
    if (!u) {
      showToast('Please log in to save items to your wishlist.', true);
      setTimeout(() => { location.href = '/login.html'; }, 800);
      return;
    }
    try {
      const d = await api('/api/my/wishlist', { body: { listingId } });
      showToast(d.saved ? 'Item added to wishlist' : 'Item removed from wishlist');
      await updateWishBadge();
      const btn = document.querySelector(`button[data-wish="${listingId}"]`);
      if (btn) {
        btn.classList.toggle('text-rose-500', d.saved);
        btn.classList.toggle('text-slate-500', !d.saved);
      }
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      meCache = null;
      showToast('Signed out successfully.');
      setTimeout(() => { location.href = '/login.html'; }, 600);
    } catch (err) {
      location.href = '/login.html';
    }
  }

  async function initAuth() {
    const u = await me(true);
    const authWrapper = document.getElementById('header-auth-section');
    const adminLinks = document.querySelectorAll('a[data-path="admin-dashboard"]');

    if (adminLinks.length) {
      adminLinks.forEach(l => {
        l.style.display = (u && u.role === 'ADMIN') ? '' : 'none';
      });
    }

    if (authWrapper) {
      if (u) {
        authWrapper.innerHTML = `
          <div class="relative group">
            <button id="userMenuBtn" class="flex items-center gap-2.5 p-1 pl-2.5 pr-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 shadow-xs transition-colors focus:outline-none">
              <div class="flex flex-col text-right leading-tight hidden sm:flex">
                <span class="text-xs font-semibold text-slate-800 truncate max-w-[120px]">${u.name}</span>
                <span class="text-[10px] text-indigo-600 font-medium">${u.department ? `${u.department} · ` : ''}${u.role === 'ADMIN' ? 'Admin' : (u.year || 'Student')}</span>
              </div>
              <img alt="${u.name}" class="w-8 h-8 rounded-lg object-cover border border-indigo-200" src="/assets/avatar.png">
              <span class="material-symbols-outlined text-[16px] text-slate-400 group-hover:text-slate-700 transition-transform group-hover:rotate-180">expand_more</span>
            </button>
            <div id="userDropdown" class="hidden group-hover:block absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 divide-y divide-slate-100">
              <div class="px-3.5 py-2">
                <p class="text-xs font-semibold text-slate-900 truncate">${u.name}</p>
                <p class="text-[11px] text-slate-500 truncate">${u.email}</p>
              </div>
              <div class="py-1">
                <a href="/profile.html" class="flex items-center gap-2 px-3.5 py-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                  <span class="material-symbols-outlined text-[16px] text-indigo-600">person</span> Profile
                </a>
                <a href="/orders.html" class="flex items-center gap-2 px-3.5 py-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                  <span class="material-symbols-outlined text-[16px] text-indigo-600">shopping_bag</span> My Orders & Rentals
                </a>
                <a href="/wishlist.html" class="flex items-center gap-2 px-3.5 py-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                  <span class="material-symbols-outlined text-[16px] text-rose-500">bookmark</span> Saved Items
                </a>
                ${u.role === 'ADMIN' ? `
                <a href="/admin.html" class="flex items-center gap-2 px-3.5 py-2 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50 transition-colors">
                  <span class="material-symbols-outlined text-[16px]">admin_panel_settings</span> Admin Panel
                </a>` : ''}
              </div>
              <div class="pt-1">
                <button onclick="window.CT.logout()" class="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors text-left">
                  <span class="material-symbols-outlined text-[16px]">logout</span> Sign Out
                </button>
              </div>
            </div>
          </div>
        `;
      } else {
        authWrapper.innerHTML = `
          <div class="flex items-center gap-2">
            <a href="/login.html" class="text-xs font-semibold text-slate-700 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">
              Sign In
            </a>
            <a href="/register.html" class="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 rounded-xl transition-all shadow-xs flex items-center gap-1">
              <span>Register</span>
            </a>
          </div>
        `;
      }
    } else {
      // Legacy fallback
      const nameEl = document.querySelector('header .flex-col.text-right span');
      const subEl = nameEl ? nameEl.parentElement.querySelector('span:last-child') : null;
      const avatar = document.querySelector('header img[alt="Profile"]');
      if (u) {
        if (nameEl) nameEl.textContent = u.name;
        if (subEl) subEl.textContent = `${u.department || 'Student'} · ${u.year || ''}`;
        if (avatar) { avatar.src = '/assets/avatar.png'; avatar.style.cursor = 'pointer'; avatar.onclick = () => { location.href = '/profile.html'; }; }
      } else {
        if (nameEl) nameEl.textContent = 'Guest';
        if (subEl) subEl.textContent = 'Sign in to continue';
        if (avatar) { avatar.src = '/assets/avatar.png'; avatar.style.cursor = 'pointer'; avatar.onclick = () => { location.href = '/login.html'; }; }
      }
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

  return { api, me, logout, money, cardHTML, statusChip, showToast, updateWishBadge, toggleWish, initAuth, el };
})();