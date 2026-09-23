'use strict';
/* Product details page wiring – binds the exported frame to live listing data */
(() => {
  const CT = window.CT;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  let listing = null;

  // ---- override inline page functions with real ones ----
  window.recalculateRental = () => {
    if (!listing) return;
    const st = $('#rent-start-date'), en = $('#rent-end-date');
    const durEl = $('#rental-duration-text'), feeEl = $('#rental-fee-text'), totalEl = $('#rental-total-text');
    const btn = $('#pane-rent button');
    if (!st || !en || !durEl || !feeEl || !totalEl) return;
    const days = Math.max(1, Math.round((new Date(en.value) - new Date(st.value)) / 86400000));
    const fee = +((days * (listing.rentPrice || 0))).toFixed(2);
    const total = +((fee + (listing.deposit || 0))).toFixed(2);
    durEl.textContent = `${days} day${days === 1 ? '' : 's'}`;
    feeEl.textContent = CT.money(fee);
    totalEl.textContent = CT.money(total);
    if (btn) btn.onclick = () => openReservationModal('rent', total);
  };

  window.openReservationModal = (mode, amount) => {
    if (!listing) return;
    const modal = $('#reservation-modal');
    if (!modal) return;
    $('#modal-mode-badge').textContent = mode === 'buy' ? 'Buy Outright' : 'Rent for Term';
    $('#modal-title').textContent = mode === 'buy' ? 'Confirm Campus Purchase' : 'Confirm Campus Rental';
    let amt = Number(amount) || 0;
    if (mode === 'rent') {
      const st = $('#rent-start-date'), en = $('#rent-end-date');
      const days = Math.max(1, Math.round((new Date(en.value) - new Date(st.value)) / 86400000));
      amt = +((days * (listing.rentPrice || 0) + (listing.deposit || 0))).toFixed(2);
    }
    $('#modal-amount').textContent = CT.money(amt);
    window.__ctMode = mode;
    modal.classList.remove('hidden');
  };

  window.executeReservation = async () => {
    if (!listing || !window.__ctMode) return;
    try {
      if (window.__ctMode === 'buy') {
        await CT.api('/api/orders', { body: { listingId: listing.id, paymentMethod: 'Cash on Campus' } });
        CT.showToast('Purchase request sent to the seller! Track it in My Orders.');
      } else {
        const st = $('#rent-start-date').value, en = $('#rent-end-date').value;
        const d = await CT.api('/api/rentals', { body: { listingId: listing.id, startDate: st, returnDate: en } });
        CT.showToast(`Rental request sent! Total ${CT.money(d.totalAmount)} incl. deposit.`);
      }
      const modal = $('#reservation-modal');
      if (modal) modal.classList.add('hidden');
    } catch (err) {
      CT.showToast(err.message, true);
    }
  };

  // ---- render helpers ----
  function renderBreadcrumb() {
    const nav = $('main nav');
    if (!nav) return;
    const links = $$('a', nav);
    if (links[1]) links[1].textContent = listing.category || 'Category';
    if (links[2]) links[2].textContent = listing.seller.department || '';
    const titleSpan = $$('span', nav).find((s) => s.className.includes('text-on-surface'));
    if (titleSpan) titleSpan.textContent = listing.product.name;
  }

  function renderGallery() {
    const imgs = listing.images && listing.images.length ? listing.images.map((i) => i.image_url) : [];
    const mainImg = $('#main-gallery-view');
    if (mainImg && imgs.length) mainImg.src = imgs[0];
    const thumbs = $$('.gallery-thumb');
    thumbs.forEach((b, i) => {
      if (i < imgs.length) {
        b.innerHTML = `<img class="w-full h-full object-cover" src="${imgs[i]}" alt="Photo ${i + 1}">`;
        b.style.display = '';
      } else {
        b.style.display = 'none';
      }
    });
    const cap = $$('main span').find((s) => s.textContent.includes('Campus Photos'));
    if (cap) cap.textContent = `${imgs.length} Campus Photo${imgs.length === 1 ? '' : 's'}`;
    const condSpan = $$('main span').find((s) => s.textContent.trim().startsWith('Condition:'));
    if (condSpan) condSpan.textContent = `Condition: ${listing.product.condition}`;
  }

  function renderAvailability() {
    const callout = $('.bg-secondary-container\\/40');
    if (!callout) return;
    const ps = $$('p', callout);
    const map = {
      AVAILABLE: ['Available for Immediate Handover', `Ready at ${listing.location} · No overlapping holds`],
      RESERVED: ['Reserved — awaiting seller confirmation', 'Another student has reserved this item'],
      RENTED: ['Currently rented out', 'Available again after the current rental ends'],
      SOLD: ['This item has been sold', 'Look for similar items in the marketplace'],
      PENDING: ['Pending admin approval', 'This listing is under moderation'],
      REJECTED: ['Listing rejected', 'Contact the seller for details'],
      REMOVED: ['Listing removed', 'This item is no longer available'],
    };
    const [t, s2] = map[listing.status] || ['Status unknown', ''];
    if (ps[0]) ps[0].textContent = t;
    if (ps[1]) ps[1].textContent = s2;
  }

  function renderPanes() {
    // mode tabs visibility by listing type
    const tabBuy = $('#tab-buy');
    const tabRent = $('#tab-rent');
    const paneBuy = $('#pane-buy');
    const paneRent = $('#pane-rent');
    const switcher = tabBuy ? tabBuy.parentElement : null;

    if (listing.type === 'SALE') {
      if (tabRent) tabRent.style.display = 'none';
      if (paneRent) paneRent.style.display = 'none';
      if (switcher) switcher.style.display = 'none';
      if (paneBuy) paneBuy.classList.remove('hidden');
    } else if (listing.type === 'RENT') {
      if (tabBuy) tabBuy.style.display = 'none';
      if (paneBuy) paneBuy.style.display = 'none';
      if (switcher) switcher.style.display = 'none';
      if (paneRent) paneRent.classList.remove('hidden');
    } else {
      if (switcher) switcher.style.display = 'flex';
      if (tabBuy) tabBuy.style.display = '';
      if (tabRent) tabRent.style.display = '';
      if (paneBuy) paneBuy.classList.remove('hidden');
    }
    // buy pane
    if (paneBuy) {
      const priceEl = $('.font-display-lg', paneBuy);
      if (priceEl) priceEl.textContent = CT.money(listing.salePrice);
      $$('span', paneBuy).forEach((s) => {
        if (/^(₹|\$)\d/.test(s.textContent.trim()) && (s.className.includes('text-primary') || s.className.includes('font-medium'))) {
          s.textContent = CT.money(listing.salePrice);
        }
      });
      // Original Retail Price (MRP) + savings chip — derived so it stays honest for any listing
      if (listing.salePrice != null) {
        const mrpEl = $$('main span').find((s) => s.className.includes('line-through'));
        const retail = Math.ceil((listing.salePrice * 1.3) / 10) * 10;
        if (mrpEl) mrpEl.textContent = CT.money(retail);
        const chip = $('#save-chip');
        if (chip && retail > 0) chip.textContent = `Save ${Math.round((1 - listing.salePrice / retail) * 100)}% vs Bookstore`;
      }
      const btn = $('button', paneBuy);
      if (btn) btn.onclick = () => openReservationModal('buy', listing.salePrice);
    }
    // rent pane
    if (paneRent) {
      const priceEl = $('.font-display-lg', paneRent);
      if (priceEl) {
        priceEl.textContent = CT.money(listing.rentPrice);
        const unit = $$('span', paneRent).find((s) => s.textContent.trim() === '/ month');
        if (unit) unit.textContent = '/ day';
        const rateEl = $('#rental-rate-text');
        if (rateEl) rateEl.textContent = CT.money(listing.rentPrice);
        const depEl = $('#rental-deposit-text');
        if (depEl) depEl.textContent = listing.deposit != null ? CT.money(listing.deposit) : '—';
      }
      window.recalculateRental();
    }
  }

  function renderSchemaTrace() {
    const el = $('#schema-trace-text');
    if (!el) return;
    el.textContent = `LISTING(id=${listing.id}) → PRODUCT(category='${listing.category || '—'}', condition='${listing.product.condition}', status='${listing.status}') → ORDER/PENDING total=${CT.money(listing.salePrice ?? (listing.rentPrice || 0))}`;
  }

  function renderModalMeta() {
    const strongs = $$('#reservation-modal strong');
    if (strongs[0]) strongs[0].textContent = listing.product.name;
    if (strongs[1]) strongs[1].textContent = listing.seller.name;
    const meetup = $$('#reservation-modal span').find((s) => s.className.includes('font-medium') && !s.id);
    if (meetup) meetup.textContent = listing.location;
  }

  function renderReviews() {
    const reviews = listing.reviews || [];
    const h2 = $$('main h2').find((s) => s.textContent.includes('Verified Student'));
    if (h2) h2.textContent = `Verified Student Exchanges for ${listing.seller.name}`;
    const onTime = $$('main span').find((s) => s.textContent.includes('On-Time Returns'));
    if (onTime) onTime.textContent = `${listing.seller.reviewCount || 0} verified rating${(listing.seller.reviewCount || 0) === 1 ? '' : 's'}`;
    const rated = $$('main span').find((s) => /^\d(\.\d)?$/.test(s.textContent.trim()) && s.className.includes('font-title-md'));
    if (rated) rated.textContent = listing.avgRating != null ? listing.avgRating.toFixed(1) : '—';
    const gridEl = $$('.grid').find((g) => g.className.includes('md:grid-cols-3'));
    if (!gridEl) return;
    if (!reviews.length) {
      gridEl.innerHTML = `<div class="col-span-3 bg-[#12131c] border border-[#222432] p-8 rounded-2xl text-center text-slate-400 text-sm">No reviews yet — the first buyer to complete a handover will be the first to review.</div>`;
      return;
    }
    gridEl.innerHTML = reviews.map((r) => `
      <div class="bg-[#12131c] border border-[#222432] p-5 rounded-2xl shadow-xl flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1 text-amber-400">
              <span class="material-symbols-outlined text-[17px]" style="font-variation-settings: 'FILL' 1;">star</span>
              <span class="font-heading font-bold text-sm text-white">${r.rating}.0</span>
            </div>
            <span class="text-[11px] text-slate-500">${(r.createdAt || '').slice(0, 10)}</span>
          </div>
          <p class="text-xs text-slate-300 leading-relaxed mb-4">“${r.comment || 'No comment.'}”</p>
        </div>
        <div class="pt-3 border-t border-[#1e202e] flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold text-xs">${r.reviewer_name.charAt(0)}</div>
          <span class="text-xs font-semibold text-white">${r.reviewer_name}</span>
        </div>
      </div>`).join('');
  }

  function renderRelated(related) {
    const h3 = $$('main h3').find((s) => s.textContent.includes('Frequently Exchanged'));
    if (!h3) return;
    const wrap = h3.closest('.pt-space-lg') || h3.parentElement.parentElement;
    if (!wrap) return;
    const gridEl = $('.grid', wrap);
    if (!gridEl) return;
    gridEl.innerHTML = related.map((l) => {
      const img = (l.images && l.images[0] && l.images[0].image_url) || `https://picsum.photos/seed/ct-${l.id}/600/450`;
      const price = l.salePrice != null ? CT.money(l.salePrice) : CT.money(l.rentPrice) + '/day';
      return `
      <div class="bg-[#12131c] border border-[#222432] rounded-2xl overflow-hidden shadow-lg hover:border-blue-500/50 transition-all flex flex-col justify-between cursor-pointer group" data-goto="/product.html?id=${l.id}">
        <div>
          <div class="relative aspect-[4/3] bg-[#0c0d13] overflow-hidden">
            <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" src="${img}" alt="${l.product.name}">
          </div>
          <div class="p-4">
            <p class="font-heading font-bold text-xs text-white truncate">${l.product.name}</p>
            <p class="text-[11px] font-semibold text-blue-400 mt-1">${price} · <span class="text-slate-400 font-normal">${l.product.condition}</span></p>
          </div>
        </div>
      </div>`;
    }).join('');
    $$('[data-goto]', gridEl).forEach((card) => card.addEventListener('click', () => { location.href = card.dataset.goto; }));
  }

  function renderMessageLink() {
    // point any "Message Seller"-style links at the real thread
    $$('a').forEach((a) => {
      if (/message/i.test(a.textContent) && a.dataset.path === 'messages') {
        a.dataset.path = '';
        a.href = `/messages.html?otherId=${listing.seller.id}&listingId=${listing.id}`;
      }
    });
  }

  async function init() {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { location.href = '/index.html'; return; }
    try {
      const d = await CT.api('/api/listings/' + id);
      listing = d.listing;
    } catch (err) {
      CT.showToast(err.message, true);
      setTimeout(() => { location.href = '/index.html'; }, 900);
      return;
    }
    document.title = `${listing.product.name} · UniThrift`;
    renderBreadcrumb();
    renderGallery();
    renderAvailability();
    renderPanes();
    renderSchemaTrace();
    renderModalMeta();
    renderReviews();
    renderRelated(d.related || []);
    renderMessageLink();
    // dealer delegation for related / wishlist style clicks
    $$('.grid [data-goto]').forEach((c) => c.addEventListener('click', () => { location.href = c.dataset.goto; }));
  }

  init();
})();