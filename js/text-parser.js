/**
 * Text & OCR Parser for Tarazak Accounting App
 * Supports:
 * 1. Structured Phase 1 OCR output blocks (single or multiple separated by =====)
 * 2. Mobile Notes & free text parsing
 */
(function (global) {
  'use strict';

  function parsePhase1Block(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const invoice = {
      kind: 'sale',
      mode: 'custom',
      inputMethod: 'ocr',
      date: global.Jalali ? global.Jalali.todayJalali() : '',
      partyName: '',
      partyCategory: 'متفرقه',
      items: [],
      currentOrder: 0,
      shippingCost: 0,
      prevBalance: 0,
      grandTotal: 0,
      paidAmount: 0,
      paymentMethod: '-',
      remainingBalance: 0,
      status: 'credit',
      notes: '',
      hasConfidenceCheck: false
    };

    if (rawText.includes('✅')) {
      invoice.hasConfidenceCheck = true;
    }

    let inItemsSection = false;

    for (const line of lines) {
      if (line.startsWith('=====') || line === '✅') continue;

      // Detect end of items section
      if (inItemsSection && (line.includes(':') || line.includes('：'))) {
        inItemsSection = false;
      }

      if (line.startsWith('نوع سند:') || line.startsWith('نوع سند：')) {
        const val = line.split(/[:：]/)[1].trim();
        if (val.includes('خرید')) invoice.kind = 'purchase';
        else if (val.includes('هزینه')) invoice.kind = 'expense';
        else invoice.kind = 'sale';
        continue;
      }

      if (line.startsWith('تاریخ:') || line.startsWith('تاریخ：')) {
        const d = line.split(/[:：]/)[1].trim();
        const parsedD = global.Jalali ? global.Jalali.parseJalali(d) : null;
        if (parsedD) invoice.date = parsedD.formatted;
        else invoice.date = d;
        continue;
      }

      if (line.startsWith('طرف حساب:') || line.startsWith('طرف حساب：')) {
        invoice.partyName = line.split(/[:：]/)[1].trim().replace(/^[~#\s]+|[~#\s]+$/g, '');
        continue;
      }

      if (line.startsWith('اقلام:') || line.startsWith('اقلام：')) {
        inItemsSection = true;
        continue;
      }

      if (inItemsSection && (line.startsWith('-') || line.startsWith('*') || line.includes('|'))) {
        // Line format: - نوع | شرح | تعداد | قیمت واحد | مبلغ
        const cleanLine = line.replace(/^[-*•]\s*/, '');
        const parts = cleanLine.split('|').map(p => p.trim());
        if (parts.length >= 3) {
          const cat = parts[0] || 'بدون تفکیک';
          const name = parts[1] || 'قلم کالا';
          const qty = global.Jalali ? global.Jalali.parseMoney(parts[2]) : (parseFloat(parts[2]) || 1);
          const price = parts.length >= 4 ? (global.Jalali ? global.Jalali.parseMoney(parts[3]) : parseFloat(parts[3])) : 0;
          const total = parts.length >= 5 ? (global.Jalali ? global.Jalali.parseMoney(parts[4]) : parseFloat(parts[4])) : (qty * price);
          invoice.items.push({
            category: cat,
            name: name.replace(/^[~#\s]+|[~#\s]+$/g, ''),
            qty: qty || 1,
            price: price || 0,
            total: total || (qty * price)
          });
        }
        continue;
      }

      if (line.startsWith('سفارش فعلی:') || line.startsWith('سفارش فعلی：')) {
        invoice.currentOrder = global.Jalali ? global.Jalali.parseMoney(line.split(/[:：]/)[1]) : parseFloat(line.split(/[:：]/)[1]) || 0;
        continue;
      }

      if (line.startsWith('هزینه ارسال:') || line.startsWith('هزینه ارسال：')) {
        invoice.shippingCost = global.Jalali ? global.Jalali.parseMoney(line.split(/[:：]/)[1]) : parseFloat(line.split(/[:：]/)[1]) || 0;
        continue;
      }

      if (line.startsWith('حساب قبلی:') || line.startsWith('حساب قبلی：')) {
        invoice.prevBalance = global.Jalali ? global.Jalali.parseMoney(line.split(/[:：]/)[1]) : parseFloat(line.split(/[:：]/)[1]) || 0;
        continue;
      }

      if (line.startsWith('جمع کل:') || line.startsWith('جمع کل：')) {
        invoice.grandTotal = global.Jalali ? global.Jalali.parseMoney(line.split(/[:：]/)[1]) : parseFloat(line.split(/[:：]/)[1]) || 0;
        continue;
      }

      if (line.startsWith('پرداخت‌شده:') || line.startsWith('پرداخت‌شده：')) {
        invoice.paidAmount = global.Jalali ? global.Jalali.parseMoney(line.split(/[:：]/)[1]) : parseFloat(line.split(/[:：]/)[1]) || 0;
        continue;
      }

      if (line.startsWith('باقی‌مانده:') || line.startsWith('باقی‌مانده：')) {
        invoice.remainingBalance = global.Jalali ? global.Jalali.parseMoney(line.split(/[:：]/)[1]) : parseFloat(line.split(/[:：]/)[1]) || 0;
        continue;
      }

      if (line.startsWith('نحوه پرداخت:') || line.startsWith('نحوه پرداخت：')) {
        const m = line.split(/[:：]/)[1].trim();
        invoice.paymentMethod = m !== '-' ? m : 'نسیه';
        continue;
      }

      if (line.startsWith('یادداشت:') || line.startsWith('یادداشت：')) {
        const n = line.split(/[:：]/)[1].trim();
        if (n !== '-') invoice.notes = n;
        continue;
      }
    }

    // Calculations & Fallbacks
    if (invoice.items.length > 0 && !invoice.currentOrder) {
      invoice.currentOrder = invoice.items.reduce((sum, item) => sum + (item.total || 0), 0);
    }

    if (!invoice.grandTotal) {
      invoice.grandTotal = (invoice.currentOrder || 0) + (invoice.shippingCost || 0) + (invoice.prevBalance || 0);
    }

    if (!invoice.remainingBalance) {
      invoice.remainingBalance = (invoice.grandTotal || 0) - (invoice.paidAmount || 0);
    }

    invoice.status = (invoice.remainingBalance <= 0 && invoice.paidAmount > 0) ? 'settled' : 'credit';

    return invoice;
  }

  function parseMultiplePhase1Blocks(text) {
    if (!text) return [];
    // Split by ===== or by block headers
    const blocks = text.split(/={4,}/).map(b => b.trim()).filter(b => b.length > 10);
    if (blocks.length === 0 && text.includes('طرف حساب:')) {
      blocks.push(text.trim());
    }
    return blocks.map(parsePhase1Block).filter(Boolean);
  }

  // Free text & mobile notes parser
  function parseFreeTextNotes(text) {
    if (!text || typeof text !== 'string') return null;

    const invoice = {
      kind: 'sale',
      mode: 'custom',
      inputMethod: 'text',
      date: global.Jalali ? global.Jalali.todayJalali() : '',
      partyName: '',
      partyCategory: 'متفرقه',
      items: [],
      currentOrder: 0,
      shippingCost: 0,
      prevBalance: 0,
      grandTotal: 0,
      paidAmount: 0,
      paymentMethod: '-',
      remainingBalance: 0,
      status: 'credit',
      notes: text.trim()
    };

    // Check kind (Prioritize sale over incidental shipping expense mention)
    if (/فروش|فروختم|فاکتور فروش|سفارش مشتری/.test(text)) {
      invoice.kind = 'sale';
    } else if (/خرید|تأمین|خریدیم|فاکتور خرید/.test(text)) {
      invoice.kind = 'purchase';
    } else if (/هزینه|کرایه|بنزین|پیک|اسنپ|تعمیر|خرج|ناهار/.test(text)) {
      invoice.kind = 'expense';
    }

    // Extract Date (e.g. 1403/08/10 or 1405-07-01)
    const dateMatch = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (dateMatch) {
      const parsedD = global.Jalali ? global.Jalali.parseJalali(`${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`) : null;
      if (parsedD) invoice.date = parsedD.formatted;
    }

    // Extract Party Name (e.g. به کافه لاله، از بستنی نوبهار، طرف حساب: فلانی)
    const partyMatch = text.match(/(?:به|از|مشتری|طرف حساب|همکار)\s+([^\n,،\-؛]+)/);
    if (partyMatch) {
      invoice.partyName = partyMatch[1].trim().replace(/(?:فروخته شد|تحویل شد|داده شد|واریز کرد|تاریخ|مبلغ).*/, '').trim();
    }

    // Extract Shipping Cost
    const shipMatch = text.match(/(?:کرایه|ارسال|پیک|اسنپ بار)\s*[:：]?\s*(\d[\d,]*)/) || text.match(/(\d[\d,]*)\s*(?:تومان\s*)?(?:کرایه|ارسال|پیک)/);
    if (shipMatch) {
      invoice.shippingCost = global.Jalali ? global.Jalali.parseMoney(shipMatch[1]) : parseFloat(shipMatch[1]) || 0;
    }

    // Extract Paid amount (matches both "پرداخت: 50000" and "50000 نقد پرداخت شد")
    const paidMatch = text.match(/(?:پرداخت|واریز|پیش پرداخت)\s*[:：]?\s*(\d[\d,]*)/) || text.match(/(\d[\d,]*)\s*(?:تومان\s*)?(?:نقد|کارت|واریز|پرداخت)/);
    if (paidMatch) {
      invoice.paidAmount = global.Jalali ? global.Jalali.parseMoney(paidMatch[1]) : parseFloat(paidMatch[1]) || 0;
      invoice.paymentMethod = text.includes('کارت') ? 'کارت‌به‌کارت' : 'نقد';
    }

    // Extract Total Amount
    const totalMatch = text.match(/(?:جمع|کل|مبلغ|فروش|فاکتور|بهای کل)\s*[:：]?\s*(\d[\d,]*)/);
    if (totalMatch) {
      invoice.grandTotal = global.Jalali ? global.Jalali.parseMoney(totalMatch[1]) : parseFloat(totalMatch[1]) || 0;
    } else {
      // Find largest number mentioned
      const nums = (text.match(/\b\d{4,9}\b/g) || []).map(n => parseInt(n, 10));
      if (nums.length > 0) {
        invoice.grandTotal = Math.max(...nums);
      }
    }

    invoice.currentOrder = Math.max(0, invoice.grandTotal - invoice.shippingCost);
    invoice.remainingBalance = Math.max(0, invoice.grandTotal - invoice.paidAmount);
    invoice.status = (invoice.remainingBalance <= 0 && invoice.paidAmount > 0) ? 'settled' : 'credit';

    return invoice;
  }

  const TarazamParser = {
    parsePhase1Block,
    parseMultiplePhase1Blocks,
    parseFreeTextNotes
  };

  global.TarazamParser = TarazamParser;
  global.TarazakParser = TarazamParser;
})(typeof window !== 'undefined' ? window : global);
