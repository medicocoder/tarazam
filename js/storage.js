/**
 * Storage Layer for Tarazam Accounting App
 * Uses IndexedDB with LocalStorage fallback.
 * Includes Autocomplete memory, Backup/Restore (JSON), and CSV/Excel Export with UTF-8 BOM.
 */
(function (global) {
  'use strict';

  const DB_NAME = 'TarazamLocalDB';
  const DB_VERSION = 1;

  let dbInstance = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);

      if (!('indexedDB' in window)) {
        console.warn('IndexedDB not supported, falling back to LocalStorage.');
        return resolve(null);
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        const db = event.target.result;

        // Invoices store
        if (!db.objectStoreNames.contains('invoices')) {
          const invStore = db.createObjectStore('invoices', { keyPath: 'id' });
          invStore.createIndex('kind', 'kind', { unique: false });
          invStore.createIndex('date', 'date', { unique: false });
          invStore.createIndex('partyName', 'partyName', { unique: false });
          invStore.createIndex('partyCategory', 'partyCategory', { unique: false });
          invStore.createIndex('status', 'status', { unique: false });
        }

        // People (customers & suppliers) store
        if (!db.objectStoreNames.contains('people')) {
          const pplStore = db.createObjectStore('people', { keyPath: 'id' });
          pplStore.createIndex('name', 'name', { unique: true });
          pplStore.createIndex('category', 'category', { unique: false });
          pplStore.createIndex('role', 'role', { unique: false });
        }

        // Catalog (Reference items & base costs) store
        if (!db.objectStoreNames.contains('catalog')) {
          const catStore = db.createObjectStore('catalog', { keyPath: 'id' });
          catStore.createIndex('name', 'name', { unique: true });
          catStore.createIndex('category', 'category', { unique: false });
        }

        // Settings and Autocomplete metadata store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = function (event) {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = function (event) {
        console.error('IndexedDB error:', event.target.error);
        resolve(null);
      };
    });
  }

  // Generic DB helpers
  async function getAll(storeName) {
    const db = await openDB();
    if (!db) {
      const data = localStorage.getItem('tzk_' + storeName);
      return data ? JSON.parse(data) : [];
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function getById(storeName, id) {
    const db = await openDB();
    if (!db) {
      const list = await getAll(storeName);
      return list.find(item => item.id === id) || null;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveItem(storeName, item) {
    if (!item.id) {
      item.id = storeName.slice(0, 3) + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }
    item.updatedAt = new Date().toISOString();
    if (!item.createdAt) item.createdAt = item.updatedAt;

    const db = await openDB();
    if (!db) {
      const list = await getAll(storeName);
      const idx = list.findIndex(x => x.id === item.id);
      if (idx >= 0) list[idx] = item;
      else list.push(item);
      localStorage.setItem('tzk_' + storeName, JSON.stringify(list));
      return item;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteItem(storeName, id) {
    const db = await openDB();
    if (!db) {
      let list = await getAll(storeName);
      list = list.filter(item => item.id !== id);
      localStorage.setItem('tzk_' + storeName, JSON.stringify(list));
      return true;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function clearStore(storeName) {
    const db = await openDB();
    if (!db) {
      localStorage.removeItem('tzk_' + storeName);
      return true;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // Autocomplete / Suggestions Memory
  async function getAutocomplete() {
    const db = await openDB();
    let data = null;
    if (!db) {
      const raw = localStorage.getItem('tzk_autocomplete');
      data = raw ? JSON.parse(raw) : null;
    } else {
      const res = await getById('settings', 'autocomplete');
      data = res ? res.value : null;
    }

    return data || {
      parties: ['کافه لاله', 'بستنی نوبهار', 'کافه بهار', 'فروشگاه شقایق', 'بستنی نعمت'],
      categories: ['بستنی‌فروشی‌ها', 'کافه‌ها', 'رستوران‌ها', 'سوپرمارکت‌ها', 'متفرقه'],
      products: ['باقلوا استانبولی جعبه بزرگ (A)', 'باقلوا ترک کیلویی (A)', 'باقلوا تک‌نفره ظرفی (A+)', 'باقلوا مخلوط بسته کوچک (A+)', 'ظروف و جعبه بسته‌بندی'],
      recentPrices: {}
    };
  }

  async function updateAutocomplete(newParty, newCategory, newItems) {
    const auto = await getAutocomplete();
    let changed = false;

    if (newParty && !auto.parties.includes(newParty)) {
      auto.parties.push(newParty);
      changed = true;
    }

    if (newCategory && !auto.categories.includes(newCategory)) {
      auto.categories.push(newCategory);
      changed = true;
    }

    if (Array.isArray(newItems)) {
      newItems.forEach(item => {
        if (item.name && !auto.products.includes(item.name)) {
          auto.products.push(item.name);
          changed = true;
        }
        if (item.name && item.price) {
          if (!auto.recentPrices[item.name]) auto.recentPrices[item.name] = [];
          if (!auto.recentPrices[item.name].includes(item.price)) {
            auto.recentPrices[item.name].unshift(item.price);
            if (auto.recentPrices[item.name].length > 5) auto.recentPrices[item.name].pop();
            changed = true;
          }
        }
      });
    }

    if (changed) {
      const db = await openDB();
      if (!db) {
        localStorage.setItem('tzk_autocomplete', JSON.stringify(auto));
      } else {
        await saveItem('settings', { key: 'autocomplete', value: auto });
      }
    }

    return auto;
  }

  // Backup & Restore
  async function createFullBackup() {
    const invoices = await getAll('invoices');
    const people = await getAll('people');
    const catalog = await getAll('catalog');
    const autocomplete = await getAutocomplete();

    return {
      version: 1,
      appName: 'Tarazam Accounting PWA',
      exportedAt: new Date().toISOString(),
      shamsiDate: global.Jalali ? global.Jalali.todayJalali() : '',
      data: {
        invoices,
        people,
        catalog,
        autocomplete
      }
    };
  }

  function downloadBackupJSON(backupData) {
    const str = JSON.stringify(backupData, null, 2);
    const blob = new Blob([str], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = global.Jalali ? global.Jalali.todayJalali().replace(/\//g, '-') : 'today';
    a.href = url;
    a.download = `tarazam-backup-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function restoreFullBackup(backupObj) {
    if (!backupObj || !backupObj.data) {
      throw new Error('فرمت فایل پشتیبان نامعتبر است.');
    }

    const { invoices, people, catalog, autocomplete } = backupObj.data;

    await clearStore('invoices');
    await clearStore('people');
    await clearStore('catalog');

    if (Array.isArray(invoices)) {
      for (const inv of invoices) {
        await saveItem('invoices', inv);
      }
    }

    if (Array.isArray(people)) {
      for (const p of people) {
        await saveItem('people', p);
      }
    }

    if (Array.isArray(catalog)) {
      for (const c of catalog) {
        await saveItem('catalog', c);
      }
    }

    if (autocomplete) {
      const db = await openDB();
      if (!db) {
        localStorage.setItem('tzk_autocomplete', JSON.stringify(autocomplete));
      } else {
        await saveItem('settings', { key: 'autocomplete', value: autocomplete });
      }
    }

    return true;
  }

  // CSV Export with UTF-8 BOM
  function downloadCSV(csvContent, filename) {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportInvoicesToCSV() {
    const invoices = await getAll('invoices');
    const headers = [
      'شناسه فاکتور', 'نوع سند', 'تاریخ شمسی', 'طرف حساب', 'دسته‌بندی طرف حساب',
      'سفارش فعلی (تومان)', 'هزینه ارسال (تومان)', 'حساب قبلی (تومان)', 'جمع کل فاکتور (تومان)',
      'مبلغ پرداختی (تومان)', 'باقی‌مانده بدهی (تومان)', 'وضعیت تسویه', 'روش پرداخت', 'تعداد اقلام', 'اقلام فاکتور', 'یادداشت'
    ];

    const rows = invoices.map(inv => {
      const itemsSummary = inv.kind === 'settlement'
        ? (inv.referenceNo ? `شماره پیگیری: ${inv.referenceNo}` : 'تسویه / دریافت وجه نسیه')
        : (inv.items || [])
            .map(i => `${i.name || ''} (${i.qty || 1} عدد به فی ${i.price || 0})`)
            .join(' + ');

      return [
        inv.id || '',
        inv.kind === 'sale' ? 'فروش' : inv.kind === 'purchase' ? 'خرید' : inv.kind === 'settlement' ? 'دریافت وجه / تسویه' : 'هزینه',
        inv.date || '',
        `"${(inv.partyName || '').replace(/"/g, '""')}"`,
        `"${(inv.partyCategory || '').replace(/"/g, '""')}"`,
        inv.currentOrder || 0,
        inv.shippingCost || 0,
        inv.prevBalance || 0,
        inv.grandTotal || 0,
        inv.paidAmount || 0,
        inv.remainingBalance || 0,
        inv.status === 'settled' ? 'تسویه‌شده' : 'نسیه',
        inv.paymentMethod || '-',
        (inv.items || []).length,
        `"${itemsSummary.replace(/"/g, '""')}"`,
        `"${(inv.notes || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\r\n');
    const today = global.Jalali ? global.Jalali.todayJalali().replace(/\//g, '-') : 'today';
    downloadCSV(csv, `tarazam-invoices-${today}.csv`);
  }

  // Seed default data if empty
  async function seedInitialDataIfEmpty() {
    const invoices = await getAll('invoices');
    const people = await getAll('people');
    const catalog = await getAll('catalog');

    if (catalog.length === 0) {
      const defaultCatalog = [
        { id: 'cat_1', name: 'باقلوا استانبولی عمده (دسته A)', category: 'دسته A', unit: 'کیلو', baseCost: 180000, defaultPrice: 240000, stock: 50, notes: 'جعبه بزرگ از تأمین‌کننده اصلی' },
        { id: 'cat_2', name: 'باقلوا ترک مخصوص (دسته A)', category: 'دسته A', unit: 'کیلو', baseCost: 200000, defaultPrice: 270000, stock: 30, notes: 'خام بدون دستکاری' },
        { id: 'cat_3', name: 'باقلوا تک‌نفره ظرفی (دسته A+)', category: 'دسته A+', unit: 'ظرف', baseCost: 45000, defaultPrice: 70000, stock: 120, notes: 'بسته‌بندی کوچک آماده کافه و بستنی' },
        { id: 'cat_4', name: 'باقلوا بسته کادویی لوکس (دسته A+)', category: 'دسته A+', unit: 'بسته', baseCost: 95000, defaultPrice: 150000, stock: 40, notes: 'بسته‌بندی شده با ملزومات' },
        { id: 'cat_5', name: 'ظرف شفاف بسته‌بندی تک‌نفره', category: 'لوازم و ظروف', unit: 'عدد', baseCost: 4500, defaultPrice: 0, stock: 500, notes: 'ملزومات مصرفی بسته‌بندی' }
      ];
      for (const item of defaultCatalog) await saveItem('catalog', item);
    }

    if (people.length === 0) {
      const defaultPeople = [
        { id: 'p_1', name: 'کافه لاله', role: 'customer', category: 'کافه‌ها', phone: '09121111111', notes: 'سفارش هفتگی بسته کوچک' },
        { id: 'p_2', name: 'بستنی نوبهار', role: 'customer', category: 'بستنی‌فروشی‌ها', phone: '09122222222', notes: 'سفارش ظرفی و کیلویی' },
        { id: 'p_3', name: 'کافه بهار', role: 'customer', category: 'کافه‌ها', phone: '09123333333', notes: 'خرید منظم' },
        { id: 'p_4', name: 'تأمین‌کننده باقلوا تبریز', role: 'supplier', category: 'تأمین‌کنندگان', phone: '09124444444', notes: 'تأمین‌کننده اصلی دسته A' }
      ];
      for (const p of defaultPeople) await saveItem('people', p);
    }
  }

  const TarazamStorage = {
    getAll,
    getById,
    saveItem,
    deleteItem,
    clearStore,
    getAutocomplete,
    updateAutocomplete,
    createFullBackup,
    downloadBackupJSON,
    restoreFullBackup,
    exportInvoicesToCSV,
    seedInitialDataIfEmpty
  };

  global.TarazamStorage = TarazamStorage;
  global.TarazakStorage = TarazamStorage;
})(typeof window !== 'undefined' ? window : global);
