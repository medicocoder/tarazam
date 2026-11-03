/**
 * Reporting and Analytics Engine for Tarazak Accounting App
 * Computes:
 * 1. Product Profit (سود کالاها) & Margin %
 * 2. Customer Rank & Profit (رتبه‌بندی و سود مشتریان به تفکیک کافه، بستنی و...)
 * 3. Time Period Balance (ترازهای زمانی: روز، هفته، دهه، ماه، فصل، سال)
 */
(function (global) {
  'use strict';

  function calculateReports(invoices, catalog, people, filterDateRange = null) {
    invoices = invoices || [];
    catalog = catalog || [];
    people = people || [];

    // Catalog lookup map for base cost
    const catalogMap = new Map();
    catalog.forEach(item => {
      catalogMap.set(item.name, item.baseCost || 0);
    });

    // People lookup map for categories
    const peopleMap = new Map();
    people.forEach(p => {
      peopleMap.set(p.name, p);
    });

    // Filter invoices by date if provided
    let filteredInvoices = invoices;
    if (filterDateRange && filterDateRange.from && filterDateRange.to) {
      filteredInvoices = invoices.filter(inv => {
        return inv.date >= filterDateRange.from && inv.date <= filterDateRange.to;
      });
    }

    // 1. PRODUCT PROFIT CALCULATION
    const productStats = new Map();

    filteredInvoices.forEach(inv => {
      if (inv.kind === 'sale' && Array.isArray(inv.items)) {
        inv.items.forEach(item => {
          const name = item.name || 'کالای نامشخص';
          if (!productStats.has(name)) {
            // Find baseCost in item itself or fallback to catalog
            const baseCostUnit = (item.baseCost !== undefined && item.baseCost !== null)
              ? item.baseCost
              : (catalogMap.get(name) || 0);

            productStats.set(name, {
              name,
              category: item.category || 'متفرقه',
              qty: 0,
              revenue: 0,
              baseCostUnit,
              totalCost: 0,
              profit: 0,
              margin: 0
            });
          }

          const stat = productStats.get(name);
          const qty = Number(item.qty) || 1;
          const lineTotal = (item.total !== undefined && item.total !== null)
            ? Number(item.total)
            : (qty * (Number(item.price) || 0));

          const cost = qty * (stat.baseCostUnit || 0);

          stat.qty += qty;
          stat.revenue += lineTotal;
          stat.totalCost += cost;
          stat.profit = stat.revenue - stat.totalCost;
          stat.margin = stat.revenue > 0 ? Math.round((stat.profit / stat.revenue) * 1000) / 10 : 0;
        });
      }
    });

    const productsList = Array.from(productStats.values()).sort((a, b) => b.profit - a.profit);

    // ABC Classification
    const totalProductRevenue = productsList.reduce((acc, p) => acc + Math.max(0, p.revenue), 0);
    let cumulative = 0;
    productsList.forEach(p => {
      cumulative += Math.max(0, p.revenue);
      if (totalProductRevenue > 0) {
        const ratio = (cumulative / totalProductRevenue) * 100;
        if (ratio <= 80) p.abc = 'A';
        else if (ratio <= 95) p.abc = 'B';
        else p.abc = 'C';
      } else {
        p.abc = 'C';
      }
    });

    // 2. CUSTOMER RANK & PROFIT CALCULATION
    const customerStats = new Map();

    filteredInvoices.forEach(inv => {
      if (inv.kind === 'sale' && inv.partyName) {
        const pName = inv.partyName;
        const personMeta = peopleMap.get(pName) || {};

        if (!customerStats.has(pName)) {
          customerStats.set(pName, {
            name: pName,
            category: inv.partyCategory || personMeta.category || 'متفرقه',
            phone: personMeta.phone || '',
            count: 0,
            totalSales: 0,
            totalCost: 0,
            profit: 0,
            margin: 0,
            currentDebt: 0,
            lastDate: inv.date || '',
            averageInvoice: 0
          });
        }

        const cStat = customerStats.get(pName);
        cStat.count += 1;

        // CRITICAL RULE: "سفارش فعلی" + "ارسال" is the sale of this invoice.
        // DO NOT count "حساب قبلی" as sales!
        const invoiceSaleAmount = (inv.currentOrder || 0) + (inv.shippingCost || 0);
        cStat.totalSales += invoiceSaleAmount;

        // Calculate cost of items in this invoice
        let invCost = 0;
        if (Array.isArray(inv.items)) {
          inv.items.forEach(it => {
            const unitCost = it.baseCost || catalogMap.get(it.name) || 0;
            invCost += (it.qty || 1) * unitCost;
          });
        }
        cStat.totalCost += invCost;
        cStat.profit = cStat.totalSales - cStat.totalCost;
        cStat.margin = cStat.totalSales > 0 ? Math.round((cStat.profit / cStat.totalSales) * 1000) / 10 : 0;

        // Debt tracking
        if (inv.remainingBalance) {
          cStat.currentDebt += inv.remainingBalance;
        }

        if (!cStat.lastDate || inv.date > cStat.lastDate) {
          cStat.lastDate = inv.date;
        }

        cStat.averageInvoice = Math.round(cStat.totalSales / cStat.count);
      }
    });

    const customersList = Array.from(customerStats.values()).sort((a, b) => b.totalSales - a.totalSales);

    // 3. FINANCIAL SUMMARY (تراز مالی دخل و خرج)
    let totalSalesRevenue = 0;
    let totalSalesCategoryA = 0;
    let totalSalesCategoryAPlus = 0;
    let totalExpenses = 0;
    let totalPurchases = 0;
    let totalShippingCollected = 0;
    let totalShippingPaid = 0;
    let totalOutstandingDebt = 0;

    filteredInvoices.forEach(inv => {
      if (inv.kind === 'sale') {
        const orderVal = inv.currentOrder || 0;
        const shipVal = inv.shippingCost || 0;
        totalSalesRevenue += (orderVal + shipVal);
        totalShippingCollected += shipVal;

        if (Array.isArray(inv.items)) {
          inv.items.forEach(it => {
            const lineVal = it.total || ((it.qty || 1) * (it.price || 0));
            if (it.category === 'دسته A' || /عمده|کیلویی|جعبه بزرگ/.test(it.name)) {
              totalSalesCategoryA += lineVal;
            } else if (it.category === 'دسته A+' || /بسته|ظرف|تک‌نفره/.test(it.name)) {
              totalSalesCategoryAPlus += lineVal;
            }
          });
        }

        if (inv.remainingBalance) {
          totalOutstandingDebt += inv.remainingBalance;
        }
      } else if (inv.kind === 'settlement') {
        // Settlement reduces outstanding debt and adds to collected settlements
        totalOutstandingDebt = Math.max(0, totalOutstandingDebt - (inv.paidAmount || 0));
      } else if (inv.kind === 'purchase') {
        totalPurchases += (inv.grandTotal || inv.currentOrder || 0);
      } else if (inv.kind === 'expense') {
        const expTotal = inv.grandTotal || inv.currentOrder || 0;
        totalExpenses += expTotal;
        if (/پیک|اسنپ|کرایه|حمل|باربری/.test(inv.partyName + ' ' + (inv.notes || ''))) {
          totalShippingPaid += expTotal;
        }
      }
    });

    // Adjust customer outstanding debts by settlements in period
    filteredInvoices.forEach(inv => {
      if (inv.kind === 'settlement' && inv.partyName && customerStats.has(inv.partyName)) {
        const cStat = customerStats.get(inv.partyName);
        cStat.currentDebt = Math.max(0, cStat.currentDebt - (inv.paidAmount || 0));
      }
    });

    const totalOutflow = totalPurchases + totalExpenses;
    const netBalance = totalSalesRevenue - totalOutflow;

    return {
      products: productsList,
      customers: customersList,
      summary: {
        totalSalesRevenue,
        totalSalesCategoryA,
        totalSalesCategoryAPlus,
        totalPurchases,
        totalExpenses,
        totalOutflow,
        netBalance,
        totalShippingCollected,
        totalShippingPaid,
        totalOutstandingDebt,
        invoicesCount: filteredInvoices.length
      }
    };
  }

  // Group invoices by Period (Day, Week, Decade, Month, Season, Year)
  function groupInvoicesByPeriods(invoices, catalog, people) {
    const today = global.Jalali ? global.Jalali.todayJalali() : '1405/01/01';
    const meta = global.Jalali ? global.Jalali.dateMeta(today) : { year: 1405, month: 1, day: 1 };

    // Today
    const todayInvs = invoices.filter(i => i.date === today);

    // Current Month (e.g. 1405/07)
    const currentMonthPrefix = `${meta.year}/${String(meta.month).padStart(2, '0')}`;
    const monthInvs = invoices.filter(i => (i.date || '').startsWith(currentMonthPrefix));

    // Current Decade (1, 2, or 3 of current month)
    const decadeInvs = monthInvs.filter(i => {
      const p = global.Jalali.parseJalali(i.date);
      return p && global.Jalali.getDecade(p.day) === meta.decade;
    });

    // Current Season
    const seasonInvs = invoices.filter(i => {
      const p = global.Jalali.parseJalali(i.date);
      return p && p.year === meta.year && global.Jalali.getSeason(p.month) === meta.season;
    });

    // Current Year
    const currentYearPrefix = `${meta.year}/`;
    const yearInvs = invoices.filter(i => (i.date || '').startsWith(currentYearPrefix));

    return {
      today: calculateReports(todayInvs, catalog, people),
      decade: calculateReports(decadeInvs, catalog, people),
      month: calculateReports(monthInvs, catalog, people),
      season: calculateReports(seasonInvs, catalog, people),
      year: calculateReports(yearInvs, catalog, people),
      allTime: calculateReports(invoices, catalog, people),
      meta
    };
  }

  const TarazamReports = {
    calculateReports,
    groupInvoicesByPeriods
  };

  global.TarazamReports = TarazamReports;
  global.TarazakReports = TarazamReports;
})(typeof window !== 'undefined' ? window : global);
