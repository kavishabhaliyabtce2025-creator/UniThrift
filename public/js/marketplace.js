'use strict';
/* Marketplace / Browse page wiring – renders live listings into the exported frame */
(() => {
  const CT = window.CT;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const grid = () => $$('.grid').find((g) => g.className.includes('xl:grid-cols-4'));
  const countBox = () => $$('div').find((d) => d.className.includes('hidden sm:block') && d.textContent.includes('Showing'));

  const CAT_LABEL_MAP = [
    ['Textbooks', ['Textbooks', 'Reference Books']],
    ['Calculators', ['Calculators']],
    ['Lab Coats', ['Lab Coats', 'Lab Manuals']],
    ['Study Notes', ['Study Notes', 'Lab Manuals']],
    ['Academic Accessories', ['Academic Accessories']],
  ];

  const catNamesFor = (labelText) => {
    const row = CAT_LABEL_MAP.find(([k]) => labelText.toLowerCase().includes(k.toLowerCase()));
    return row ? row[1] : [];
  };

  const deptNamesFor = (labelText) => {
    const t = labelText.toLowerCase();
    const out = [];
    if (t.includes('computer')) out.push('CSE');
    if (t.includes('mechanical')) out.push('MECH');
    if (t.includes('civil')) out.push('CIVIL');
    if (t.includes('electronic') || t.includes('electrical')) out.push('ECE', 'EEE');
    if (t.includes('chemistry') || t.includes('biotech')) out.push('BIOTECH', 'CHEM');
    if (t.includes('mathematics') || t.includes('physics')) out.push('MATH');
    return out;
  };

  const groupByHeader = (text) => $$('aside .space-y-space-2xs')
    .find((g) => { const l = g.querySelector(':scope > label'); return l && l.textContent.trim().startsWith(text); });

  const catGroup = () => groupByHeader('Academic Category');
  const deptGroup = () => groupByHeader('Department');
  const catRows = () => catGroup() ? $$('label', catGroup().querySelector('.space-y-1\\.5')) : [];
  const deptRows = () => deptGroup() ? $$('label', deptGroup().querySelector('.space-y-1\\.5')) : [];

  const state = {
    q: '', type: 'all', price: 2000, available: true, sort: 'popular',
    cats: new Set(), depts: new Set(),
  };

  let all = [];
  let didInit = false;

  (function initState() {
    // categories: everything checked by default
    catRows().forEach((label) => { catNamesFor(label.textContent).forEach((n) => state.cats.add(n)); });
    deptRows().forEach((label) => { deptNamesFor(label.textContent).forEach((n) => state.depts.add(n)); });
  })();

  const effPrice = (l) => (l.salePrice != null ? l.salePrice : l.rentPrice);

  function apply() {
    const items = all.filter((l) => {
      if (state.available && l.status !== 'AVAILABLE') return false;
      if (state.type === 'sale' && !['SALE', 'BOTH'].includes(l.type)) return false;
      if (state.type === 'rent' && !['RENT', 'BOTH'].includes(l.type)) return false;
      if (state.q) {
        const hay = `${l.product.name} ${l.product.author || ''} ${l.product.brand || ''} ${l.category || ''} ${l.product.description || ''}`.toLowerCase();
        if (!hay.includes(state.q.toLowerCase())) return false;
      }
      if (!state.cats.has(l.category)) return false;
      if (!state.depts.has(l.seller.department)) return false;
      const p = effPrice(l);
      if (p != null && state.price < 2000 && p > state.price) return false;
      return true;
    });
    const sorted = [...items].sort((a, b) => {
      switch (state.sort) {
        case 'newest': return String(b.createdAt).localeCompare(String(a.createdAt));
        case 'oldest': return String(a.createdAt).localeCompare(String(b.createdAt));
        case 'price-low': return (effPrice(a) ?? 1e9) - (effPrice(b) ?? 1e9);
        case 'price-high': return (effPrice(b) ?? 0) - (effPrice(a) ?? 0);
        default:
          return (b.orderCount || 0) - (a.orderCount || 0) || (b.avgRating || 0) - (a.avgRating || 0);
      }
    });
    renderItems(sorted);
    updateCounts(sorted.length, all.length);
  }

  function renderItems(items) {
    const g = grid();
    if (!g) return;
    if (!items.length) {
      g.innerHTML = `<div class="col-span-4 bg-[#1a1b21] border border-[#272a34] rounded-xl p-10 text-center">
        <span class="material-symbols-outlined text-[40px] text-[#64748b]">search_off</span>
        <p class="text-[#f8fafc] font-title-md mt-2">No items match your filters</p>
        <p class="text-[#94a3b8] font-body-sm mt-1">Try clearing filters or adjusting your budget range.</p>
        <button class="mt-4 px-4 py-2 bg-primary text-white rounded-lg font-label-md" data-reset="1">Reset filters</button>
      </div>`;
      return;
    }
    g.innerHTML = items.map((l) => CT.cardHTML(l)).join('');
  }

  function updateCounts(n, total) {
    const cb = countBox();
    if (cb) cb.innerHTML = `Showing <span class="font-semibold text-[#f8fafc]">${n}</span> of ${total} items`;
    // type buttons
    const sale = all.filter((l) => ['SALE', 'BOTH'].includes(l.type)).length;
    const rent = all.filter((l) => ['RENT', 'BOTH'].includes(l.type)).length;
    $$('.filter-type-btn').forEach((b) => {
      const cnt = b.dataset.type === 'all' ? total : b.dataset.type === 'sale' ? sale : rent;
      b.lastChild.textContent = cnt;
      b.innerHTML = (b.dataset.type === 'all' ? 'All' : b.dataset.type === 'sale' ? 'Buy' : 'Rent') + ` (${cnt})`;
    });
    // category counts
    catRows().forEach((label) => {
      const nameSpan = $(`span.flex-1`, label);
      const countSpan = $$('span', label).pop();
      if (!nameSpan || !countSpan) return;
      const names = catNamesFor(nameSpan.textContent);
      const cnt = all.filter((l) => names.includes(l.category)).length;
      countSpan.textContent = cnt;
    });
  }

  function setTypeBtn(activeType) {
    $$('.filter-type-btn').forEach((b) => {
      const on = b.dataset.type === activeType;
      b.className = `filter-type-btn py-1.5 rounded-lg transition-all ${on
        ? 'border border-blue-500/40 bg-primary-container/10 text-primary font-semibold shadow-sm hover:bg-primary-container/20 hover:border-primary'
        : 'text-[#94a3b8] hover:text-[#f8fafc]'}`;
    });
  }

  function bind() {
    const priceEl = $('#priceRange');
    const priceDisplay = $('#priceDisplay');
    const maxPriceVal = $('#maxPriceVal');
    if (priceEl) {
      priceEl.addEventListener('input', () => {
        state.price = +priceEl.value;
        if (priceDisplay) priceDisplay.textContent = `₹0 – ₹${state.price}`;
        if (maxPriceVal) maxPriceVal.textContent = `₹${state.price}`;
        apply();
      });
    }
    const avail = $('#availableToggle');
    if (avail) avail.addEventListener('change', () => { state.available = avail.checked; apply(); });

    const sortSel = $('#sortSelector');
    if (sortSel) sortSel.addEventListener('change', () => { state.sort = sortSel.value; apply(); });

    $$('.filter-type-btn').forEach((b) => b.addEventListener('click', () => { state.type = b.dataset.type; setTypeBtn(state.type); apply(); }));

    const reset = $('#resetFiltersBtn');
    if (reset) reset.addEventListener('click', () => {
      state.q = ''; state.type = 'all'; state.price = 2000; state.available = true; state.sort = 'popular';
      catRows().forEach((l) => { const i = $('input', l); if (i) i.checked = true; });
      deptRows().forEach((l) => { const i = $('input', l); if (i) i.checked = true; });
      (function () {
        if (priceEl) priceEl.value = 2000;
        if (priceDisplay) priceDisplay.textContent = '₹0 – ₹2000';
        if (maxPriceVal) maxPriceVal.textContent = '₹2000';
      })();
      if (avail) avail.checked = true;
      if (sortSel) sortSel.value = 'popular';
      $$('header input[type="text"]').forEach((i) => { i.value = ''; });
      const hs = $('header select');
      if (hs) hs.value = 'all';
      initState();
      load();
    });

    // search boxes (header + results toolbar)
    $$('input[type="text"]').forEach((i) => {
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { state.q = i.value.trim(); apply(); } });
    });

    // header department select -> sidebar dept sync
    const hs = $('header select');
    if (hs) hs.addEventListener('change', () => {
      const map = { all: null, cse: ['CSE'], ece: ['ECE', 'EEE'], mech: ['MECH'], civil: ['CIVIL'], humanities: [] };
      const names = map[hs.value] || null;
      if (names === null) {
        state.depts = new Set();
        deptRows().forEach((l) => { deptNamesFor(l.textContent).forEach((n) => state.depts.add(n)); });
        deptRows().forEach((l) => { const i = $('input', l); if (i) i.checked = true; });
      } else {
        state.depts = new Set(names);
        deptRows().forEach((l) => {
          const i = $('input', l);
          if (i) i.checked = deptNamesFor(l.textContent).some((n) => names.includes(n));
        });
      }
      apply();
    });

    // sidebar category/dept checkboxes
    catRows().forEach((label) => {
      const i = $('input', label);
      if (!i) return;
      i.addEventListener('change', () => {
        const names = catNamesFor($('span.flex-1', label).textContent);
        names.forEach((n) => { if (i.checked) state.cats.add(n); else state.cats.delete(n); });
        apply();
      });
    });
    deptRows().forEach((label) => {
      const i = $('input', label);
      if (!i) return;
      i.addEventListener('change', () => {
        const names = deptNamesFor(label.textContent);
        names.forEach((n) => { if (i.checked) state.depts.add(n); else state.depts.delete(n); });
        apply();
      });
    });

    // card interactions (delegated)
    const g = grid();
    if (g) g.addEventListener('click', async (e) => {
      const wish = e.target.closest('[data-wish]');
      if (wish) { e.preventDefault(); e.stopPropagation(); await CT.toggleWish(+wish.dataset.wish); return; }
      const card = e.target.closest('[data-goto]');
      if (card) { e.preventDefault(); location.href = card.dataset.goto; return; }
      const resBtn = e.target.closest('[data-reset]');
      if (resBtn) { $('#resetFiltersBtn').click(); }
    });
  }

  async function load() {
    try {
      const d = await CT.api('/api/listings?available=1');
      all = d.listings || [];
    } catch (err) {
      CT.showToast(err.message, true);
      all = [];
    }
    didInit = true;
    setTypeBtn(state.type);
    apply();
  }

  bind();
  load();
})();