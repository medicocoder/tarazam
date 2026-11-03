/**
 * Tarazak Accounting App - Main Application Controller
 * Handles UI interactions, dual forms, live calculations, views, and modals.
 */
(function () {
  'use strict';

  // Application State
  const AppState = {
    activeTab: 'invoices',
    formKind: 'sale',       // 'sale' | 'purchase' | 'expense'
    formMode: 'custom',     // 'custom' | 'tarazak'
    inputMethod: 'manual',  // 'manual' | 'ocr'
    activePeriod: 'all',    // 'all' | 'year' | 'season' | 'month' | 'decade' | 'today'
    activeReportSubtab: 'products', // 'products' | 'customers' | 'breakdown'
    invoices: [],
    people: [],
    catalog: [],
    autocomplete: { parties: [], categories: [], products: [] }
  };

  // Toast Notification Utility
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Modal Utility
  function openModal(title, bodyHtml, footerHtml = '') {
    const modal = document.getElementById('modal-container');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body-content');
    const footerEl = document.getElementById('modal-footer-content');

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    footerEl.innerHTML = footerHtml;
    modal.style.display = 'flex';
  }

  function closeModal() {
    const modal = document.getElementById('modal-container');
    if (modal) modal.style.display = 'none';
  }

  // Reload all Data from Storage
  async function reloadData() {
    AppState.invoices = await TarazakStorage.getAll('invoices');
    AppState.people = await TarazakStorage.getAll('people');
    AppState.catalog = await TarazakStorage.getAll('catalog');
    AppState.autocomplete = await TarazakStorage.getAutocomplete();

    // Sort invoices by date descending
    AppState.invoices.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    updateDatalists();
  }

  function updateDatalists() {
    const partiesList = document.getElementById('parties-list');
    const catList = document.getElementById('categories-list');
    const prodList = document.getElementById('products-list');

    if (partiesList) {
      partiesList.innerHTML = (AppState.autocomplete.parties || [])
        .map(p => `<option value="${p}">`).join('');
    }
    if (catList) {
      catList.innerHTML = (AppState.autocomplete.categories || [])
        .map(c => `<option value="${c}">`).join('');
    }
    if (prodList) {
      prodList.innerHTML = (AppState.catalog || [])
        .map(c => `<option value="${c.name}">`).join('');
    }
  }

  // Navigation & Tab Switching
  function switchTab(tabId) {
    AppState.activeTab = tabId;

    // Update Sidebar & Bottom Nav
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.tab === tabId);
    });
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update View visibility
    document.querySelectorAll('.tab-view').forEach(view => {
      view.style.display = 'none';
    });
    const target = document.getElementById(`view-${tabId}`);
    if (target) target.style.display = 'block';

    // Refresh view specific data
    if (tabId === 'invoices') renderInvoicesView();
    else if (tabId === 'people') renderPeopleView();
    else if (tabId === 'catalog') renderCatalogView();
    else if (tabId === 'reports') renderReportsView();
    else if (tabId === 'create') resetInvoiceForm();
  }

  // =========================================================================
  // FINANCIAL HELPERS & FORM SETTINGS
  // =========================================================================

  // Calculate a customer's dynamic balance: (Total Sales + Shipping + Opening Debt) - Total Paid
  function calculatePersonBalance(personName) {
    if (!personName) return 0;
    const person = AppState.people.find(p => p.name === personName) || {};
    let balance = person.openingBalance || 0;

    AppState.invoices.forEach(inv => {
      if (inv.partyName === personName) {
        if (inv.kind === 'sale') {
          const debit = (inv.currentOrder || 0) + (inv.shippingCost || 0);
          const credit = inv.paidAmount || 0;
          balance += (debit - credit);
        } else if (inv.kind === 'settlement') {
          balance -= (inv.paidAmount || 0);
        }
      }
    });

    return balance;
  }

  // Form Field Personalization Settings
  const defaultFormSettings = {
    showShipping: true,
    showPrevBalance: true,
    showCategory: true,
    showItemCategory: true,
    showNotes: true
  };

  function getFormSettings() {
    try {
      const saved = localStorage.getItem('tzk_form_prefs');
      return saved ? { ...defaultFormSettings, ...JSON.parse(saved) } : defaultFormSettings;
    } catch (e) {
      return defaultFormSettings;
    }
  }

  function saveFormSettings(settings) {
    try {
      localStorage.setItem('tzk_form_prefs', JSON.stringify(settings));
    } catch (e) {}
  }

  function applyFormSettings() {
    const s = getFormSettings();

    // Checkboxes
    const cbShip = document.getElementById('pref-show-shipping');
    const cbPrev = document.getElementById('pref-show-prev-balance');
    const cbCat = document.getElementById('pref-show-category');
    const cbItemCat = document.getElementById('pref-show-item-category');
    const cbNotes = document.getElementById('pref-show-notes');

    if (cbShip) cbShip.checked = s.showShipping;
    if (cbPrev) cbPrev.checked = s.showPrevBalance;
    if (cbCat) cbCat.checked = s.showCategory;
    if (cbItemCat) cbItemCat.checked = s.showItemCategory;
    if (cbNotes) cbNotes.checked = s.showNotes;

    // Shipping field & summary row
    const grpShipping = document.getElementById('f-group-shipping');
    const sumShipping = document.getElementById('sum-row-shipping');
    if (grpShipping) grpShipping.style.display = s.showShipping ? 'flex' : 'none';
    if (sumShipping) sumShipping.style.display = s.showShipping ? 'flex' : 'none';

    // Prev Balance field & summary row
    const grpPrev = document.getElementById('f-group-prev-balance');
    const sumPrev = document.getElementById('sum-row-prev');
    if (grpPrev) grpPrev.style.display = s.showPrevBalance ? 'flex' : 'none';
    if (sumPrev) sumPrev.style.display = s.showPrevBalance ? 'flex' : 'none';

    // Party Category field
    const grpCat = document.getElementById('f-group-category');
    if (grpCat) grpCat.style.display = s.showCategory ? 'flex' : 'none';

    // Notes field
    const grpNotes = document.getElementById('f-group-notes');
    if (grpNotes) grpNotes.style.display = s.showNotes ? 'flex' : 'none';

    // Items table Category column (header and cells)
    document.querySelectorAll('.col-item-cat').forEach(el => {
      el.style.display = s.showItemCategory ? '' : 'none';
    });

    recalcInvoiceTotals();
  }

  function updatePartyBalanceBadge() {
    const partyInput = document.getElementById('f-party');
    const badge = document.getElementById('party-balance-badge');
    const settleQuickAction = document.getElementById('settle-quick-action');
    if (!partyInput || !badge) return;

    const partyName = partyInput.value.trim();
    if (!partyName) {
      badge.style.display = 'none';
      if (settleQuickAction) settleQuickAction.innerHTML = '';
      return;
    }

    const balance = calculatePersonBalance(partyName);
    const person = AppState.people.find(p => p.name === partyName);

    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'space-between';

    if (balance > 0) {
      badge.style.background = '#fef2f2';
      badge.style.color = '#991b1b';
      badge.style.border = '1px solid #fecaca';
      badge.innerHTML = `
        <span>مانده بدهی قبلی: <b class="num">${Jalali.formatMoney(balance, true)}</b> (نسیه)</span>
        <button type="button" id="btn-autofill-prev-debt" class="btn btn-sm" style="padding: 2px 8px; font-size: 11px; margin-right: 8px; background: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; cursor: pointer; border-radius: 4px;">درج در حساب قبلی</button>
      `;
      document.getElementById('btn-autofill-prev-debt')?.addEventListener('click', () => {
        const prevEl = document.getElementById('f-prev-balance');
        if (prevEl) {
          prevEl.value = Jalali.formatMoney(balance);
          recalcInvoiceTotals();
          showToast(`مبلغ ${Jalali.formatMoney(balance, true)} در حساب قبلی درج شد.`, 'info');
        }
      });

      if (settleQuickAction) {
        settleQuickAction.innerHTML = `
          <button type="button" id="btn-quick-full-settle" class="btn btn-sm btn-secondary" style="font-size: 11.5px; padding: 4px 10px;">
            تسویه کامل کل بدهی (${Jalali.formatMoney(balance, true)})
          </button>
        `;
        document.getElementById('btn-quick-full-settle')?.addEventListener('click', () => {
          const settleAmtEl = document.getElementById('f-settle-amount');
          if (settleAmtEl) settleAmtEl.value = Jalali.formatMoney(balance);
        });
      }
    } else if (balance < 0) {
      badge.style.background = '#eff6ff';
      badge.style.color = '#1e40af';
      badge.style.border = '1px solid #bfdbfe';
      badge.innerHTML = `<span>مانده بستانکاری مشتری: <b class="num">${Jalali.formatMoney(Math.abs(balance), true)}</b></span>`;
      if (settleQuickAction) settleQuickAction.innerHTML = '';
    } else {
      badge.style.background = '#f0fdf4';
      badge.style.color = '#166534';
      badge.style.border = '1px solid #bbf7d0';
      badge.innerHTML = `<span>وضعیت حساب مشتری: <b>تسویه کامل (۰ تومان)</b></span>`;
      if (settleQuickAction) settleQuickAction.innerHTML = '';
    }

    // Auto-fill category if empty and known
    const catInput = document.getElementById('f-category');
    if (catInput && (!catInput.value || catInput.value === 'متفرقه') && person && person.category) {
      catInput.value = person.category;
    }
  }

  // Quick Settlement Modal (accessible from anywhere)
  function openQuickSettlementModal(preselectedName = '') {
    const currentDebt = preselectedName ? calculatePersonBalance(preselectedName) : 0;

    const peopleOptions = AppState.people
      .filter(p => p.role !== 'supplier')
      .map(p => {
        const b = calculatePersonBalance(p.name);
        const debtText = b > 0 ? ` (بدهی: ${Jalali.formatMoney(b)} تومان)` : b === 0 ? ' (تسویه)' : ` (بستانکار: ${Jalali.formatMoney(Math.abs(b))})`;
        const selected = p.name === preselectedName ? 'selected' : '';
        return `<option value="${p.name}" ${selected}>${p.name}${debtText}</option>`;
      }).join('');

    const bodyHtml = `
      <form id="quick-settle-form" style="display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group">
          <label for="qs-party">نام مشتری / طرف حساب <span class="required">*</span></label>
          <select id="qs-party" required style="font-size: 14px; padding: 10px;">
            <option value="">-- انتخاب مشتری --</option>
            ${peopleOptions}
          </select>
          <div id="qs-debt-info" style="font-size: 12.5px; margin-top: 4px; font-weight: 600; color: ${currentDebt > 0 ? 'var(--danger)' : 'var(--success)'};">
            ${currentDebt > 0 ? `مانده بدهی فعلی: ${Jalali.formatMoney(currentDebt, true)}` : currentDebt < 0 ? `بستانکار: ${Jalali.formatMoney(Math.abs(currentDebt), true)}` : 'حساب تسویه است'}
          </div>
        </div>

        <div class="form-grid-3" style="grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label for="qs-date">تاریخ دریافت (شمسی) <span class="required">*</span></label>
            <input type="text" id="qs-date" class="num" value="${Jalali.todayJalali()}" required>
          </div>

          <div class="form-group">
            <label for="qs-amount">مبلغ دریافتی (تومان) <span class="required">*</span></label>
            <input type="text" id="qs-amount" class="num" value="${currentDebt > 0 ? Jalali.formatMoney(currentDebt) : ''}" placeholder="0" required style="font-weight: 700; color: #166534;">
            ${currentDebt > 0 ? `<button type="button" id="qs-btn-full" class="btn btn-sm btn-secondary" style="font-size: 11px; margin-top: 4px; padding: 2px 8px;">تسویه کامل (${Jalali.formatMoney(currentDebt)})</button>` : ''}
          </div>
        </div>

        <div class="form-grid-3" style="grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label for="qs-method">روش واریز</label>
            <select id="qs-method">
              <option value="کارت‌به‌کارت">کارت‌به‌کارت (واریز بانکی)</option>
              <option value="کارتخوان">کارتخوان (POS)</option>
              <option value="نقد">نقد</option>
              <option value="چک صیادی">چک صیادی</option>
              <option value="حواله پایا/ساتنا">حواله پایا/ساتنا</option>
            </select>
          </div>

          <div class="form-group">
            <label for="qs-ref">شماره پیگیری / کد رهگیری</label>
            <input type="text" id="qs-ref" placeholder="کد رهگیری فیش یا ۴ رقم کارت...">
          </div>
        </div>

        <div class="form-group">
          <label for="qs-notes">بابت / توضیحات</label>
          <input type="text" id="qs-notes" placeholder="مثال: تسویه فاکتور باقلوا، قسط هفتگی...">
        </div>
      </form>
    `;

    const footerHtml = `
      <button type="button" id="qs-submit-btn" class="btn btn-success" style="padding: 10px 24px;">
        ثبت و ذخیره دریافت وجه
      </button>
      <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-container').style.display='none'">
        انصراف
      </button>
    `;

    openModal('ثبت دریافت وجه / تسویه نسیه', bodyHtml, footerHtml);

    const selParty = document.getElementById('qs-party');
    const debtInfo = document.getElementById('qs-debt-info');
    const amtInput = document.getElementById('qs-amount');

    selParty?.addEventListener('change', () => {
      const pName = selParty.value;
      const b = calculatePersonBalance(pName);
      if (b > 0) {
        debtInfo.textContent = `مانده بدهی فعلی: ${Jalali.formatMoney(b, true)}`;
        debtInfo.style.color = 'var(--danger)';
        amtInput.value = Jalali.formatMoney(b);
      } else if (b < 0) {
        debtInfo.textContent = `بستانکار: ${Jalali.formatMoney(Math.abs(b), true)}`;
        debtInfo.style.color = 'var(--primary)';
      } else {
        debtInfo.textContent = 'حساب تسویه است';
        debtInfo.style.color = 'var(--success)';
      }
    });

    amtInput?.addEventListener('input', e => {
      const val = Jalali.parseMoney(e.target.value);
      e.target.value = val ? Jalali.formatMoney(val) : '';
    });

    document.getElementById('qs-btn-full')?.addEventListener('click', () => {
      const pName = selParty.value;
      const b = calculatePersonBalance(pName);
      if (b > 0) amtInput.value = Jalali.formatMoney(b);
    });

    document.getElementById('qs-submit-btn')?.addEventListener('click', async () => {
      const partyName = selParty?.value;
      if (!partyName) {
        showToast('لطفاً نام مشتری را انتخاب کنید.', 'error');
        return;
      }
      const amount = Jalali.parseMoney(amtInput?.value);
      if (!amount || amount <= 0) {
        showToast('لطفاً مبلغ دریافتی را به درستی وارد کنید.', 'error');
        return;
      }
      const date = document.getElementById('qs-date')?.value.trim() || Jalali.todayJalali();
      const method = document.getElementById('qs-method')?.value || 'کارت‌به‌کارت';
      const ref = document.getElementById('qs-ref')?.value.trim() || '';
      const notes = document.getElementById('qs-notes')?.value.trim() || 'تسویه حساب نسیه';

      const p = AppState.people.find(x => x.name === partyName);

      const settlementDoc = {
        id: 'stl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        kind: 'settlement',
        date,
        partyName,
        partyCategory: p?.category || 'متفرقه',
        items: [],
        currentOrder: 0,
        shippingCost: 0,
        prevBalance: 0,
        grandTotal: amount,
        paidAmount: amount,
        paymentMethod: method,
        referenceNo: ref,
        remainingBalance: 0,
        status: 'settled',
        notes,
        createdAt: new Date().toISOString()
      };

      await TarazakStorage.saveItem('invoices', settlementDoc);
      closeModal();
      showToast(`دریافت مبلغ ${Jalali.formatMoney(amount, true)} از ${partyName} ثبت شد.`);
      await reloadData();
      renderPeopleView();
      renderInvoicesView();
    });
  }

  // =========================================================================
  // INVOICE FORM & LIVE CALCULATIONS
  // =========================================================================

  function resetInvoiceForm() {
    const fDate = document.getElementById('f-date');
    if (fDate && !fDate.value) {
      fDate.value = Jalali.todayJalali();
    }

    const itemsTbody = document.getElementById('items-tbody');
    if (itemsTbody) {
      itemsTbody.innerHTML = '';
      addItemRow(); // Start with 1 empty row
    }

    applyFormSettings();
    updatePartyBalanceBadge();
    recalcInvoiceTotals();
  }

  function addItemRow(itemData = {}) {
    const tbody = document.getElementById('items-tbody');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <input type="text" class="item-name" list="products-list" placeholder="نام کالا یا باقلوا..." value="${itemData.name || ''}" autocomplete="off" required>
      </td>
      <td class="col-item-cat">
        <select class="item-cat">
          <option value="دسته A" ${itemData.category === 'دسته A' ? 'selected' : ''}>دسته A (عمده/کیلویی)</option>
          <option value="دسته A+" ${itemData.category === 'دسته A+' || !itemData.category ? 'selected' : ''}>دسته A+ (بسته‌بندی)</option>
          <option value="لوازم و ظروف" ${itemData.category === 'لوازم و ظروف' ? 'selected' : ''}>لوازم و ظروف</option>
          <option value="متفرقه" ${itemData.category === 'متفرقه' ? 'selected' : ''}>متفرقه</option>
        </select>
      </td>
      <td>
        <input type="number" class="item-qty num" min="0.1" step="any" placeholder="1" value="${itemData.qty || 1}">
      </td>
      <td>
        <input type="text" class="item-price num" placeholder="0" value="${itemData.price ? Jalali.formatMoney(itemData.price) : ''}">
      </td>
      <td>
        <input type="text" class="item-total num" placeholder="0" readonly style="background: #f8fafc; font-weight: 700;" value="${itemData.total ? Jalali.formatMoney(itemData.total) : ''}">
      </td>
      <td style="text-align: center;">
        <button type="button" class="btn-remove-row" style="color: var(--danger); font-size: 16px;">&times;</button>
      </td>
    `;

    tbody.appendChild(row);

    // Sync visibility of item category column with user settings
    const s = getFormSettings();
    if (!s.showItemCategory) {
      row.querySelector('.col-item-cat')?.style.setProperty('display', 'none');
    }

    // Event listeners for live updates on this row
    const nameInput = row.querySelector('.item-name');
    const qtyInput = row.querySelector('.item-qty');
    const priceInput = row.querySelector('.item-price');
    const totalInput = row.querySelector('.item-total');
    const catSelect = row.querySelector('.item-cat');
    const removeBtn = row.querySelector('.btn-remove-row');

    // Auto-fill price and category from catalog when selecting a known product
    nameInput.addEventListener('change', () => {
      const match = AppState.catalog.find(c => c.name === nameInput.value.trim());
      if (match) {
        if (!priceInput.value || priceInput.value === '0') {
          priceInput.value = Jalali.formatMoney(match.defaultPrice || match.baseCost);
        }
        if (match.category) catSelect.value = match.category;
      }
      recalcInvoiceTotals();
    });

    function updateRowTotal() {
      const q = parseFloat(Jalali.toEnglishDigits(qtyInput.value)) || 0;
      const p = Jalali.parseMoney(priceInput.value);
      priceInput.value = p ? Jalali.formatMoney(p) : '';
      const tot = q * p;
      totalInput.value = Jalali.formatMoney(tot);
      recalcInvoiceTotals();
    }

    qtyInput.addEventListener('input', updateRowTotal);
    priceInput.addEventListener('input', updateRowTotal);
    removeBtn.addEventListener('click', () => {
      if (tbody.children.length > 1) {
        row.remove();
        recalcInvoiceTotals();
      } else {
        showToast('حداقل یک قلم کالا در فاکتور الزامی است.', 'error');
      }
    });

    recalcInvoiceTotals();
  }

  function recalcInvoiceTotals() {
    const tbody = document.getElementById('items-tbody');
    let currentOrderTotal = 0;

    if (tbody) {
      tbody.querySelectorAll('tr').forEach(tr => {
        const q = parseFloat(Jalali.toEnglishDigits(tr.querySelector('.item-qty')?.value)) || 0;
        const p = Jalali.parseMoney(tr.querySelector('.item-price')?.value);
        currentOrderTotal += (q * p);
      });
    }

    const s = getFormSettings();
    const shipping = s.showShipping ? Jalali.parseMoney(document.getElementById('f-shipping')?.value) : 0;
    const prevBalance = s.showPrevBalance ? Jalali.parseMoney(document.getElementById('f-prev-balance')?.value) : 0;
    const paid = Jalali.parseMoney(document.getElementById('f-paid')?.value);

    // Form inputs formatting
    const currentOrderEl = document.getElementById('f-current-order');
    if (currentOrderEl) currentOrderEl.value = Jalali.formatMoney(currentOrderTotal);

    // Grand total = Current Order + Shipping + Prev Balance
    const grandTotal = currentOrderTotal + shipping + prevBalance;
    const remainingBalance = Math.max(0, grandTotal - paid);

    // Summary box display
    document.getElementById('sum-order').textContent = Jalali.formatMoney(currentOrderTotal, true);
    document.getElementById('sum-shipping').textContent = Jalali.formatMoney(shipping, true);
    document.getElementById('sum-prev').textContent = Jalali.formatMoney(prevBalance, true);
    document.getElementById('sum-grand').textContent = Jalali.formatMoney(grandTotal, true);
    document.getElementById('sum-remaining').textContent = Jalali.formatMoney(remainingBalance, true);
  }

  // =========================================================================
  // VIEW: INVOICES LIST
  // =========================================================================

  function renderInvoicesView() {
    const tbody = document.getElementById('invoices-tbody');
    if (!tbody) return;

    const search = (document.getElementById('search-invoices')?.value || '').trim().toLowerCase();
    const filterKind = document.getElementById('filter-kind')?.value || 'all';
    const filterStatus = document.getElementById('filter-status')?.value || 'all';

    let list = AppState.invoices;

    if (filterKind !== 'all') {
      list = list.filter(i => i.kind === filterKind);
    }
    if (filterStatus !== 'all') {
      list = list.filter(i => i.status === filterStatus);
    }
    if (search) {
      list = list.filter(i => {
        const text = `${i.partyName} ${i.partyCategory} ${i.notes} ${JSON.stringify(i.items || [])}`.toLowerCase();
        return text.includes(search);
      });
    }

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 40px; color: var(--text-muted);">
            هیچ فاکتوری با این مشخصات یافت نشد.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(inv => {
      const isSettlement = inv.kind === 'settlement';
      const kindBadge = isSettlement
        ? '<span class="badge badge-success" style="background: #dcfce7; color: #166534; font-weight: 700;">دریافت وجه / تسویه</span>'
        : inv.kind === 'sale'
          ? '<span class="badge badge-info">فروش</span>'
          : inv.kind === 'purchase'
            ? '<span class="badge badge-warning">خرید</span>'
            : '<span class="badge badge-danger">هزینه</span>';

      const statusBadge = inv.status === 'settled' || isSettlement
        ? '<span class="badge badge-success">تسویه‌شده</span>'
        : '<span class="badge badge-danger">نسیه</span>';

      return `
        <tr>
          <td>${kindBadge}</td>
          <td class="num">${inv.date || '-'}</td>
          <td><b>${inv.partyName || '-'}</b></td>
          <td>${inv.partyCategory ? `<span class="badge badge-info">${inv.partyCategory}</span>` : '-'}</td>
          <td class="num">${isSettlement ? '-' : Jalali.formatMoney(inv.currentOrder)}</td>
          <td class="num">${isSettlement ? '-' : inv.shippingCost ? Jalali.formatMoney(inv.shippingCost) : '-'}</td>
          <td class="num"><b>${Jalali.formatMoney(isSettlement ? inv.paidAmount : inv.grandTotal)}</b></td>
          <td class="num" style="color: ${inv.remainingBalance > 0 ? 'var(--danger)' : 'var(--text-muted)'}; font-weight: 700;">
            ${isSettlement ? '۰' : Jalali.formatMoney(inv.remainingBalance)}
          </td>
          <td>${statusBadge}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn btn-sm btn-secondary btn-view-inv" data-id="${inv.id}">${isSettlement ? 'رسید' : 'مشاهده'}</button>
              <button type="button" class="btn btn-sm btn-secondary btn-edit-inv" data-id="${inv.id}">ویرایش</button>
              ${!isSettlement && inv.status === 'credit' ? `<button type="button" class="btn btn-sm btn-success btn-settle-inv" data-id="${inv.id}">تسویه</button>` : ''}
              <button type="button" class="btn btn-sm btn-danger btn-del-inv" data-id="${inv.id}">&times;</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row button events
    tbody.querySelectorAll('.btn-view-inv').forEach(b => {
      b.addEventListener('click', () => showInvoiceDetailsModal(b.dataset.id));
    });
    tbody.querySelectorAll('.btn-edit-inv').forEach(b => {
      b.addEventListener('click', () => editInvoice(b.dataset.id));
    });
    tbody.querySelectorAll('.btn-settle-inv').forEach(b => {
      b.addEventListener('click', () => settleInvoice(b.dataset.id));
    });
    tbody.querySelectorAll('.btn-del-inv').forEach(b => {
      b.addEventListener('click', () => deleteInvoice(b.dataset.id));
    });
  }

  function showInvoiceDetailsModal(invId) {
    const inv = AppState.invoices.find(i => i.id === invId);
    if (!inv) return;

    if (inv.kind === 'settlement') {
      const bodyHtml = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 16px;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; background: #dcfce7; color: #166534; margin-bottom: 10px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 800; color: #166534; margin-bottom: 6px;">رسید دریافت وجه و تسویه حساب</h3>
          <div style="font-size: 13px; color: var(--text-muted);">شماره سند: <span class="num">${inv.id}</span> | تاریخ: <span class="num">${inv.date}</span></div>
          <div class="num" style="font-size: 26px; font-weight: 900; color: #166534; margin: 16px 0;">${Jalali.formatMoney(inv.paidAmount, true)}</div>
        </div>

        <div class="table-responsive">
          <table>
            <tbody>
              <tr><td style="width: 35%; font-weight: 700;">طرف حساب (پرداخت‌کننده):</td><td><b>${inv.partyName}</b> (${inv.partyCategory || 'متفرقه'})</td></tr>
              <tr><td style="font-weight: 700;">روش دریافت وجه:</td><td>${inv.paymentMethod || 'کارت‌به‌کارت'}</td></tr>
              <tr><td style="font-weight: 700;">شماره پیگیری / کد ارجاع:</td><td class="num">${inv.referenceNo || 'ثبت‌نشده'}</td></tr>
              <tr><td style="font-weight: 700;">بابت / توضیحات:</td><td>${inv.notes || 'تسویه حساب نسیه'}</td></tr>
            </tbody>
          </table>
        </div>
      `;

      const footerHtml = `
        <button type="button" class="btn btn-secondary" onclick="window.print()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          چاپ رسید
        </button>
        <button type="button" class="btn btn-secondary" id="modal-btn-edit-inv">
          ویرایش این سند
        </button>
        <button type="button" class="btn btn-primary" onclick="document.getElementById('modal-container').style.display='none'">بستن</button>
      `;

      openModal(`رسید واریز ${inv.partyName}`, bodyHtml, footerHtml);

      document.getElementById('modal-btn-edit-inv')?.addEventListener('click', () => {
        closeModal();
        editInvoice(inv.id);
      });
      return;
    }

    const itemsRows = (inv.items || []).map((it, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${it.name || '-'}</td>
        <td>${it.category || '-'}</td>
        <td class="num">${it.qty || 1}</td>
        <td class="num">${Jalali.formatMoney(it.price)} تومان</td>
        <td class="num">${Jalali.formatMoney(it.total || ((it.qty || 1) * (it.price || 0)))} تومان</td>
      </tr>
    `).join('');

    const bodyHtml = `
      <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <div style="font-size: 16px; font-weight: 700; color: var(--primary);">${inv.partyName || 'طرف حساب'}</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">دسته‌بندی: ${inv.partyCategory || 'متفرقه'}</div>
        </div>
        <div style="text-align: left;">
          <div>تاریخ: <span class="num">${inv.date}</span></div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">نوع: ${inv.kind === 'sale' ? 'فاکتور فروش' : inv.kind === 'purchase' ? 'فاکتور خرید' : 'هزینه'}</div>
        </div>
      </div>

      <div class="table-responsive" style="margin-bottom: 16px;">
        <table>
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th>شرح کالا</th>
              <th>دسته</th>
              <th>تعداد</th>
              <th>فی واحد</th>
              <th>مبلغ کل</th>
            </tr>
          </thead>
          <tbody>${itemsRows || '<tr><td colspan="6" style="text-align: center;">اقلامی ثبت نشده است</td></tr>'}</tbody>
        </table>
      </div>

      <div class="invoice-summary-box" style="margin-right: auto; max-width: 100%;">
        <div class="summary-row"><span>سفارش فعلی:</span><span class="num">${Jalali.formatMoney(inv.currentOrder, true)}</span></div>
        <div class="summary-row"><span>هزینه ارسال / پیک:</span><span class="num">${Jalali.formatMoney(inv.shippingCost, true)}</span></div>
        <div class="summary-row"><span>حساب قبلی:</span><span class="num">${Jalali.formatMoney(inv.prevBalance, true)}</span></div>
        <div class="summary-row grand-total"><span>جمع کل فاکتور:</span><span class="num">${Jalali.formatMoney(inv.grandTotal, true)}</span></div>
        <div class="summary-row"><span>مبلغ پرداخت‌شده (${inv.paymentMethod || 'نسیه'}):</span><span class="num">${Jalali.formatMoney(inv.paidAmount, true)}</span></div>
        <div class="summary-row remaining"><span>باقی‌مانده بدهی (نسیه):</span><span class="num">${Jalali.formatMoney(inv.remainingBalance, true)}</span></div>
      </div>
      ${inv.notes ? `<div style="margin-top: 14px; padding: 10px; background: #f8fafc; border-radius: 6px; font-size: 13px;"><b>یادداشت:</b> ${inv.notes}</div>` : ''}
    `;

    const footerHtml = `
      <button type="button" class="btn btn-secondary" onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        چاپ فاکتور
      </button>
      <button type="button" class="btn btn-secondary" id="modal-btn-edit-inv">
        ویرایش این فاکتور
      </button>
      <button type="button" class="btn btn-primary" onclick="document.getElementById('modal-container').style.display='none'">بستن</button>
    `;

    openModal(`جزئیات فاکتور شماره ${inv.id}`, bodyHtml, footerHtml);

    document.getElementById('modal-btn-edit-inv')?.addEventListener('click', () => {
      closeModal();
      editInvoice(inv.id);
    });
  }

  function editInvoice(invId) {
    const inv = AppState.invoices.find(i => i.id === invId);
    if (!inv) return;

    // Set hidden edit id
    document.getElementById('f-edit-id').value = inv.id;
    document.getElementById('form-title-text').textContent = `ویرایش سند (${inv.partyName})`;
    document.getElementById('btn-submit-label').textContent = 'ذخیره تغییرات سند';
    document.getElementById('btn-cancel-edit').style.display = 'inline-block';

    // Switch Kind
    const kindBtn = document.querySelector(`.form-mode-tab[data-kind="${inv.kind || 'sale'}"]`);
    if (kindBtn) kindBtn.click();

    // Switch to manual input method view
    document.querySelector('.method-btn[data-method="manual"]')?.click();

    // Fill form fields
    document.getElementById('f-party').value = inv.partyName || '';
    document.getElementById('f-category').value = inv.partyCategory || 'متفرقه';
    document.getElementById('f-date').value = inv.date || Jalali.todayJalali();

    if (inv.kind === 'settlement') {
      document.getElementById('f-settle-amount').value = inv.paidAmount ? Jalali.formatMoney(inv.paidAmount) : '';
      document.getElementById('f-settle-method').value = inv.paymentMethod || 'کارت‌به‌کارت';
      document.getElementById('f-settle-ref').value = inv.referenceNo || '';
      document.getElementById('f-settle-notes').value = inv.notes || '';
    } else {
      document.getElementById('f-shipping').value = inv.shippingCost ? Jalali.formatMoney(inv.shippingCost) : '';
      document.getElementById('f-prev-balance').value = inv.prevBalance ? Jalali.formatMoney(inv.prevBalance) : '';
      document.getElementById('f-paid').value = inv.paidAmount ? Jalali.formatMoney(inv.paidAmount) : '';
      document.getElementById('f-pay-method').value = inv.paymentMethod || 'نسیه';
      document.getElementById('f-notes').value = inv.notes || '';

      // Populate Items
      const tbody = document.getElementById('items-tbody');
      tbody.innerHTML = '';
      if (inv.items && inv.items.length > 0) {
        inv.items.forEach(it => addItemRow(it));
      } else {
        addItemRow();
      }

      recalcInvoiceTotals();
    }

    updatePartyBalanceBadge();
    switchTab('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`سند ${inv.partyName} در فرم بارگذاری شد.`, 'info');
  }

  function cancelInvoiceEdit() {
    document.getElementById('f-edit-id').value = '';
    document.getElementById('form-title-text').textContent = 'ثبت سند جدید';
    document.getElementById('btn-submit-label').textContent = 'ثبت و ذخیره فاکتور';
    document.getElementById('btn-cancel-edit').style.display = 'none';
    document.getElementById('invoice-form').reset();
    document.getElementById('f-shipping').value = '0';
    document.getElementById('f-prev-balance').value = '0';
    document.getElementById('f-paid').value = '0';
    document.getElementById('f-settle-amount').value = '0';
    const badge = document.getElementById('party-balance-badge');
    if (badge) badge.style.display = 'none';

    // Reset to sale kind
    document.querySelector('.form-mode-tab[data-kind="sale"]')?.click();
    resetInvoiceForm();
  }

  async function settleInvoice(invId) {
    const inv = AppState.invoices.find(i => i.id === invId);
    if (!inv) return;

    if (confirm(`آیا مانده بدهی فاکتور ${inv.partyName} به مبلغ ${Jalali.formatMoney(inv.remainingBalance, true)} تسویه شود؟`)) {
      inv.paidAmount = inv.grandTotal;
      inv.remainingBalance = 0;
      inv.status = 'settled';
      inv.paymentMethod = 'تسویه کامل';
      await TarazakStorage.saveItem('invoices', inv);
      showToast('فاکتور با موفقیت تسویه شد.');
      await reloadData();
      renderInvoicesView();
    }
  }

  async function deleteInvoice(invId) {
    if (confirm('آیا از حذف این سند اطمینان دارید؟')) {
      await TarazakStorage.deleteItem('invoices', invId);
      showToast('سند با موفقیت حذف شد.');
      await reloadData();
      renderInvoicesView();
      renderPeopleView();
    }
  }

  // =========================================================================
  // VIEW: PEOPLE & CONTACTS
  // =========================================================================

  function renderPeopleView() {
    const tbody = document.getElementById('people-tbody');
    if (!tbody) return;

    const search = (document.getElementById('search-people')?.value || '').trim().toLowerCase();
    const filterCat = document.getElementById('filter-people-category')?.value || 'all';

    // Calculate dynamic debts accurately
    let totalCustomerDebt = 0;
    AppState.people.forEach(p => {
      const b = calculatePersonBalance(p.name);
      if (b > 0) totalCustomerDebt += b;
    });

    document.getElementById('metric-total-debt').textContent = Jalali.formatMoney(totalCustomerDebt, true);
    document.getElementById('metric-people-count').textContent = Jalali.toPersianDigits(AppState.people.length);

    let list = AppState.people;
    if (filterCat !== 'all') {
      list = list.filter(p => p.category === filterCat);
    }
    if (search) {
      list = list.filter(p => `${p.name} ${p.phone} ${p.category} ${p.notes}`.toLowerCase().includes(search));
    }

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">طرف حسابی یافت نشد.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(p => {
      const debt = calculatePersonBalance(p.name);
      return `
        <tr>
          <td><b>${p.name}</b></td>
          <td>${p.role === 'customer' ? '<span class="badge badge-info">مشتری</span>' : '<span class="badge badge-warning">تأمین‌کننده</span>'}</td>
          <td><span class="badge badge-info">${p.category || 'متفرقه'}</span></td>
          <td class="num">${p.phone || '-'}</td>
          <td class="num" style="font-weight: 700; color: ${debt > 0 ? 'var(--danger)' : debt < 0 ? 'var(--primary)' : 'var(--success)'};">
            ${debt > 0 ? `${Jalali.formatMoney(debt)} بدهکار` : debt < 0 ? `${Jalali.formatMoney(Math.abs(debt))} بستانکار` : 'تسویه'}
          </td>
          <td>${p.notes || '-'}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn btn-sm btn-success btn-person-settle" data-name="${p.name}">+ دریافت وجه</button>
              <button type="button" class="btn btn-sm btn-secondary btn-person-statement" data-name="${p.name}">صورتحساب</button>
              <button type="button" class="btn btn-sm btn-secondary btn-edit-person" data-id="${p.id}">ویرایش</button>
              <button type="button" class="btn btn-sm btn-danger btn-del-person" data-id="${p.id}">&times;</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-person-settle').forEach(b => {
      b.addEventListener('click', () => openQuickSettlementModal(b.dataset.name));
    });
    tbody.querySelectorAll('.btn-edit-person').forEach(b => {
      b.addEventListener('click', () => showEditPersonModal(b.dataset.id));
    });
    tbody.querySelectorAll('.btn-person-statement').forEach(b => {
      b.addEventListener('click', () => showPersonStatementModal(b.dataset.name));
    });
    tbody.querySelectorAll('.btn-del-person').forEach(b => {
      b.addEventListener('click', () => deletePerson(b.dataset.id));
    });
  }

  function showEditPersonModal(personId) {
    const p = AppState.people.find(x => x.id === personId);
    if (!p) return;

    const bodyHtml = `
      <div class="form-grid-3" style="grid-template-columns: 1fr;">
        <div class="form-group">
          <label>نام شخص یا فروشگاه *</label>
          <input type="text" id="edit-p-name" value="${p.name || ''}" required>
        </div>
        <div class="form-group">
          <label>نقش</label>
          <select id="edit-p-role">
            <option value="customer" ${p.role === 'customer' ? 'selected' : ''}>مشتری</option>
            <option value="supplier" ${p.role === 'supplier' ? 'selected' : ''}>تأمین‌کننده</option>
          </select>
        </div>
        <div class="form-group">
          <label>دسته‌بندی طرف حساب</label>
          <input type="text" id="edit-p-cat" list="categories-list" value="${p.category || 'متفرقه'}">
        </div>
        <div class="form-group">
          <label>شماره تماس</label>
          <input type="tel" id="edit-p-phone" value="${p.phone || ''}">
        </div>
        <div class="form-group">
          <label>مانده بدهی اولیه از قبل (تومان - اختیاری)</label>
          <input type="text" id="edit-p-opening" class="num" value="${p.openingBalance ? Jalali.formatMoney(p.openingBalance) : ''}" placeholder="0">
          <span style="font-size: 11px; color: var(--text-muted);">بدهی‌های قدیمی از دفتر قبل از شروع کار با اپ</span>
        </div>
        <div class="form-group">
          <label>یادداشت</label>
          <input type="text" id="edit-p-notes" value="${p.notes || ''}">
        </div>
      </div>
    `;

    const footerHtml = `
      <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-container').style.display='none'">انصراف</button>
      <button type="button" id="btn-save-edit-person" class="btn btn-primary">ذخیره تغییرات طرف حساب</button>
    `;

    openModal(`ویرایش طرف حساب: ${p.name}`, bodyHtml, footerHtml);

    document.getElementById('edit-p-opening')?.addEventListener('input', e => {
      const v = Jalali.parseMoney(e.target.value);
      e.target.value = v ? Jalali.formatMoney(v) : '';
    });

    document.getElementById('btn-save-edit-person')?.addEventListener('click', async () => {
      const newName = document.getElementById('edit-p-name')?.value.trim();
      if (!newName) return showToast('نام الزامی است.', 'error');

      const oldName = p.name;
      const newCat = document.getElementById('edit-p-cat')?.value.trim() || 'متفرقه';
      const opening = Jalali.parseMoney(document.getElementById('edit-p-opening')?.value);

      p.name = newName;
      p.role = document.getElementById('edit-p-role')?.value;
      p.category = newCat;
      p.phone = document.getElementById('edit-p-phone')?.value.trim();
      p.openingBalance = opening;
      p.notes = document.getElementById('edit-p-notes')?.value.trim();

      await TarazakStorage.saveItem('people', p);

      // If name or category changed, update associated invoices as well so history and debts stay in sync!
      if (oldName !== newName || p.category !== newCat) {
        for (const inv of AppState.invoices) {
          if (inv.partyName === oldName) {
            inv.partyName = newName;
            inv.partyCategory = newCat;
            await TarazakStorage.saveItem('invoices', inv);
          }
        }
      }

      await TarazakStorage.updateAutocomplete(newName, newCat, []);
      closeModal();
      showToast(`اطلاعات "${newName}" با موفقیت ویرایش و ذخیره شد.`);
      await reloadData();
      renderPeopleView();
    });
  }

  async function deletePerson(personId) {
    const p = AppState.people.find(x => x.id === personId);
    if (!p) return;
    if (confirm(`آیا از حذف "${p.name}" از لیست طرف‌حساب‌ها اطمینان دارید؟`)) {
      await TarazakStorage.deleteItem('people', personId);
      showToast('طرف حساب حذف شد.');
      await reloadData();
      renderPeopleView();
    }
  }

  function showPersonStatementModal(personName) {
    const person = AppState.people.find(p => p.name === personName) || {};
    const currentBalance = calculatePersonBalance(personName);

    const personDocs = AppState.invoices.filter(i => i.partyName === personName);
    personDocs.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let runningDebt = person.openingBalance || 0;
    let totalBilled = 0;
    let totalPaid = 0;

    const rows = [];
    if (person.openingBalance) {
      totalBilled += person.openingBalance;
      rows.push(`
        <tr style="background: #fefce8;">
          <td>-</td>
          <td class="num">-</td>
          <td><b>مانده بدهی از قبل (انتقال از دفتر قدیمی)</b></td>
          <td class="num font-bold">${Jalali.formatMoney(person.openingBalance)}</td>
          <td class="num">-</td>
          <td class="num font-bold" style="color: var(--danger);">${Jalali.formatMoney(runningDebt)}</td>
        </tr>
      `);
    }

    personDocs.forEach((inv, idx) => {
      let debit = 0;
      let credit = 0;
      let desc = '';

      if (inv.kind === 'sale') {
        debit = (inv.currentOrder || 0) + (inv.shippingCost || 0);
        credit = (inv.paidAmount || 0);
        const itemsList = (inv.items || []).map(i => `${i.name} (${i.qty})`).join('، ');
        desc = `فاکتور فروش ${itemsList ? `— ${itemsList}` : ''}`;
      } else if (inv.kind === 'settlement') {
        debit = 0;
        credit = inv.paidAmount || 0;
        desc = `دریافت وجه واریزی (${inv.paymentMethod || 'کارت‌به‌کارت'})${inv.referenceNo ? ` [کد: ${inv.referenceNo}]` : ''} ${inv.notes ? `(${inv.notes})` : ''}`;
      } else if (inv.kind === 'purchase') {
        debit = 0;
        credit = inv.grandTotal || 0;
        desc = `فاکتور خرید کالا`;
      }

      runningDebt += (debit - credit);
      totalBilled += debit;
      totalPaid += credit;

      rows.push(`
        <tr>
          <td>${idx + 1}</td>
          <td class="num">${inv.date || '-'}</td>
          <td>${desc}</td>
          <td class="num">${debit > 0 ? Jalali.formatMoney(debit) : '-'}</td>
          <td class="num" style="color: var(--success); font-weight: 600;">${credit > 0 ? Jalali.formatMoney(credit) : '-'}</td>
          <td class="num font-bold" style="color: ${runningDebt > 0 ? 'var(--danger)' : runningDebt < 0 ? 'var(--primary)' : 'var(--success)'};">
            ${runningDebt > 0 ? `${Jalali.formatMoney(runningDebt)} بدهکار` : runningDebt < 0 ? `${Jalali.formatMoney(Math.abs(runningDebt))} بستانکار` : 'تسویه'}
          </td>
        </tr>
      `);
    });

    const bodyHtml = `
      <div style="border-bottom: 2px solid var(--border-color); padding-bottom: 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="font-size: 18px; font-weight: 800; color: var(--primary);">${personName}</h3>
          <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
            دسته‌بندی: <b>${person.category || 'متفرقه'}</b> | تلفن: <span class="num">${person.phone || 'ثبت‌نشده'}</span>
          </div>
        </div>
        <div style="text-align: left; background: #f8fafc; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="font-size: 12px; color: var(--text-muted);">مانده حساب نهایی:</div>
          <div class="num" style="font-size: 17px; font-weight: 800; color: ${currentBalance > 0 ? 'var(--danger)' : 'var(--success)'};">
            ${currentBalance > 0 ? `${Jalali.formatMoney(currentBalance, true)} (بدهکار)` : currentBalance < 0 ? `${Jalali.formatMoney(Math.abs(currentBalance), true)} (بستانکار)` : 'تسویه کامل'}
          </div>
        </div>
      </div>

      <div class="table-responsive" style="margin-bottom: 16px;">
        <table>
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th style="width: 14%;">تاریخ</th>
              <th>شرح تراکنش / سند</th>
              <th style="width: 17%;">بدهکار (خرید + ارسال)</th>
              <th style="width: 17%;">بستانکار (واریزی)</th>
              <th style="width: 20%;">مانده بدهی</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length > 0 ? rows.join('') : '<tr><td colspan="6" style="text-align: center; padding: 20px;">هیچ سندی برای این طرف‌حساب ثبت نشده است.</td></tr>'}
          </tbody>
          <tfoot>
            <tr style="background: #f1f5f9; font-weight: 800;">
              <td colspan="3" style="text-align: left; padding: 10px;">جمع کل گردش:</td>
              <td class="num">${Jalali.formatMoney(totalBilled)} تومان</td>
              <td class="num" style="color: var(--success);">${Jalali.formatMoney(totalPaid)} تومان</td>
              <td class="num" style="color: ${currentBalance > 0 ? 'var(--danger)' : 'var(--success)'};">${Jalali.formatMoney(currentBalance)} تومان</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    const footerHtml = `
      <button type="button" id="stmt-btn-settle" class="btn btn-success" style="display: flex; align-items: center; gap: 6px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
        <span>+ ثبت واریزی / تسویه</span>
      </button>
      <button type="button" class="btn btn-secondary" onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        چاپ صورتحساب
      </button>
      <button type="button" class="btn btn-primary" onclick="document.getElementById('modal-container').style.display='none'">بستن</button>
    `;

    openModal(`صورتحساب مشتری: ${personName}`, bodyHtml, footerHtml);

    document.getElementById('stmt-btn-settle')?.addEventListener('click', () => {
      closeModal();
      openQuickSettlementModal(personName);
    });
  }

  // =========================================================================
  // VIEW: CATALOG (جدول مرجع کالاها)
  // =========================================================================

  function renderCatalogView() {
    const tbody = document.getElementById('catalog-tbody');
    if (!tbody) return;

    if (AppState.catalog.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px;">کالایی در جدول مرجع تعریف نشده است.</td></tr>';
      return;
    }

    tbody.innerHTML = AppState.catalog.map(c => `
      <tr>
        <td><b>${c.name}</b></td>
        <td><span class="badge ${c.category === 'دسته A' ? 'badge-primary' : 'badge-info'}">${c.category}</span></td>
        <td>${c.unit || 'کیلو'}</td>
        <td class="num">${Jalali.formatMoney(c.baseCost)} تومان</td>
        <td class="num">${Jalali.formatMoney(c.defaultPrice)} تومان</td>
        <td class="num">${Jalali.toPersianDigits(c.stock || 0)} ${c.unit || ''}</td>
        <td>${c.notes || '-'}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn btn-sm btn-secondary btn-edit-cat" data-id="${c.id}">ویرایش</button>
            <button type="button" class="btn btn-sm btn-danger btn-del-cat" data-id="${c.id}">&times;</button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-edit-cat').forEach(b => {
      b.addEventListener('click', () => showEditCatalogModal(b.dataset.id));
    });
    tbody.querySelectorAll('.btn-del-cat').forEach(b => {
      b.addEventListener('click', async () => {
        if (confirm('آیا از حذف این کالا از جدول مرجع اطمینان دارید؟')) {
          await TarazakStorage.deleteItem('catalog', b.dataset.id);
          await reloadData();
          renderCatalogView();
        }
      });
    });
  }

  function showEditCatalogModal(itemId) {
    const c = AppState.catalog.find(x => x.id === itemId);
    if (!c) return;

    const bodyHtml = `
      <div class="form-grid-3" style="grid-template-columns: 1fr;">
        <div class="form-group">
          <label>نام کالا *</label>
          <input type="text" id="edit-c-name" value="${c.name || ''}" required>
        </div>
        <div class="form-group">
          <label>دسته‌بندی</label>
          <select id="edit-c-cat">
            <option value="دسته A" ${c.category === 'دسته A' ? 'selected' : ''}>دسته A (عمده / کیلویی)</option>
            <option value="دسته A+" ${c.category === 'دسته A+' ? 'selected' : ''}>دسته A+ (بسته‌بندی کوچک / تک‌نفره)</option>
            <option value="لوازم و ظروف" ${c.category === 'لوازم و ظروف' ? 'selected' : ''}>لوازم و ظروف</option>
            <option value="متفرقه" ${c.category === 'متفرقه' ? 'selected' : ''}>متفرقه</option>
          </select>
        </div>
        <div class="form-group">
          <label>واحد اندازه‌گیری</label>
          <input type="text" id="edit-c-unit" value="${c.unit || 'کیلو'}">
        </div>
        <div class="form-group">
          <label>بهای تمام‌شده پایه (خرید/تولید - تومان)</label>
          <input type="text" id="edit-c-cost" class="num" value="${c.baseCost ? Jalali.formatMoney(c.baseCost) : '0'}">
        </div>
        <div class="form-group">
          <label>قیمت فروش پیشنهادی (تومان)</label>
          <input type="text" id="edit-c-price" class="num" value="${c.defaultPrice ? Jalali.formatMoney(c.defaultPrice) : '0'}">
        </div>
        <div class="form-group">
          <label>موجودی</label>
          <input type="number" id="edit-c-stock" value="${c.stock || 0}">
        </div>
        <div class="form-group">
          <label>توضیحات</label>
          <input type="text" id="edit-c-notes" value="${c.notes || ''}">
        </div>
      </div>
    `;

    const footerHtml = `
      <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-container').style.display='none'">انصراف</button>
      <button type="button" id="btn-save-edit-cat" class="btn btn-primary">ذخیره تغییرات کالا</button>
    `;

    openModal(`ویرایش کالا در جدول مرجع (${c.name})`, bodyHtml, footerHtml);

    document.getElementById('btn-save-edit-cat')?.addEventListener('click', async () => {
      const name = document.getElementById('edit-c-name')?.value.trim();
      if (!name) return showToast('نام کالا الزامی است.', 'error');

      c.name = name;
      c.category = document.getElementById('edit-c-cat')?.value;
      c.unit = document.getElementById('edit-c-unit')?.value.trim() || 'عدد';
      c.baseCost = Jalali.parseMoney(document.getElementById('edit-c-cost')?.value);
      c.defaultPrice = Jalali.parseMoney(document.getElementById('edit-c-price')?.value);
      c.stock = parseFloat(document.getElementById('edit-c-stock')?.value) || 0;
      c.notes = document.getElementById('edit-c-notes')?.value.trim();

      await TarazakStorage.saveItem('catalog', c);
      closeModal();
      showToast(`کالای "${c.name}" با موفقیت ویرایش شد.`);
      await reloadData();
      renderCatalogView();
    });
  }

  // =========================================================================
  // VIEW: REPORTS & PROFIT ANALYTICS
  // =========================================================================

  function renderReportsView() {
    const periodReports = TarazakReports.groupInvoicesByPeriods(AppState.invoices, AppState.catalog, AppState.people);
    const activeData = periodReports[AppState.activePeriod] || periodReports.allTime;

    const summary = activeData.summary;

    // Metrics
    document.getElementById('rep-total-sales').textContent = Jalali.formatMoney(summary.totalSalesRevenue, true);
    document.getElementById('rep-total-expenses').textContent = Jalali.formatMoney(summary.totalOutflow, true);
    
    const netEl = document.getElementById('rep-net-balance');
    netEl.textContent = Jalali.formatMoney(summary.netBalance, true);
    netEl.style.color = summary.netBalance >= 0 ? 'var(--success)' : 'var(--danger)';

    document.getElementById('rep-shipping-collected').textContent = Jalali.formatMoney(summary.totalShippingCollected, true);

    // Sub-view 1: Product Profit Table
    const prodTbody = document.getElementById('rep-products-tbody');
    if (prodTbody) {
      if (activeData.products.length === 0) {
        prodTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 25px;">هیچ فروش کالایی در این دوره ثبت نشده است.</td></tr>';
      } else {
        prodTbody.innerHTML = activeData.products.map(p => `
          <tr>
            <td><b>${p.name}</b></td>
            <td><span class="badge badge-info">${p.category}</span></td>
            <td><span class="badge ${p.abc === 'A' ? 'badge-success' : p.abc === 'B' ? 'badge-warning' : 'badge-danger'}">رده ${p.abc}</span></td>
            <td class="num">${Jalali.toPersianDigits(p.qty)}</td>
            <td class="num">${Jalali.formatMoney(p.revenue)}</td>
            <td class="num">${Jalali.formatMoney(p.totalCost)}</td>
            <td class="num" style="font-weight: 700; color: ${p.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">
              ${Jalali.formatMoney(p.profit)}
            </td>
            <td class="num"><b>٪${Jalali.toPersianDigits(p.margin)}</b></td>
          </tr>
        `).join('');
      }
    }

    // Sub-view 2: Customer Rank Table
    const custTbody = document.getElementById('rep-customers-tbody');
    if (custTbody) {
      if (activeData.customers.length === 0) {
        custTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 25px;">هیچ فروش به مشتری در این دوره ثبت نشده است.</td></tr>';
      } else {
        custTbody.innerHTML = activeData.customers.map(c => `
          <tr>
            <td><b>${c.name}</b></td>
            <td><span class="badge badge-info">${c.category}</span></td>
            <td class="num">${Jalali.toPersianDigits(c.count)} فاکتور</td>
            <td class="num"><b>${Jalali.formatMoney(c.totalSales)}</b></td>
            <td class="num" style="font-weight: 700; color: ${c.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">
              ${Jalali.formatMoney(c.profit)}
            </td>
            <td class="num"><b>٪${Jalali.toPersianDigits(c.margin)}</b></td>
            <td class="num">${Jalali.formatMoney(c.averageInvoice)}</td>
            <td class="num" style="color: ${c.currentDebt > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight: 700;">
              ${c.currentDebt > 0 ? Jalali.formatMoney(c.currentDebt) : 'تسویه'}
            </td>
          </tr>
        `).join('');
      }
    }

    // Sub-view 3: Category Breakdown
    document.getElementById('breakdown-cat-a').textContent = Jalali.formatMoney(summary.totalSalesCategoryA, true);
    document.getElementById('breakdown-cat-aplus').textContent = Jalali.formatMoney(summary.totalSalesCategoryAPlus, true);
  }

  // =========================================================================
  // SETUP EVENT LISTENERS & INITIALIZATION
  // =========================================================================

  document.addEventListener('DOMContentLoaded', async () => {
    // Seed initial data if first run
    await TarazakStorage.seedInitialDataIfEmpty();
    await reloadData();

    // Date in header
    const dateBadge = document.getElementById('current-jalali-date');
    if (dateBadge) {
      const meta = Jalali.dateMeta(Jalali.todayJalali());
      dateBadge.textContent = meta.fullTitle;
    }

    // Navigation Events
    document.querySelectorAll('[data-tab]').forEach(el => {
      el.addEventListener('click', () => switchTab(el.dataset.tab));
    });

    // Form: Kind Switcher (Sale, Purchase, Expense, Settlement)
    document.querySelectorAll('.form-mode-tab[data-kind]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.form-mode-tab[data-kind]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        AppState.formKind = btn.dataset.kind;
        document.getElementById('f-kind').value = btn.dataset.kind;

        const partyLabel = document.querySelector('label[for="f-party"]');
        const itemsSec = document.getElementById('invoice-items-section');
        const settleSec = document.getElementById('settlement-fields-section');
        const summaryBox = document.getElementById('invoice-summary-box');
        const submitLabel = document.getElementById('btn-submit-label');
        const formTitle = document.getElementById('form-title-text');

        if (btn.dataset.kind === 'settlement') {
          if (partyLabel) partyLabel.innerHTML = 'طرف حساب (مشتری واریزکننده) <span class="required">*</span>';
          if (itemsSec) itemsSec.style.display = 'none';
          if (settleSec) settleSec.style.display = 'block';
          if (summaryBox) summaryBox.style.display = 'none';
          if (submitLabel) submitLabel.textContent = 'ثبت دریافت وجه / تسویه نسیه';
          if (formTitle && !document.getElementById('f-edit-id')?.value) formTitle.textContent = 'ثبت دریافت وجه / تسویه نسیه';
        } else {
          if (itemsSec) itemsSec.style.display = 'block';
          if (settleSec) settleSec.style.display = 'none';
          if (summaryBox) summaryBox.style.display = 'flex';
          if (submitLabel) submitLabel.textContent = document.getElementById('f-edit-id')?.value ? 'ذخیره تغییرات سند' : 'ثبت و ذخیره فاکتور';
          if (formTitle && !document.getElementById('f-edit-id')?.value) formTitle.textContent = 'ثبت سند جدید';

          if (btn.dataset.kind === 'sale') partyLabel.innerHTML = 'طرف حساب (نام مشتری) <span class="required">*</span>';
          else if (btn.dataset.kind === 'purchase') partyLabel.innerHTML = 'طرف حساب (نام فروشنده / تأمین‌کننده) <span class="required">*</span>';
          else partyLabel.innerHTML = 'بابت هزینه (پیک، لوازم، دستمزد و...) <span class="required">*</span>';
        }

        updatePartyBalanceBadge();
      });
    });

    // Form: Input Method Switcher (Manual vs OCR/Text)
    document.querySelectorAll('.method-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        AppState.inputMethod = btn.dataset.method;

        const manualForm = document.getElementById('invoice-form');
        const ocrSection = document.getElementById('ocr-text-section');

        if (btn.dataset.method === 'manual') {
          manualForm.style.display = 'block';
          ocrSection.style.display = 'none';
        } else {
          manualForm.style.display = 'none';
          ocrSection.style.display = 'block';
        }
      });
    });

    // Form: Personalization Settings Toggle Panel
    document.getElementById('btn-toggle-form-settings')?.addEventListener('click', () => {
      const pnl = document.getElementById('form-settings-panel');
      if (pnl) pnl.style.display = pnl.style.display === 'none' ? 'block' : 'none';
    });

    ['pref-show-shipping', 'pref-show-prev-balance', 'pref-show-category', 'pref-show-item-category', 'pref-show-notes'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        const newSettings = {
          showShipping: document.getElementById('pref-show-shipping')?.checked ?? true,
          showPrevBalance: document.getElementById('pref-show-prev-balance')?.checked ?? true,
          showCategory: document.getElementById('pref-show-category')?.checked ?? true,
          showItemCategory: document.getElementById('pref-show-item-category')?.checked ?? true,
          showNotes: document.getElementById('pref-show-notes')?.checked ?? true
        };
        saveFormSettings(newSettings);
        applyFormSettings();
      });
    });

    // Customer / Party input listener for live balance hint
    document.getElementById('f-party')?.addEventListener('input', updatePartyBalanceBadge);
    document.getElementById('f-party')?.addEventListener('change', updatePartyBalanceBadge);

    // Header Quick Settle Button in People View
    document.getElementById('btn-people-quick-settle')?.addEventListener('click', () => openQuickSettlementModal());

    // Add Item Row Button
    document.getElementById('btn-add-item-row')?.addEventListener('click', () => addItemRow());

    // Cancel Invoice Edit Button
    document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
      cancelInvoiceEdit();
      showToast('ویرایش سند لغو شد.', 'info');
    });

    // Shipping & Prev Balance & Paid input listeners
    ['f-shipping', 'f-prev-balance', 'f-paid', 'f-settle-amount'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', e => {
        const val = Jalali.parseMoney(e.target.value);
        e.target.value = val ? Jalali.formatMoney(val) : '';
        recalcInvoiceTotals();
      });
    });

    // Invoice Form Submit
    document.getElementById('invoice-form')?.addEventListener('submit', async e => {
      e.preventDefault();

      const partyName = document.getElementById('f-party').value.trim();
      const partyCategory = document.getElementById('f-category').value.trim() || 'متفرقه';
      const date = document.getElementById('f-date').value.trim();
      const kind = document.getElementById('f-kind').value;
      const editId = document.getElementById('f-edit-id')?.value;

      if (!partyName) {
        showToast('لطفاً نام طرف حساب را وارد کنید.', 'error');
        return;
      }

      // Handle Settlement Kind
      if (kind === 'settlement') {
        const settleAmount = Jalali.parseMoney(document.getElementById('f-settle-amount')?.value);
        if (!settleAmount || settleAmount <= 0) {
          showToast('لطفاً مبلغ دریافتی را به تومان وارد کنید.', 'error');
          return;
        }

        const settleMethod = document.getElementById('f-settle-method')?.value || 'کارت‌به‌کارت';
        const settleRef = document.getElementById('f-settle-ref')?.value.trim() || '';
        const settleNotes = document.getElementById('f-settle-notes')?.value.trim() || 'تسویه حساب نسیه';

        const settlementDoc = {
          id: editId || 'stl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          kind: 'settlement',
          date,
          partyName,
          partyCategory,
          items: [],
          currentOrder: 0,
          shippingCost: 0,
          prevBalance: 0,
          grandTotal: settleAmount,
          paidAmount: settleAmount,
          paymentMethod: settleMethod,
          referenceNo: settleRef,
          remainingBalance: 0,
          status: 'settled',
          notes: settleNotes,
          createdAt: new Date().toISOString()
        };

        await TarazakStorage.saveItem('invoices', settlementDoc);

        // Auto-add new person if not exists
        const existingPerson = AppState.people.find(p => p.name.toLowerCase() === partyName.toLowerCase());
        if (!existingPerson) {
          await TarazakStorage.saveItem('people', {
            name: partyName,
            role: 'customer',
            category: partyCategory,
            notes: 'ثبت خودکار از رسید دریافت'
          });
        }

        await TarazakStorage.updateAutocomplete(partyName, partyCategory, []);

        cancelInvoiceEdit();
        showToast(`دریافت مبلغ ${Jalali.formatMoney(settleAmount, true)} از ${partyName} ثبت شد.`);
        await reloadData();
        switchTab('invoices');
        return;
      }

      // Extract items from table
      const items = [];
      document.querySelectorAll('#items-tbody tr').forEach(tr => {
        const name = tr.querySelector('.item-name')?.value.trim();
        const cat = tr.querySelector('.item-cat')?.value;
        const qty = parseFloat(Jalali.toEnglishDigits(tr.querySelector('.item-qty')?.value)) || 1;
        const price = Jalali.parseMoney(tr.querySelector('.item-price')?.value);
        const total = qty * price;
        if (name) {
          items.push({ name, category: cat, qty, price, total });
        }
      });

      if (items.length === 0) {
        showToast('حداقل یک قلم کالا در فاکتور باید وارد شود.', 'error');
        return;
      }

      const formPrefs = getFormSettings();
      const currentOrder = items.reduce((acc, it) => acc + it.total, 0);
      const shippingCost = formPrefs.showShipping ? Jalali.parseMoney(document.getElementById('f-shipping')?.value) : 0;
      const prevBalance = formPrefs.showPrevBalance ? Jalali.parseMoney(document.getElementById('f-prev-balance')?.value) : 0;
      const grandTotal = currentOrder + shippingCost + prevBalance;
      const paidAmount = Jalali.parseMoney(document.getElementById('f-paid')?.value);
      const remainingBalance = Math.max(0, grandTotal - paidAmount);
      const paymentMethod = document.getElementById('f-pay-method')?.value || 'نسیه';
      const notes = formPrefs.showNotes ? document.getElementById('f-notes')?.value.trim() : '';

      let invoiceToSave;

      if (editId) {
        const existing = AppState.invoices.find(i => i.id === editId) || {};
        invoiceToSave = {
          ...existing,
          kind,
          date,
          partyName,
          partyCategory,
          items,
          currentOrder,
          shippingCost,
          prevBalance,
          grandTotal,
          paidAmount,
          paymentMethod,
          remainingBalance,
          status: remainingBalance <= 0 && paidAmount > 0 ? 'settled' : 'credit',
          notes,
          updatedAt: new Date().toISOString()
        };
      } else {
        invoiceToSave = {
          kind,
          inputMethod: 'manual',
          date,
          partyName,
          partyCategory,
          items,
          currentOrder,
          shippingCost,
          prevBalance,
          grandTotal,
          paidAmount,
          paymentMethod,
          remainingBalance,
          status: remainingBalance <= 0 && paidAmount > 0 ? 'settled' : 'credit',
          notes
        };
      }

      await TarazakStorage.saveItem('invoices', invoiceToSave);

      if (editId) {
        cancelInvoiceEdit();
        showToast('تغییرات سند با موفقیت ذخیره شد.');
      } else {
        showToast('سند جدید با موفقیت ذخیره شد.');
      }

      // Auto-add new person if not exists
      const existingPerson = AppState.people.find(p => p.name.toLowerCase() === partyName.toLowerCase());
      if (!existingPerson) {
        await TarazakStorage.saveItem('people', {
          name: partyName,
          role: kind === 'sale' ? 'customer' : 'supplier',
          category: partyCategory,
          notes: 'ثبت خودکار از فاکتور'
        });
      }

      // Update autocomplete memory
      await TarazakStorage.updateAutocomplete(partyName, partyCategory, items);

      await reloadData();
      cancelInvoiceEdit();
      switchTab('invoices');
    });

    // Parse OCR / Free Text Button
    document.getElementById('btn-parse-ocr')?.addEventListener('click', () => {
      const raw = document.getElementById('ocr-raw-input')?.value.trim();
      if (!raw) {
        showToast('لطفاً متن فاکتور یا یادداشت را وارد کنید.', 'error');
        return;
      }

      let parsed = null;
      if (raw.includes('طرف حساب:') || raw.includes('سفارش فعلی:')) {
        parsed = TarazakParser.parsePhase1Block(raw);
      } else {
        parsed = TarazakParser.parseFreeTextNotes(raw);
      }

      if (!parsed) {
        showToast('الگوی فاکتور در متن تشخیص داده نشد.', 'error');
        return;
      }

      // Populate Form
      document.getElementById('f-party').value = parsed.partyName || '';
      document.getElementById('f-category').value = parsed.partyCategory || 'متفرقه';
      document.getElementById('f-date').value = parsed.date || Jalali.todayJalali();
      document.getElementById('f-shipping').value = parsed.shippingCost ? Jalali.formatMoney(parsed.shippingCost) : '';
      document.getElementById('f-prev-balance').value = parsed.prevBalance ? Jalali.formatMoney(parsed.prevBalance) : '';
      document.getElementById('f-paid').value = parsed.paidAmount ? Jalali.formatMoney(parsed.paidAmount) : '';
      document.getElementById('f-notes').value = parsed.notes || '';

      const itemsTbody = document.getElementById('items-tbody');
      itemsTbody.innerHTML = '';
      if (parsed.items && parsed.items.length > 0) {
        parsed.items.forEach(it => addItemRow(it));
      } else {
        addItemRow({ name: 'باقلوا', qty: 1, price: parsed.currentOrder });
      }

      // Switch to manual view for review
      document.querySelector('.method-btn[data-method="manual"]').click();
      recalcInvoiceTotals();
      showToast('متن با موفقیت تحلیل و فرم پر شد. لطفاً بررسی و تأیید نمایید.');
    });

    // Batch Parse & Save All Invoices
    document.getElementById('btn-parse-batch-save')?.addEventListener('click', async () => {
      const raw = document.getElementById('ocr-raw-input')?.value.trim();
      if (!raw) return;

      const blocks = TarazakParser.parseMultiplePhase1Blocks(raw);
      if (blocks.length === 0) {
        showToast('هیچ بلوک فاکتور معتبری با فرمت ===== یافت نشد.', 'error');
        return;
      }

      for (const inv of blocks) {
        await TarazakStorage.saveItem('invoices', inv);
        await TarazakStorage.updateAutocomplete(inv.partyName, inv.partyCategory, inv.items);
      }

      showToast(`${blocks.length} فاکتور با موفقیت به طور خودکار ثبت شدند.`);
      document.getElementById('ocr-raw-input').value = '';
      await reloadData();
      switchTab('invoices');
    });

    // Invoices Search & Filter Event Listeners
    document.getElementById('search-invoices')?.addEventListener('input', renderInvoicesView);
    document.getElementById('filter-kind')?.addEventListener('change', renderInvoicesView);
    document.getElementById('filter-status')?.addEventListener('change', renderInvoicesView);

    // Export Invoices CSV
    document.getElementById('btn-export-invoices-csv')?.addEventListener('click', () => {
      TarazakStorage.exportInvoicesToCSV();
      showToast('فایل اکسل / CSV فاکتورها دانلود شد.');
    });

    // People Search & Filter
    document.getElementById('search-people')?.addEventListener('input', renderPeopleView);
    document.getElementById('filter-people-category')?.addEventListener('change', renderPeopleView);

    // Add Person Modal
    document.getElementById('btn-add-person')?.addEventListener('click', () => {
      const bodyHtml = `
        <div class="form-grid-3" style="grid-template-columns: 1fr;">
          <div class="form-group">
            <label>نام شخص یا فروشگاه *</label>
            <input type="text" id="m-p-name" placeholder="مثال: کافه بهار" required>
          </div>
          <div class="form-group">
            <label>نقش</label>
            <select id="m-p-role">
              <option value="customer">مشتری</option>
              <option value="supplier">تأمین‌کننده</option>
            </select>
          </div>
          <div class="form-group">
            <label>دسته‌بندی</label>
            <input type="text" id="m-p-cat" list="categories-list" placeholder="مثال: کافه‌ها، بستنی‌فروشی‌ها...">
          </div>
          <div class="form-group">
            <label>شماره تماس</label>
            <input type="tel" id="m-p-phone" placeholder="0912...">
          </div>
          <div class="form-group">
            <label>مانده بدهی اولیه از قبل (تومان - اختیاری)</label>
            <input type="text" id="m-p-opening" class="num" placeholder="0">
            <span style="font-size: 11px; color: var(--text-muted);">اگر قبل از شروع به کار با اپ، این مشتری از دفتر قبلی بدهی دارد اینجا وارد کنید</span>
          </div>
          <div class="form-group">
            <label>یادداشت</label>
            <input type="text" id="m-p-notes" placeholder="آدرس یا توضیحات اختیاری...">
          </div>
        </div>
      `;
      const footerHtml = `
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-container').style.display='none'">انصراف</button>
        <button type="button" id="m-p-save-btn" class="btn btn-primary">افزودن طرف حساب</button>
      `;
      openModal('افزودن طرف حساب جدید', bodyHtml, footerHtml);

      document.getElementById('m-p-opening')?.addEventListener('input', e => {
        const v = Jalali.parseMoney(e.target.value);
        e.target.value = v ? Jalali.formatMoney(v) : '';
      });

      document.getElementById('m-p-save-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('m-p-name')?.value.trim();
        if (!name) return showToast('نام الزامی است.', 'error');
        const opening = Jalali.parseMoney(document.getElementById('m-p-opening')?.value);
        await TarazakStorage.saveItem('people', {
          name,
          role: document.getElementById('m-p-role')?.value,
          category: document.getElementById('m-p-cat')?.value.trim() || 'متفرقه',
          phone: document.getElementById('m-p-phone')?.value.trim(),
          openingBalance: opening,
          notes: document.getElementById('m-p-notes')?.value.trim()
        });
        closeModal();
        showToast('طرف حساب افزوده شد.');
        await reloadData();
        renderPeopleView();
      });
    });

    // Add Catalog Item Modal
    document.getElementById('btn-add-catalog-item')?.addEventListener('click', () => {
      const bodyHtml = `
        <div class="form-grid-3" style="grid-template-columns: 1fr;">
          <div class="form-group">
            <label>نام کالا *</label>
            <input type="text" id="m-c-name" placeholder="مثال: باقلوا استانبولی اعلا" required>
          </div>
          <div class="form-group">
            <label>دسته‌بندی</label>
            <select id="m-c-cat">
              <option value="دسته A">دسته A (عمده / کیلویی)</option>
              <option value="دسته A+">دسته A+ (بسته‌بندی کوچک / تک‌نفره)</option>
              <option value="لوازم و ظروف">لوازم و ظروف</option>
              <option value="متفرقه">متفرقه</option>
            </select>
          </div>
          <div class="form-group">
            <label>واحد اندازه‌گیری</label>
            <input type="text" id="m-c-unit" placeholder="کیلو، ظرف، بسته، جعبه...">
          </div>
          <div class="form-group">
            <label>بهای تمام‌شده پایه (خرید/تولید - تومان)</label>
            <input type="text" id="m-c-cost" class="num" placeholder="0">
          </div>
          <div class="form-group">
            <label>قیمت فروش پیشنهادی (تومان)</label>
            <input type="text" id="m-c-price" class="num" placeholder="0">
          </div>
          <div class="form-group">
            <label>موجودی اولیه</label>
            <input type="number" id="m-c-stock" placeholder="0">
          </div>
        </div>
      `;
      const footerHtml = `
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-container').style.display='none'">انصراف</button>
        <button type="button" id="m-c-save-btn" class="btn btn-primary">افزودن کالا به جدول مرجع</button>
      `;
      openModal('افزودن کالا به جدول مرجع', bodyHtml, footerHtml);

      document.getElementById('m-c-save-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('m-c-name')?.value.trim();
        if (!name) return showToast('نام کالا الزامی است.', 'error');
        await TarazakStorage.saveItem('catalog', {
          name,
          category: document.getElementById('m-c-cat')?.value,
          unit: document.getElementById('m-c-unit')?.value.trim() || 'عدد',
          baseCost: Jalali.parseMoney(document.getElementById('m-c-cost')?.value),
          defaultPrice: Jalali.parseMoney(document.getElementById('m-c-price')?.value),
          stock: parseFloat(document.getElementById('m-c-stock')?.value) || 0
        });
        closeModal();
        showToast('کالا به جدول مرجع اضافه شد.');
        await reloadData();
        renderCatalogView();
      });
    });

    // Reports Period Tabs
    document.querySelectorAll('.form-mode-tab[data-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.form-mode-tab[data-period]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        AppState.activePeriod = btn.dataset.period;
        renderReportsView();
      });
    });

    // Reports Subtabs (Product Profit vs Customer Rank vs Breakdown)
    const btnRepProd = document.getElementById('tab-rep-products');
    const btnRepCust = document.getElementById('tab-rep-customers');
    const btnRepBreak = document.getElementById('tab-rep-breakdown');

    const subviewProd = document.getElementById('subview-rep-products');
    const subviewCust = document.getElementById('subview-rep-customers');
    const subviewBreak = document.getElementById('subview-rep-breakdown');

    btnRepProd?.addEventListener('click', () => {
      btnRepProd.className = 'btn btn-sm btn-primary';
      btnRepCust.className = 'btn btn-sm btn-secondary';
      btnRepBreak.className = 'btn btn-sm btn-secondary';
      subviewProd.style.display = 'block';
      subviewCust.style.display = 'none';
      subviewBreak.style.display = 'none';
    });

    btnRepCust?.addEventListener('click', () => {
      btnRepCust.className = 'btn btn-sm btn-primary';
      btnRepProd.className = 'btn btn-sm btn-secondary';
      btnRepBreak.className = 'btn btn-sm btn-secondary';
      subviewProd.style.display = 'none';
      subviewCust.style.display = 'block';
      subviewBreak.style.display = 'none';
    });

    btnRepBreak?.addEventListener('click', () => {
      btnRepBreak.className = 'btn btn-sm btn-primary';
      btnRepProd.className = 'btn btn-sm btn-secondary';
      btnRepCust.className = 'btn btn-sm btn-secondary';
      subviewProd.style.display = 'none';
      subviewCust.style.display = 'none';
      subviewBreak.style.display = 'block';
    });

    // Backup & Restore
    document.getElementById('btn-download-backup')?.addEventListener('click', async () => {
      const backup = await TarazakStorage.createFullBackup();
      TarazakStorage.downloadBackupJSON(backup);
      showToast('فایل پشتیبان کامل با موفقیت دانلود شد.');
    });

    document.getElementById('input-restore-file')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async event => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (confirm(`آیا از بازیابی فایل پشتیبان مورخ ${parsed.shamsiDate || ''} اطمینان دارید؟ (اطلاعات فعلی جایگزین خواهند شد)`)) {
            await TarazakStorage.restoreFullBackup(parsed);
            showToast('اطلاعات با موفقیت بازیابی شدند.');
            await reloadData();
            switchTab('invoices');
          }
        } catch (err) {
          showToast('فایل پشتیبان نامعتبر است: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    });

    // Modal Close Button
    document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
    document.getElementById('modal-container')?.addEventListener('click', e => {
      if (e.target.id === 'modal-container') closeModal();
    });

    // =========================================================================
    // SECURITY & PASSWORD LOCK (For GitHub Pages & Personal Privacy)
    // =========================================================================

    // SHA-256 hash of the initial default password (plain text never stored in repo)
    const DEFAULT_PASSWORD_HASH = '2647b246668ed557a0e2566380834e436503cdc396a83a4fd808eafc5ee4f4e8';

    async function hashPassword(str) {
      const buffer = new TextEncoder().encode(str);
      const hash = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function getActivePasswordHash() {
      const customPinObj = await TarazamStorage.getById('settings', 'security_pin');
      return (customPinObj && customPinObj.value) ? customPinObj.value : DEFAULT_PASSWORD_HASH;
    }

    async function checkSecurityLock() {
      const lockScreen = document.getElementById('app-lock-screen');
      const loginSection = document.getElementById('lock-login-section');
      const changeSection = document.getElementById('lock-change-section');
      const passInput = document.getElementById('lock-password-input');
      const errorMsg = document.getElementById('lock-error-msg');

      if (passInput) passInput.value = '';
      if (errorMsg) errorMsg.style.display = 'none';

      // Check if session is already authenticated in this browser tab
      const sessionAuth = sessionStorage.getItem('tarazam_auth');
      if (sessionAuth === 'true') {
        lockScreen.style.display = 'none';
        return;
      }

      // Show lock screen
      lockScreen.style.display = 'flex';
      loginSection.style.display = 'block';
      changeSection.style.display = 'none';
    }

    // Lock Form Submit Handler (Unlock app)
    document.getElementById('lock-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const pass = document.getElementById('lock-password-input')?.value;
      const errorMsg = document.getElementById('lock-error-msg');
      const lockScreen = document.getElementById('app-lock-screen');

      const activeHash = await getActivePasswordHash();
      const enteredHash = await hashPassword(pass);

      if (enteredHash === activeHash) {
        sessionStorage.setItem('tarazam_auth', 'true');
        lockScreen.style.display = 'none';
        showToast('خوش آمدید!');
      } else {
        errorMsg.textContent = 'رمز عبور اشتباه است.';
        errorMsg.style.display = 'block';
        document.getElementById('lock-password-input').focus();
      }
    });

    // Toggle Change Password view on Lock Screen
    document.getElementById('btn-show-change-pass')?.addEventListener('click', () => {
      document.getElementById('lock-login-section').style.display = 'none';
      const changeSection = document.getElementById('lock-change-section');
      changeSection.style.display = 'block';
      document.getElementById('lock-change-form').reset();
      document.getElementById('lock-change-error').style.display = 'none';
      document.getElementById('lock-change-success').style.display = 'none';
    });

    document.getElementById('btn-back-to-login')?.addEventListener('click', () => {
      document.getElementById('lock-change-section').style.display = 'none';
      document.getElementById('lock-login-section').style.display = 'block';
    });

    // Change Password on Lock Screen Submit Handler
    document.getElementById('lock-change-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const currPass = document.getElementById('change-curr-pass')?.value;
      const newPass = document.getElementById('change-new-pass')?.value;
      const confirmPass = document.getElementById('change-confirm-pass')?.value;

      const errEl = document.getElementById('lock-change-error');
      const succEl = document.getElementById('lock-change-success');
      errEl.style.display = 'none';
      succEl.style.display = 'none';

      const activeHash = await getActivePasswordHash();
      const currHashed = await hashPassword(currPass);

      if (currHashed !== activeHash) {
        errEl.textContent = 'رمز عبور فعلی اشتباه است.';
        errEl.style.display = 'block';
        return;
      }

      if (!newPass || newPass.length < 4) {
        errEl.textContent = 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.';
        errEl.style.display = 'block';
        return;
      }

      if (newPass !== confirmPass) {
        errEl.textContent = 'تکرار رمز عبور جدید همخوانی ندارد.';
        errEl.style.display = 'block';
        return;
      }

      // Save new hash locally in this browser (never committed to Git)
      const newHash = await hashPassword(newPass);
      await TarazamStorage.saveItem('settings', { key: 'security_pin', value: newHash });

      succEl.textContent = 'رمز عبور جدید با موفقیت در این دستگاه ذخیره شد!';
      succEl.style.display = 'block';

      setTimeout(() => {
        document.getElementById('lock-change-section').style.display = 'none';
        document.getElementById('lock-login-section').style.display = 'block';
        document.getElementById('lock-password-input').value = newPass;
        document.getElementById('btn-lock-submit').click();
      }, 1200);
    });

    // Lock Button in Header
    document.getElementById('btn-lock-app')?.addEventListener('click', () => {
      sessionStorage.removeItem('tarazam_auth');
      checkSecurityLock();
      showToast('برنامه قفل شد.', 'info');
    });

    // Toggle password view
    document.getElementById('btn-toggle-lock-pass')?.addEventListener('click', () => {
      const input = document.getElementById('lock-password-input');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    // Change Password in Settings Tab
    document.getElementById('btn-save-password')?.addEventListener('click', async () => {
      const newPass = document.getElementById('setting-new-pass')?.value;
      const confirmPass = document.getElementById('setting-confirm-pass')?.value;

      if (!newPass || newPass.length < 4) {
        return showToast('رمز عبور جدید باید حداقل ۴ کاراکتر باشد.', 'error');
      }
      if (newPass !== confirmPass) {
        return showToast('تکرار رمز عبور مطابقت ندارد.', 'error');
      }

      const hashed = await hashPassword(newPass);
      await TarazamStorage.saveItem('settings', { key: 'security_pin', value: hashed });
      document.getElementById('setting-new-pass').value = '';
      document.getElementById('setting-confirm-pass').value = '';
      showToast('رمز عبور جدید با موفقیت در این دستگاه ذخیره شد.');
    });

    // Check Security Lock on Start
    await checkSecurityLock();

    // Initial View setup
    switchTab('invoices');
  });
})();
