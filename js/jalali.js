/**
 * Jalali (Shamsi) Date & Formatting Utilities
 * Handles Persian calendar conversion, formatting, decade/season calculations, and currency display.
 */
(function (global) {
  'use strict';

  // Standard Jalali <-> Gregorian conversion algorithm
  function gregorianToJalali(gy, gm, gd) {
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    const gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
    let jy = -1595 + (33 * Math.floor(days / 12053));
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      jy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    let jm, jd;
    if (days < 186) {
      jm = 1 + Math.floor(days / 31);
      jd = 1 + (days % 31);
    } else {
      jm = 7 + Math.floor((days - 186) / 30);
      jd = 1 + ((days - 186) % 30);
    }
    return [jy, jm, jd];
  }

  function jalaliToGregorian(jy, jm, jd) {
    jy = Number(jy);
    jm = Number(jm);
    jd = Number(jd);
    let gy = jy - 979;
    let gm = 0;
    let gd = 0;
    let jy_days = 365 * gy + Math.floor(gy / 33) * 8 + Math.floor(((gy % 33) + 3) / 4);
    for (let i = 0; i < jm - 1; ++i) {
      jy_days += (i < 6) ? 31 : 30;
    }
    jy_days += jd - 1;

    let g_day_no = jy_days + 79;
    let gy2 = 1600 + 400 * Math.floor(g_day_no / 146097);
    g_day_no %= 146097;

    let leap = true;
    if (g_day_no >= 36525) {
      g_day_no--;
      gy2 += 100 * Math.floor(g_day_no / 36524);
      g_day_no %= 36524;
      if (g_day_no >= 365) {
        g_day_no++;
      } else {
        leap = false;
      }
    }

    gy2 += 4 * Math.floor(g_day_no / 1461);
    g_day_no %= 1461;

    if (g_day_no >= 366) {
      leap = false;
      g_day_no--;
      gy2 += Math.floor(g_day_no / 365);
      g_day_no %= 365;
    }

    const g_days_in_month = [31, (leap ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let i;
    for (i = 0; g_day_no >= g_days_in_month[i]; i++) {
      g_day_no -= g_days_in_month[i];
    }
    gy = gy2;
    gm = i + 1;
    gd = g_day_no + 1;
    return [gy, gm, gd];
  }

  const MONTH_NAMES = [
    '', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
  ];

  const SEASON_NAMES = ['', 'بهار', 'تابستان', 'پاییز', 'زمستان'];

  function pad(num) {
    return String(num).padStart(2, '0');
  }

  function toEnglishDigits(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  }

  function toPersianDigits(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  }

  function formatMoney(amount, showUnit = false) {
    if (amount === null || amount === undefined || isNaN(amount)) amount = 0;
    const num = Math.round(Number(amount));
    const parts = Math.abs(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = (num < 0 ? '-' : '') + parts;
    const faStr = toPersianDigits(formatted);
    return showUnit ? `${faStr} تومان` : faStr;
  }

  function parseMoney(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const clean = toEnglishDigits(String(val)).replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  function todayJalali() {
    const d = new Date();
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return `${jy}/${pad(jm)}/${pad(jd)}`;
  }

  function parseJalali(dateStr) {
    if (!dateStr) return null;
    const clean = toEnglishDigits(String(dateStr).trim()).replace(/[-.]/g, '/');
    const match = clean.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!match) return null;
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const d = parseInt(match[3], 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return { year: y, month: m, day: d, formatted: `${y}/${pad(m)}/${pad(d)}` };
  }

  function getDecade(day) {
    day = Number(day);
    if (day <= 10) return 1;
    if (day <= 20) return 2;
    return 3;
  }

  function getDecadeTitle(decade, monthName) {
    const dNames = { 1: 'دهه اول', 2: 'دهه دوم', 3: 'دهه سوم' };
    return `${dNames[decade] || ''} ${monthName || ''}`.trim();
  }

  function getSeason(month) {
    month = Number(month);
    if (month >= 1 && month <= 3) return 1;
    if (month >= 4 && month <= 6) return 2;
    if (month >= 7 && month <= 9) return 3;
    return 4;
  }

  function getSeasonTitle(season, year) {
    return `${SEASON_NAMES[season] || ''} ${toPersianDigits(year)}`.trim();
  }

  function dateMeta(dateStr) {
    const parsed = parseJalali(dateStr) || parseJalali(todayJalali());
    const season = getSeason(parsed.month);
    const decade = getDecade(parsed.day);
    return {
      ...parsed,
      monthName: MONTH_NAMES[parsed.month],
      season,
      seasonName: SEASON_NAMES[season],
      decade,
      decadeTitle: getDecadeTitle(decade, MONTH_NAMES[parsed.month]),
      fullTitle: `${toPersianDigits(parsed.day)} ${MONTH_NAMES[parsed.month]} ${toPersianDigits(parsed.year)}`
    };
  }

  global.Jalali = {
    gregorianToJalali,
    jalaliToGregorian,
    todayJalali,
    parseJalali,
    dateMeta,
    getDecade,
    getDecadeTitle,
    getSeason,
    getSeasonTitle,
    formatMoney,
    parseMoney,
    toEnglishDigits,
    toPersianDigits,
    MONTH_NAMES,
    SEASON_NAMES
  };
})(typeof window !== 'undefined' ? window : global);
