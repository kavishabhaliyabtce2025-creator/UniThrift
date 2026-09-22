'use strict';
/* Post-an-item page wiring – live categories + submission to the API */
(() => {
  const CT = window.CT;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const CONDITION_MAP = {
    'like-new': 'Like New',
    good: 'Good',
    fair: 'Fair',
    'well-used': 'Acceptable',
  };

  const CAT_IMG = {
    'Calculators': 'https://lh3.googleusercontent.com/aida-public/AB6AXuCPT8MggvUMvSEj5mWpC1iv8eK2m1DmTOOtbOs_T7Zx0bX7rXJktmAFLUAIgPtYN_gLw_rHQhQxC63oio8BpTmxkB3vr0tfn7RSEF1vWPsW68fxDRXwK4N-ikzKUYesiwVtvHKDmsdbaHXJQCpuMJr8H0UFENgT08JsaeSyQFoj9DhjwzmUBVW2TFjzyN5cmexRqpcNryXPaT3AozyUZX8vmNaeZUZ4CDZT2PfFGwhE9PQPnWtdVDJgbA',
    'Textbooks': 'https://lh3.googleusercontent.com/aida-public/AB6AXuBTsAdsIdABTt34zNaPeJq3N90y8oSl2sQEGEnXXMoBecHfpJacNTGVNNYAKa97juNvcZ7kvj2fxCOUz5rbTitAu9RiwFhw5vDEG2MACvW-zEkOLTll6q2cWkQYRQr8DvHuCbE0VwzCO2sXmvqBzVaMur42IxhPmqa6AdlReWcW8K_r7EPgQs3mf5pWHRCrTN1T3LEBAQ0ccp5qX73q3ek7q7fprh_bAR88yfyTjHzwpLysLJ2CnGfsSA',
    'Reference Books': 'https://lh3.googleusercontent.com/aida-public/AB6AXuDzh1r5YMB_iOVbsgOslrl2y7aXYcX7Q9GyoRCgEyawQXybe-LHdUsXxhuLj_qWPPIeRHn1I9g2Pp1-8X-dTJdOLHUiil9RXvr9htMbPt1GfMuxQFlUoZpqsV5QCycEhktaRoZs78cLg8FV3iBxUkNeYmmiHYCmr2c_so6r2OelwszFLNbLVeuF0H0GmA78NKk1QOtz3-bLHq-JCNbl1g1QxDzyCcORkPNtV-NUW1EbSzlBfVW7tGF6ew',
  };

  async function init() {
    const u = await CT.me(true);
    const toast = $('#success-toast');
    const form = $('#academic-listing-form');
    if (!form) return;

    if (!u) {
      CT.showToast('Please log in to post an item.', true);
      setTimeout(() => { location.href = '/login.html?next=/post.html'; }, 900);
      return;
    }

    // live categories
    const catSel = $('#item-category');
    try {
      const d = await CT.api('/api/categories');
      catSel.innerHTML = d.categories.map((c) => `<option value="${c.category_id}">${c.category_name}</option>`).join('');
    } catch { /* keep static options */ }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = $('#submit-btn');
      const title = $('#item-title').value.trim();
      const category = catSel.options[catSel.selectedIndex] ? catSel.selectedIndex >= 0 ? catSel.options[catSel.selectedIndex].text : '' : '';
      const description = $('#item-desc').value.trim();
      const brand = ($('#item-brand') && $('#item-brand').value.trim()) || null;
      const edition = ($('#item-edition') && $('#item-edition').value.trim()) || null;
      const condition = CONDITION_MAP[(document.querySelector('input[name="item_condition"]:checked') || {}).value] || 'Good';
      const saleOn = $('#mode-sale') && $('#mode-sale').checked;
      const rentOn = $('#mode-rent') && $('#mode-rent').checked;
      if (!title || !category || !description) { CT.showToast('Title, category and description are required.', true); return; }
      if (!saleOn && !rentOn) { CT.showToast('Choose at least one listing mode (Buy or Rent).', true); return; }
      const type = saleOn && rentOn ? 'BOTH' : saleOn ? 'SALE' : 'RENT';
      const salePrice = saleOn && $('#sale-price') ? parseFloat($('#sale-price').value) : null;
      const rentPrice = rentOn && $('#rent-price') ? parseFloat($('#rent-price').value) : null;
      const deposit = rentOn && $('#rent-deposit') ? parseFloat($('#rent-deposit').value) : 0;
      const location = ($('#pickup-loc') && $('#pickup-loc').options[$('#pickup-loc').selectedIndex]?.text) || 'Library Desk 2 (Atrium)';
      if (salePrice !== null && (!isFinite(salePrice) || salePrice < 0)) { CT.showToast('Sale price must be a non-negative number.', true); return; }
      if (rentPrice !== null && (!isFinite(rentPrice) || rentPrice < 0)) { CT.showToast('Rental rate must be a non-negative number.', true); return; }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }
      try {
        const images = [CAT_IMG[category] || `https://picsum.photos/seed/ct-post-${Date.now()}/600/450`];
        const d = await CT.api('/api/listings', {
          body: { name: title, category, description, brand, edition, condition, type, salePrice, rentPrice, deposit, location, images },
        });
        CT.showToast(d.message || 'Listing submitted for admin approval.');
        if (toast) {
          toast.classList.remove('translate-y-24', 'opacity-0');
          toast.classList.add('translate-y-0', 'opacity-100');
          setTimeout(() => { toast.classList.add('translate-y-24', 'opacity-0'); toast.classList.remove('translate-y-0', 'opacity-100'); }, 3200);
        }
        form.reset();
      } catch (err) {
        CT.showToast(err.message, true);
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Listing for Approval'; }
      }
    });
  }

  init();
})();