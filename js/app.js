(() => {
  'use strict';

  /* ================= STORAGE ================= */
  const STORAGE_KEY = 'director-calendar-events-v1';

  function loadEvents() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Не удалось прочитать данные', e);
      return [];
    }
  }

  function saveEvents() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
  }

  const SETTINGS_KEY = 'director-calendar-settings-v1';
  const NOTIFIED_KEY = 'director-calendar-notified-v1';
  const DIGEST_KEY = 'director-calendar-digest-date-v1';
  const BANNER_DISMISS_KEY = 'director-calendar-banner-dismiss-v1';

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? Object.assign({ notifyEnabled: false, remindMinutes: 60 }, JSON.parse(raw)) : { notifyEnabled: false, remindMinutes: 60 };
    } catch (e) { return { notifyEnabled: false, remindMinutes: 60 }; }
  }
  function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); }

  function loadNotifiedSet() {
    try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }
  function saveNotifiedSet(set) { localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set])); }

  /* ================= STATE ================= */
  const today = new Date();

  function normalizeEvent(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const date = typeof raw.date === 'string' ? raw.date : '';
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!isValidDateString(date)) return null;

    const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
    const start = typeof raw.start === 'string' && validTime(raw.start) ? raw.start : '';
    const end = typeof raw.end === 'string' && validTime(raw.end) ? raw.end : '';
    const paymentRaw = Number(raw.payment);
    const payment = Number.isFinite(paymentRaw) && paymentRaw >= 0 ? paymentRaw : 0;

    return {
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : uid(),
      date,
      start,
      end,
      title,
      type: typeof raw.type === 'string' ? raw.type.trim() : '',
      project: typeof raw.project === 'string' ? raw.project.trim() : '',
      people: typeof raw.people === 'string' ? raw.people.trim() : '',
      location: typeof raw.location === 'string' ? raw.location.trim() : '',
      payment,
      currency: typeof raw.currency === 'string' && raw.currency.trim() ? raw.currency.trim().slice(0, 4) : '₽',
      paid: raw.paid === true,
      notes: typeof raw.notes === 'string' ? raw.notes.trim() : '',
    };
  }

  function normalizeEvents(rawEvents) {
    const result = [];
    const ids = new Set();
    (Array.isArray(rawEvents) ? rawEvents : []).forEach(raw => {
      const ev = normalizeEvent(raw);
      if (!ev) return;
      if (ids.has(ev.id)) ev.id = uid();
      ids.add(ev.id);
      result.push(ev);
    });
    return result;
  }

  const allowedReminderMinutes = [15, 30, 60, 120, 180, 1440];

  const state = {
    events: normalizeEvents(loadEvents()),
    tab: 'calendar',
    calYear: today.getFullYear(),
    calMonth: today.getMonth(),
    calView: 'month',
    filters: { search: '', project: '', type: '', person: '', from: '', to: '' },
    salaryFilters: { project: '', customers: [], status: '', from: '', to: '' },
    paymentsFilters: { project: '', customers: [], from: '', to: '' },
    editingId: null,
    dayDate: null,
    settings: Object.assign({ notifyEnabled: false, remindMinutes: 60 }, loadSettings()),
  };
  if (!allowedReminderMinutes.includes(Number(state.settings.remindMinutes))) state.settings.remindMinutes = 60;
  state.settings.notifyEnabled = state.settings.notifyEnabled === true;

  // Repair legacy/malformed localStorage data once on startup.
  saveEvents();
  saveSettings();

  /* ================= UTILITIES ================= */
  function uid() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function ymd(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function isValidDateString(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    const [y, m, d] = s.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  function parseYmd(s) {
    if (!isValidDateString(s)) return new Date(NaN);
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function todayStr() { return ymd(new Date()); }
  function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); }

  function eventDateTime(ev) {
    if (!ev.start) return null;
    const [h, m] = ev.start.split(':').map(Number);
    const d = parseYmd(ev.date);
    d.setHours(h, m, 0, 0);
    return d;
  }

  const MONTHS_NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const MONTHS_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  const WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  function formatDateHuman(dateStr) {
    const d = parseYmd(dateStr);
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatMoney(amount, currency) {
    const n = Number(amount) || 0;
    return n.toLocaleString('ru-RU') + ' ' + (currency || '₽');
  }

  function sumByCurrency(events, selector = ev => ev.payment) {
    const sums = new Map();
    events.forEach(ev => {
      const amount = Number(selector(ev)) || 0;
      if (!amount) return;
      const currency = ev.currency || '₽';
      sums.set(currency, (sums.get(currency) || 0) + amount);
    });
    return sums;
  }

  function formatCurrencyMap(map) {
    if (!map || map.size === 0) return '0 ₽';
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'ru'))
      .map(([currency, amount]) => formatMoney(amount, currency))
      .join(' + ');
  }

  function hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }

  function colorForProject(name) {
    if (!name) return 'hsl(220, 8%, 40%)';
    const h = hashStr(name) % 360;
    return `hsl(${h}, 42%, 40%)`;
  }

  function distinctValues(field) {
    const set = new Set();
    state.events.forEach(ev => { if (ev[field]) set.add(ev[field]); });
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  }

  function startOfWeek(d) {
    const day = (d.getDay() + 6) % 7; // Monday = 0
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  }
  function endOfWeek(d) {
    const s = startOfWeek(d);
    return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
  }

  /* ================= DOM SHORTCUTS ================= */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ================= TABS ================= */
  function switchTab(tab) {
    state.tab = tab;
    $$('.tab-btn').forEach(b => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $('#view-calendar').classList.toggle('hidden', tab !== 'calendar');
    $('#view-salary').classList.toggle('hidden', tab !== 'salary');
    $('#view-payments').classList.toggle('hidden', tab !== 'payments');
    if (tab === 'salary') renderSalary();
    else if (tab === 'payments') renderPayments();
    else renderCalendarTab();
  }

  /* ================= FILTER OPTIONS POPULATION ================= */
  function populateSelect(select, values, keepValue) {
    const current = keepValue !== undefined ? keepValue : select.value;
    const placeholder = select.querySelector('option[value=""]');
    select.innerHTML = '';
    if (placeholder) select.appendChild(placeholder);
    values.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      select.appendChild(opt);
    });
    select.value = values.includes(current) ? current : '';
  }

  /* multi-select dropdown with checkboxes */
  function buildMulti(sel, values, selected, onChange) {
    const root = $(sel);
    const btnLabel = root.querySelector('.multi-label');
    const panel = root.querySelector('.multi-panel');
    for (let i = selected.length - 1; i >= 0; i--) if (!values.includes(selected[i])) selected.splice(i, 1);
    const updateLabel = () => {
      btnLabel.textContent = selected.length === 0 ? 'Все заказчики'
        : selected.length <= 2 ? selected.join(', ') : `Выбрано: ${selected.length}`;
    };
    panel.innerHTML = `
      <input type="search" class="multi-search" placeholder="Поиск: имя, фамилия, отчество…" autocomplete="off">
      <div class="multi-list">${values.length ? values.map(v => `
        <label class="multi-opt" data-name="${escapeAttr(v.toLowerCase())}"><input type="checkbox" value="${escapeAttr(v)}"${selected.includes(v) ? ' checked' : ''}><span>${escapeHtml(v)}</span></label>`).join('')
        : '<div class="multi-empty">Заказчиков пока нет</div>'}
        <div class="multi-empty multi-nomatch hidden">Никого не найдено</div>
      </div>`;
    const search = panel.querySelector('.multi-search');
    const applySearch = () => {
      // every typed word must appear somewhere in the name (any order: фамилия/имя/отчество)
      const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      panel.querySelectorAll('.multi-opt').forEach(o => {
        const ok = words.every(w => o.dataset.name.includes(w));
        o.classList.toggle('hidden', !ok);
        if (ok) shown++;
      });
      panel.querySelector('.multi-nomatch').classList.toggle('hidden', shown > 0 || !values.length);
    };
    search.addEventListener('input', applySearch);
    panel.querySelectorAll('.multi-opt input').forEach(cb => cb.addEventListener('change', () => {
      const v = cb.value;
      const i = selected.indexOf(v);
      if (cb.checked && i < 0) selected.push(v);
      if (!cb.checked && i >= 0) selected.splice(i, 1);
      updateLabel();
      onChange();
    }));
    if (!root.dataset.bound) {
      root.dataset.bound = '1';
      root.querySelector('.multi-btn').addEventListener('click', () => {
        $$('.multi-panel').forEach(p => { if (p !== panel) p.classList.add('hidden'); });
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) setTimeout(() => search.focus(), 0);
      });
    }
    updateLabel();
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('.multi')) $$('.multi-panel').forEach(p => p.classList.add('hidden'));
  });

  function refreshDropdowns() {
    const projects = distinctValues('project');

    populateSelect($('#f-project'), projects, state.filters.project);
    populateSelect($('#s-project'), projects, state.salaryFilters.project);
    populateSelect($('#p-project'), projects, state.paymentsFilters.project);
    const customers = distinctValues('people');
    $('#customer-options').innerHTML = customers.map(p => `<option value="${escapeAttr(p)}">`).join('');
    buildMulti('#p-customer', customers, state.paymentsFilters.customers, () => { renderPayments(); });
    buildMulti('#s-customer', customers, state.salaryFilters.customers, () => { renderSalary(); });

    const projList = $('#project-options');
    projList.innerHTML = projects.map(p => `<option value="${escapeAttr(p)}">`).join('');

  }

  // Events have no title field any more: show project, else customer, else legacy title
  function eventLabel(ev) {
    return ev.project || ev.people || ev.title || 'Занятость';
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  /* ================= CALENDAR FILTERING ================= */
  function matchesCalendarFilters(ev) {
    const f = state.filters;
    if (f.project && ev.project !== f.project) return false;
    if (f.person && !(ev.people || '').toLowerCase().includes(f.person.toLowerCase())) return false;
    if (f.from && ev.date < f.from) return false;
    if (f.to && ev.date > f.to) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = [ev.project, ev.type, ev.people, ev.location, ev.notes].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function getFilteredEvents() {
    return state.events.filter(matchesCalendarFilters);
  }

  function readCalendarFiltersFromDOM() {
    state.filters.search = $('#f-search').value.trim();
    state.filters.project = $('#f-project').value;
    state.filters.person = $('#f-person').value.trim();
    state.filters.from = $('#f-from').value;
    state.filters.to = $('#f-to').value;
  }

  /* ================= CALENDAR RENDERING ================= */
  function renderCalendarTab() {
    if (state.calView === 'month') renderMonthGrid();
    else renderListView();
  }

  function renderMonthGrid() {
    $('#calendar-grid').closest('.calendar-scroll').classList.remove('hidden');
    $('#cal-nav-month').classList.remove('hidden');
    $('#list-wrap').classList.add('hidden');

    $('#cal-month-label').textContent = `${MONTHS_NOM[state.calMonth]} ${state.calYear}`;

    const grid = $('#calendar-grid');
    grid.innerHTML = '';
    WEEKDAYS.forEach(w => {
      const el = document.createElement('div');
      el.className = 'cal-weekday';
      el.textContent = w;
      grid.appendChild(el);
    });

    const firstOfMonth = new Date(state.calYear, state.calMonth, 1);
    const offset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(state.calYear, state.calMonth, 1 - offset);

    const filtered = getFilteredEvents();
    const byDate = {};
    filtered.forEach(ev => { (byDate[ev.date] = byDate[ev.date] || []).push(ev); });

    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const dateStr = ymd(d);
      const cell = document.createElement('div');
      cell.className = 'cal-day';
      if (d.getMonth() !== state.calMonth) cell.classList.add('other-month');
      if (dateStr === todayStr()) cell.classList.add('today');

      const num = document.createElement('div');
      num.className = 'cal-day-num';
      num.textContent = d.getDate();
      cell.appendChild(num);

      const dayEvents = (byDate[dateStr] || []).slice().sort((a,b) => (a.start||'').localeCompare(b.start||''));
      const maxShow = 3;
      dayEvents.slice(0, maxShow).forEach(ev => {
        const chip = document.createElement('div');
        chip.className = 'cal-chip';
        if (ev.payment > 0) chip.classList.add(ev.paid ? 'chip-paid' : 'chip-unpaid');
        chip.style.background = colorForProject(ev.project || ev.type);
        chip.textContent = (ev.start ? ev.start + ' ' : '') + eventLabel(ev);
        chip.title = eventLabel(ev) + (ev.payment > 0 ? (ev.paid ? ' · оплачено' : ' · долг') : '');
        cell.appendChild(chip);
      });
      if (dayEvents.length > maxShow) {
        const more = document.createElement('div');
        more.className = 'cal-more';
        more.textContent = `+${dayEvents.length - maxShow} ещё`;
        cell.appendChild(more);
      }

      cell.addEventListener('click', () => openDayPanel(dateStr));
      grid.appendChild(cell);
    }
  }

  function renderListView() {
    $('#calendar-grid').closest('.calendar-scroll').classList.add('hidden');
    $('#cal-nav-month').classList.add('hidden');
    $('#list-wrap').classList.remove('hidden');

    const filtered = getFilteredEvents().slice().sort((a, b) => {
      return a.date === b.date ? (a.start || '').localeCompare(b.start || '') : a.date.localeCompare(b.date);
    });

    const body = $('#list-body');
    body.innerHTML = '';
    $('#list-empty').classList.toggle('hidden', filtered.length !== 0);

    filtered.forEach(ev => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${formatDateHuman(ev.date)}</td>
        <td class="mono">${ev.start || ''}${ev.end ? '–' + ev.end : ''}</td>
        <td>${ev.project ? `<span class="proj-tag" style="background:${colorForProject(ev.project)}">${escapeHtml(ev.project)}</span>` : '—'}</td>
        <td>${escapeHtml(ev.people) || '—'}</td>
        <td>${escapeHtml(ev.location) || '—'}</td>
        <td class="mono">${ev.payment ? `<span class="pay-dot ${ev.paid ? 'dot-paid' : 'dot-unpaid'}"></span>${formatMoney(ev.payment, ev.currency)}` : '—'}</td>
        <td><button class="row-edit" data-id="${escapeAttr(ev.id)}">изменить</button></td>
      `;
      body.appendChild(tr);
    });

    body.querySelectorAll('.row-edit').forEach(btn => {
      btn.addEventListener('click', () => openEventModal(state.events.find(e => e.id === btn.dataset.id)));
    });
  }

  /* ================= DAY PANEL ================= */
  function openDayPanel(dateStr) {
    state.dayDate = dateStr;
    $('#day-title').textContent = formatDateHuman(dateStr);
    const dayEvents = state.events
      .filter(ev => ev.date === dateStr)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    const wrap = $('#day-events');
    wrap.innerHTML = '';
    if (dayEvents.length === 0) {
      wrap.innerHTML = '<p class="empty-note">На этот день ничего не запланировано.</p>';
    }
    dayEvents.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'day-event-item';
      const when = `${formatDateHuman(ev.date)}${ev.start ? ', ' + ev.start + (ev.end ? '–' + ev.end : '') : ''}`;
      item.innerHTML = `
        <div class="day-event-main">
          <span class="day-event-time">${escapeHtml(when)}</span>
          <span class="day-event-line">${escapeHtml(ev.people) || '—'}</span>
          <span class="day-event-line">${escapeHtml(ev.project) || '—'}</span>
          <span class="day-event-line">${escapeHtml(ev.location) || '—'}</span>
        </div>
      `;
      item.addEventListener('click', () => { closeDayPanel(); openEventModal(ev); });
      wrap.appendChild(item);
    });

    $('#day-backdrop').classList.remove('hidden');
  }
  function closeDayPanel() { $('#day-backdrop').classList.add('hidden'); }

  /* ================= EVENT MODAL ================= */
  function openEventModal(ev, prefillDate) {
    state.editingId = ev ? ev.id : null;
    $('#modal-title').textContent = ev ? 'Редактировать занятость' : 'Новая занятость';
    $('#btn-delete-event').classList.toggle('hidden', !ev);

    $('#ev-id').value = ev ? ev.id : '';
    $('#ev-date').value = ev ? ev.date : (prefillDate || todayStr());
    $('#ev-start').value = ev ? (ev.start || '') : '';
    $('#ev-end').value = ev ? (ev.end || '') : '';
    $('#ev-project').value = ev ? (ev.project || '') : '';
    $('#ev-people').value = ev ? (ev.people || '') : '';
    $('#ev-location').value = ev ? (ev.location || '') : '';
    $('#ev-payment').value = ev ? (ev.payment || '') : '';
    $('#ev-currency').value = ev ? (ev.currency || '₽') : '₽';
    $('#ev-paid').checked = ev ? !!ev.paid : false;
    $('#ev-notes').value = ev ? (ev.notes || '') : '';

    $('#modal-backdrop').classList.remove('hidden');
    setTimeout(() => $('#ev-project').focus(), 30);
  }
  function closeEventModal() { $('#modal-backdrop').classList.add('hidden'); state.editingId = null; }

  function saveEventFromForm(e) {
    e.preventDefault();
    const raw = {
      id: $('#ev-id').value || uid(),
      date: $('#ev-date').value,
      start: $('#ev-start').value,
      end: $('#ev-end').value,
      title: (state.events.find(x => x.id === $('#ev-id').value) || {}).title || '',
      type: (state.events.find(x => x.id === $('#ev-id').value) || {}).type || '',
      project: $('#ev-project').value.trim(),
      people: $('#ev-people').value.trim(),
      location: $('#ev-location').value.trim(),
      payment: $('#ev-payment').value,
      currency: $('#ev-currency').value.trim() || '₽',
      paid: $('#ev-paid').checked,
      notes: $('#ev-notes').value.trim(),
    };

    const ev = normalizeEvent(raw);
    if (!ev) {
      alert('Проверьте дату и время события.');
      return;
    }
    if (ev.start && ev.end && ev.end < ev.start) {
      alert('Время окончания не может быть раньше времени начала.');
      return;
    }

    const idx = state.events.findIndex(x => x.id === ev.id);
    if (idx >= 0) state.events[idx] = ev; else state.events.push(ev);

    saveEvents();
    closeEventModal();
    refreshDropdowns();
    renderCalendarTab();
    renderSalary();
    renderPayments();
    renderReminderBanner();
  }

  function deleteEvent() {
    if (!state.editingId) return;
    if (!confirm('Удалить эту запись из календаря?')) return;
    state.events = state.events.filter(e => e.id !== state.editingId);
    saveEvents();
    closeEventModal();
    refreshDropdowns();
    renderCalendarTab();
    renderSalary();
    renderPayments();
    renderReminderBanner();
  }

  /* ================= SALARY TAB ================= */
  function readSalaryFiltersFromDOM() {
    state.salaryFilters.project = $('#s-project').value;
    state.salaryFilters.status = $('#s-status').value;
    state.salaryFilters.from = $('#s-from').value;
    state.salaryFilters.to = $('#s-to').value;
  }

  function getSalaryEvents() {
    const f = state.salaryFilters;
    return state.events.filter(ev => {
      if (f.project && ev.project !== f.project) return false;
      if (f.customers.length && !f.customers.includes(ev.people)) return false;
      if (f.status === 'paid' && !ev.paid) return false;
      if (f.status === 'unpaid' && ev.paid) return false;
      if (f.from && ev.date < f.from) return false;
      if (f.to && ev.date > f.to) return false;
      return true;
    });
  }

  function renderSalary() {
    const events = getSalaryEvents();

    const totalMap = sumByCurrency(events);
    const paidMap = sumByCurrency(events, ev => ev.paid ? ev.payment : 0);
    const unpaidMap = sumByCurrency(events, ev => !ev.paid ? ev.payment : 0);

    const dateSet = new Set(events.filter(ev => (Number(ev.payment) || 0) > 0).map(ev => ev.date));
    const days = dateSet.size;

    $('#sum-total').textContent = formatCurrencyMap(totalMap);
    $('#sum-paid').textContent = formatCurrencyMap(paidMap);
    $('#sum-unpaid').textContent = formatCurrencyMap(unpaidMap);
    $('#sum-days').textContent = days;
    $('#sum-avg').textContent = totalMap.size <= 1
      ? formatMoney(days ? [...totalMap.values()][0] / days : 0, [...totalMap.keys()][0] || '₽')
      : '—';
    $('#sum-avg').title = totalMap.size > 1 ? 'Среднее нельзя корректно посчитать при разных валютах.' : '';

    renderMonthChart(events);
    renderProjectBreakdown(events);
    renderDayBreakdown(events);
  }

  function renderMonthChart(events) {
    const chart = $('#month-chart');
    const notice = $('#chart-currency-note');
    const currencies = [...sumByCurrency(events).keys()];

    const chartYear = state.salaryFilters.from && isValidDateString(state.salaryFilters.from)
      ? parseYmd(state.salaryFilters.from).getFullYear()
      : new Date().getFullYear();
    $('#chart-year-label').textContent = chartYear;

    if (currencies.length > 1) {
      chart.innerHTML = '';
      chart.classList.add('hidden');
      notice.textContent = 'График скрыт: в выбранном периоде используются разные валюты.';
      notice.classList.remove('hidden');
      return;
    }

    chart.classList.remove('hidden');
    notice.classList.add('hidden');
    const currency = currencies[0] || '₽';
    const sums = new Array(12).fill(0);
    events.forEach(ev => {
      const d = parseYmd(ev.date);
      if (d.getFullYear() === chartYear && (ev.currency || '₽') === currency) {
        sums[d.getMonth()] += Number(ev.payment) || 0;
      }
    });
    const max = Math.max(...sums, 1);

    chart.innerHTML = sums.map((v, i) => `
      <div class="bar-col" title="${MONTHS_NOM[i]}: ${formatMoney(v, currency)}">
        <div class="bar-fill ${v > 0 ? 'has-value' : ''}" style="height:${Math.max((v / max) * 100, 2)}%"></div>
        <span class="bar-label">${MONTHS_SHORT[i]}</span>
      </div>
    `).join('');
  }

  function renderProjectBreakdown(events) {
    const map = {};
    events.forEach(ev => {
      const key = ev.project || 'Без проекта';
      if (!map[key]) map[key] = { count: 0, sums: new Map(), customers: new Set() };
      if (ev.people) map[key].customers.add(ev.people);
      map[key].count += 1;
      const amount = Number(ev.payment) || 0;
      if (amount) {
        const currency = ev.currency || '₽';
        map[key].sums.set(currency, (map[key].sums.get(currency) || 0) + amount);
      }
    });
    const rows = Object.entries(map).sort((a, b) => {
      const aTotal = [...a[1].sums.values()].reduce((x, y) => x + y, 0);
      const bTotal = [...b[1].sums.values()].reduce((x, y) => x + y, 0);
      return bTotal - aTotal;
    });
    const body = $('#project-breakdown');
    body.innerHTML = rows.length ? rows.map(([name, v]) => `
      <tr>
        <td><span class="proj-tag" style="background:${colorForProject(name === 'Без проекта' ? '' : name)}">${escapeHtml(name)}</span></td>
        <td>${escapeHtml([...v.customers].join(', ')) || '—'}</td>
        <td class="mono">${v.count}</td>
        <td class="mono">${escapeHtml(formatCurrencyMap(v.sums))}</td>
      </tr>`).join('') : `<tr><td colspan="4" class="empty-note">Нет данных</td></tr>`;
  }

  function renderDayBreakdown(events) {
    const map = {};
    events.forEach(ev => {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    });
    const dates = Object.keys(map).sort((a, b) => a.localeCompare(b));
    const body = $('#day-breakdown');
    $('#salary-empty').classList.toggle('hidden', dates.length !== 0);

    body.innerHTML = dates.map(date => {
      const evs = map[date];
      const sums = sumByCurrency(evs);
      const projects = [...new Set(evs.map(e => e.project).filter(Boolean))];
      const projectLabel = projects.length === 0 ? '—' : projects.length === 1 ? projects[0] : 'неск. проектов';
      const custs = [...new Set(evs.map(e => e.people).filter(Boolean))];
      const customerLabel = custs.length === 0 ? '—' : custs.join(', ');
      const paidCount = evs.filter(e => e.paid).length;
      const status = paidCount === 0 ? 'Ожидает' : paidCount === evs.length ? 'Оплачено' : 'Частично';
      return `<tr>
        <td class="mono">${formatDateHuman(date)}</td>
        <td>${escapeHtml(projectLabel)}</td>
        <td>${escapeHtml(customerLabel)}</td>
        <td class="mono">${escapeHtml(formatCurrencyMap(sums))}</td>
        <td>${status}</td>
      </tr>`;
    }).join('');
  }

  /* ================= PAYMENTS TAB ================= */
  function readPaymentsFiltersFromDOM() {
    state.paymentsFilters.project = $('#p-project').value;
    state.paymentsFilters.from = $('#p-from').value;
    state.paymentsFilters.to = $('#p-to').value;
  }

  function getPaymentsEvents() {
    const f = state.paymentsFilters;
    return state.events.filter(ev => {
      if (!(ev.payment > 0)) return false;
      if (f.project && ev.project !== f.project) return false;
      if (f.customers.length && !f.customers.includes(ev.people)) return false;
      if (f.from && ev.date < f.from) return false;
      if (f.to && ev.date > f.to) return false;
      return true;
    });
  }

  function togglePaid(id, newVal) {
    const ev = state.events.find(e => e.id === id);
    if (!ev) return;
    ev.paid = newVal;
    saveEvents();
    renderSalary();
    renderPayments();
    renderCalendarTab();
  }

  function renderPayments() {
    const events = getPaymentsEvents();
    const allSums = sumByCurrency(events);
    const paidSums = sumByCurrency(events, ev => ev.paid ? ev.payment : 0);
    const owedSums = sumByCurrency(events, ev => !ev.paid ? ev.payment : 0);

    let owedProjectsCount = 0;
    const byProject = {};
    events.forEach(ev => {
      const key = ev.project || 'Без проекта';
      if (!byProject[key]) byProject[key] = { paid: new Map(), owed: new Map(), customers: new Set() };
      if (ev.people) byProject[key].customers.add(ev.people);
      const amount = Number(ev.payment) || 0;
      if (!amount) return;
      const currency = ev.currency || '₽';
      const target = ev.paid ? byProject[key].paid : byProject[key].owed;
      target.set(currency, (target.get(currency) || 0) + amount);
    });
    owedProjectsCount = Object.values(byProject).filter(v => v.owed.size > 0).length;

    $('#pay-owed-total').textContent = formatCurrencyMap(owedSums);
    $('#pay-paid-total').textContent = formatCurrencyMap(paidSums);
    $('#pay-owed-projects').textContent = owedProjectsCount;

    const rows = Object.entries(byProject).sort((a, b) => {
      const aTotal = [...a[1].owed.values()].reduce((x, y) => x + y, 0);
      const bTotal = [...b[1].owed.values()].reduce((x, y) => x + y, 0);
      return bTotal - aTotal;
    });
    const projectBody = $('#pay-project-table');
    projectBody.innerHTML = rows.length ? rows.map(([name, v]) => {
      const owed = [...v.owed.values()].reduce((x, y) => x + y, 0);
      const paid = [...v.paid.values()].reduce((x, y) => x + y, 0);
      const status = owed === 0 ? 'Оплачено' : paid === 0 ? 'Должны' : 'Частично';
      const statusClass = owed === 0 ? 'muted-green' : paid === 0 ? 'muted-red' : 'muted-amber';
      return `<tr>
        <td><span class="proj-tag" style="background:${colorForProject(name === 'Без проекта' ? '' : name)}">${escapeHtml(name)}</span></td>
        <td>${escapeHtml([...v.customers].join(', ')) || '—'}</td>
        <td class="mono muted-green">${escapeHtml(formatCurrencyMap(v.paid))}</td>
        <td class="mono muted-red">${escapeHtml(formatCurrencyMap(v.owed))}</td>
        <td class="${statusClass}">${status}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" class="empty-note">Нет данных об оплатах</td></tr>`;

    const owed = events.filter(ev => !ev.paid).sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));
    $('#pay-owed-empty').classList.toggle('hidden', owed.length !== 0);
    $('#pay-owed-list').innerHTML = owed.map(ev => `
      <tr>
        <td class="mono">${formatDateHuman(ev.date)}</td>
        <td>${ev.project ? escapeHtml(ev.project) : '—'}</td>
        <td>${escapeHtml(ev.people) || '—'}</td>
        <td class="mono muted-red">${escapeHtml(formatMoney(ev.payment, ev.currency))}</td>
        <td><input type="checkbox" class="pay-check" data-id="${escapeAttr(ev.id)}" aria-label="Оплачено"></td>
      </tr>`).join('');

    const paid = events.filter(ev => ev.paid).sort((a, b) => b.date.localeCompare(a.date) || (b.start || '').localeCompare(a.start || ''));
    $('#pay-paid-empty').classList.toggle('hidden', paid.length !== 0);
    $('#pay-paid-list').innerHTML = paid.map(ev => `
      <tr>
        <td class="mono">${formatDateHuman(ev.date)}</td>
        <td>${ev.project ? escapeHtml(ev.project) : '—'}</td>
        <td>${escapeHtml(ev.people) || '—'}</td>
        <td class="mono muted-green">${escapeHtml(formatMoney(ev.payment, ev.currency))}</td>
        <td><input type="checkbox" class="pay-check" data-id="${escapeAttr(ev.id)}" checked aria-label="Оплачено"></td>
      </tr>`).join('');

    $$('.pay-check').forEach(cb => cb.addEventListener('change', () => togglePaid(cb.dataset.id, cb.checked)));
  }

  /* ================= REMINDERS & NOTIFICATIONS ================= */
  function renderReminderBanner() {
    const t = todayStr(), tm = tomorrowStr();
    const todayEvents = state.events.filter(e => e.date === t).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const tomorrowEvents = state.events.filter(e => e.date === tm).sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    const banner = $('#reminder-banner');
    const dismissed = localStorage.getItem(BANNER_DISMISS_KEY) === t;

    if (dismissed || (todayEvents.length === 0 && tomorrowEvents.length === 0)) {
      banner.classList.add('hidden');
      return;
    }

    const describe = (list) => list.map(e => `${e.start ? e.start + ' — ' : ''}${eventLabel(e)}`).join(', ');
    let text = '';
    if (todayEvents.length) text += `Сегодня: ${describe(todayEvents)}`;
    if (tomorrowEvents.length) text += (text ? '  ·  ' : '') + `Завтра: ${describe(tomorrowEvents)}`;

    $('#reminder-text').textContent = text;
    banner.classList.remove('hidden');
  }

  function dismissBanner() {
    localStorage.setItem(BANNER_DISMISS_KEY, todayStr());
    $('#reminder-banner').classList.add('hidden');
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) {
      alert('Ваш браузер не поддерживает уведомления.');
      return false;
    }
    if (Notification.permission === 'granted') return true;
    try {
      Notification.requestPermission().then(perm => {
        const enabled = perm === 'granted';
        state.settings.notifyEnabled = enabled;
        saveSettings();
        $('#notif-enabled').checked = enabled;
        if (!enabled) {
          alert('Уведомления не разрешены в браузере. Включите их в настройках сайта, чтобы получать напоминания.');
        }
      });
    } catch (err) {
      state.settings.notifyEnabled = false;
      saveSettings();
      return false;
    }
    return false;
  }

  function fireNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: undefined }); }
    catch (e) { /* some mobile browsers only allow notifications via service worker — silently ignore */ }
  }

  function checkReminders() {
    if (!state.settings.notifyEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;

    const now = new Date();
    const t = todayStr();
    const notified = loadNotifiedSet();
    let changed = false;

    state.events.forEach(ev => {
      if (ev.date !== t || !ev.start) return;
      const dt = eventDateTime(ev);
      if (!dt) return;
      const minutesUntil = (dt - now) / 60000;
      const key = ev.id;
      if (minutesUntil >= 0 && minutesUntil <= state.settings.remindMinutes && !notified.has(key)) {
        const when = minutesUntil < 1 ? 'начинается сейчас' : `через ${Math.round(minutesUntil)} мин.`;
        fireNotification(eventLabel(ev), `${when}${ev.project ? ' · ' + ev.project : ''}${ev.location ? ' · ' + ev.location : ''}`);
        notified.add(key);
        changed = true;
      }
    });

    // once-a-day digest of everything scheduled today
    const todayEvents = state.events.filter(e => e.date === t);
    if (todayEvents.length && localStorage.getItem(DIGEST_KEY) !== t) {
      fireNotification('Сегодня по плану', `${todayEvents.length} событи${todayEvents.length === 1 ? 'е' : 'я'}: ` + todayEvents.map(e => eventLabel(e)).join(', '));
      localStorage.setItem(DIGEST_KEY, t);
    }

    if (changed) saveNotifiedSet(notified);
  }

  /* ---------- .ics export ---------- */
  function icsEscape(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }
  function icsDateTime(dateStr, timeStr) {
    const d = parseYmd(dateStr);
    if (timeStr) {
      const [h, m] = timeStr.split(':').map(Number);
      d.setHours(h, m, 0, 0);
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
    }
    return null;
  }
  function icsDateOnly(dateStr) { return dateStr.replace(/-/g, ''); }
  function icsUtcStamp(date = new Date()) {
    return date.getUTCFullYear()
      + pad(date.getUTCMonth() + 1)
      + pad(date.getUTCDate())
      + 'T' + pad(date.getUTCHours())
      + pad(date.getUTCMinutes())
      + pad(date.getUTCSeconds()) + 'Z';
  }

  function eventToIcsBlock(ev, remindMinutes) {
    const uidLine = icsEscape(`${ev.id}@director-calendar`);
    const descParts = [ev.project && `Проект: ${ev.project}`, ev.people && `Заказчик: ${ev.people}`, ev.payment && `Оплата: ${formatMoney(ev.payment, ev.currency)}${ev.paid ? ' (оплачено)' : ' (ожидает оплаты)'}`, ev.notes]
      .filter(Boolean).join('\n');

    let dtLines;
    if (ev.start) {
      const dtStart = icsDateTime(ev.date, ev.start);
      const dtEnd = icsDateTime(ev.date, ev.end) || icsDateTime(ev.date, ev.start);
      dtLines = `DTSTART:${dtStart}\r\nDTEND:${dtEnd}`;
    } else {
      const day = icsDateOnly(ev.date);
      const next = ymd(new Date(parseYmd(ev.date).getTime() + 86400000)).replace(/-/g, '');
      dtLines = `DTSTART;VALUE=DATE:${day}\r\nDTEND;VALUE=DATE:${next}`;
    }

    const alarm = ev.start ? `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:${icsEscape(eventLabel(ev))}\r\nTRIGGER:-PT${remindMinutes}M\r\nEND:VALARM\r\n` : '';

    return `BEGIN:VEVENT\r\nUID:${uidLine}\r\nDTSTAMP:${icsUtcStamp()}\r\n${dtLines}\r\nSUMMARY:${icsEscape(eventLabel(ev))}\r\nLOCATION:${icsEscape(ev.location)}\r\nDESCRIPTION:${icsEscape(descParts)}\r\n${alarm}END:VEVENT\r\n`;
  }

  function downloadIcs(filename, vevents) {
    const content = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//director-calendar//ru\r\nCALSCALE:GREGORIAN\r\n${vevents}END:VCALENDAR\r\n`;
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportAllIcs() {
    if (state.events.length === 0) { alert('Пока нет ни одной записи для экспорта.'); return; }
    const blocks = state.events.map(ev => eventToIcsBlock(ev, state.settings.remindMinutes)).join('');
    downloadIcs('calendar-events.ics', blocks);
  }

  function exportSingleEventIcs() {
    const ev = {
      id: $('#ev-id').value || uid(),
      date: $('#ev-date').value,
      start: $('#ev-start').value,
      end: $('#ev-end').value,
      title: '',
      project: $('#ev-project').value.trim(),
      people: $('#ev-people').value.trim(),
      location: $('#ev-location').value.trim(),
      payment: parseFloat($('#ev-payment').value) || 0,
      currency: $('#ev-currency').value.trim() || '₽',
      paid: $('#ev-paid').checked,
      notes: $('#ev-notes').value.trim(),
    };
    if (!ev.date) { alert('Сначала укажите дату события.'); return; }
    downloadIcs(`${eventLabel(ev).replace(/[^\wа-яА-Я0-9]+/gi, '-') || 'event'}.ics`, eventToIcsBlock(ev, state.settings.remindMinutes));
  }

  /* ================= PRESETS ================= */
  function applyCalendarPreset(preset) {
    const d = new Date();
    let from, to;
    if (preset === 'today') { from = to = d; }
    else if (preset === 'week') { from = startOfWeek(d); to = endOfWeek(d); }
    else if (preset === 'month') { from = new Date(d.getFullYear(), d.getMonth(), 1); to = new Date(d.getFullYear(), d.getMonth() + 1, 0); }
    else if (preset === 'year') { from = new Date(d.getFullYear(), 0, 1); to = new Date(d.getFullYear(), 11, 31); }
    $('#f-from').value = ymd(from);
    $('#f-to').value = ymd(to);
    readCalendarFiltersFromDOM();
    renderCalendarTab();
  }

  function applySalaryPreset(preset) {
    const d = new Date();
    let from, to;
    if (preset === 'month') { from = new Date(d.getFullYear(), d.getMonth(), 1); to = new Date(d.getFullYear(), d.getMonth() + 1, 0); }
    else if (preset === 'quarter') { const q = Math.floor(d.getMonth() / 3); from = new Date(d.getFullYear(), q * 3, 1); to = new Date(d.getFullYear(), q * 3 + 3, 0); }
    else if (preset === 'year') { from = new Date(d.getFullYear(), 0, 1); to = new Date(d.getFullYear(), 11, 31); }
    else if (preset === 'all') { $('#s-from').value = ''; $('#s-to').value = ''; readSalaryFiltersFromDOM(); renderSalary(); return; }
    $('#s-from').value = ymd(from);
    $('#s-to').value = ymd(to);
    readSalaryFiltersFromDOM();
    renderSalary();
  }

  /* ================= EXPORT / IMPORT ================= */
  function exportData() {
    const blob = new Blob([JSON.stringify(state.events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendar-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error('bad format');

        const imported = normalizeEvents(parsed);
        const skipped = parsed.length - imported.length;
        const merge = confirm('Добавить импортированные записи к текущим?\nОК — добавить, Отмена — заменить всё.');

        if (merge) {
          const existingIds = new Set(state.events.map(e => e.id));
          imported.forEach(ev => {
            if (existingIds.has(ev.id)) ev.id = uid();
            existingIds.add(ev.id);
            state.events.push(ev);
          });
        } else {
          state.events = imported;
        }

        saveEvents();
        refreshDropdowns();
        renderCalendarTab();
        renderSalary();
        renderPayments();
        renderReminderBanner();
        alert(`Импорт завершён. Загружено: ${imported.length}.${skipped ? ` Пропущено некорректных записей: ${skipped}.` : ''}`);
      } catch (err) {
        console.error(err);
        alert('Не удалось прочитать файл. Убедитесь, что это корректная резервная копия JSON.');
      }
    };
    reader.onerror = () => alert('Не удалось прочитать выбранный файл.');
    reader.readAsText(file);
  }

  /* ================= EVENT LISTENERS ================= */
  function setupFilterToggles() {
    $$('.view').forEach(view => {
      const aside = view.querySelector('.filters');
      if (!aside) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ghost filters-toggle';
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<span>⚙ Фильтры</span><span class="chev">▾</span>';
      btn.addEventListener('click', () => {
        const open = aside.classList.toggle('open');
        btn.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
      view.insertBefore(btn, aside);
    });
  }

  function bindEvents() {
    setupFilterToggles();
    $$('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    // calendar filters
    ['#f-search', '#f-person'].forEach(sel => $(sel).addEventListener('input', () => { readCalendarFiltersFromDOM(); renderCalendarTab(); }));
    ['#f-project', '#f-from', '#f-to'].forEach(sel => $(sel).addEventListener('change', () => { readCalendarFiltersFromDOM(); renderCalendarTab(); }));

    $$('.chip[data-preset]').forEach(chip => chip.addEventListener('click', () => {
      $$('.chip[data-preset]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyCalendarPreset(chip.dataset.preset);
    }));

    $('#btn-reset-filters').addEventListener('click', () => {
      $('#f-search').value = ''; $('#f-project').value = '';
      $('#f-person').value = ''; $('#f-from').value = ''; $('#f-to').value = '';
      $$('.chip[data-preset]').forEach(c => c.classList.remove('active'));
      readCalendarFiltersFromDOM();
      renderCalendarTab();
    });

    $$('.seg-btn').forEach(b => b.addEventListener('click', () => {
      $$('.seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.calView = b.dataset.view;
      renderCalendarTab();
    }));

    $('#cal-prev').addEventListener('click', () => { changeMonth(-1); });
    $('#cal-next').addEventListener('click', () => { changeMonth(1); });
    $('#cal-today').addEventListener('click', () => { const now = new Date(); state.calYear = now.getFullYear(); state.calMonth = now.getMonth(); renderCalendarTab(); });

    // salary filters
    ['#s-project', '#s-status', '#s-from', '#s-to'].forEach(sel => $(sel).addEventListener('change', () => { readSalaryFiltersFromDOM(); renderSalary(); }));
    $$('.chip[data-spreset]').forEach(chip => chip.addEventListener('click', () => {
      $$('.chip[data-spreset]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applySalaryPreset(chip.dataset.spreset);
    }));
    $('#btn-reset-sfilters').addEventListener('click', () => {
      $('#s-project').value = ''; state.salaryFilters.customers.length = 0; $('#s-status').value = ''; $('#s-from').value = ''; $('#s-to').value = '';
      $$('.chip[data-spreset]').forEach(c => c.classList.remove('active'));
      readSalaryFiltersFromDOM();
      refreshDropdowns();
      renderSalary();
    });

    // event modal
    $('#btn-add-event').addEventListener('click', () => openEventModal(null));
    $('#modal-close').addEventListener('click', closeEventModal);
    $('#btn-cancel-event').addEventListener('click', closeEventModal);
    $('#event-form').addEventListener('submit', saveEventFromForm);
    $('#btn-delete-event').addEventListener('click', deleteEvent);
    $('#modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeEventModal(); });

    // day panel
    $('#day-close').addEventListener('click', closeDayPanel);
    $('#day-backdrop').addEventListener('click', (e) => { if (e.target.id === 'day-backdrop') closeDayPanel(); });
    $('#day-add').addEventListener('click', () => { const d = state.dayDate; closeDayPanel(); openEventModal(null, d); });

    // payments filters
    ['#p-project', '#p-from', '#p-to'].forEach(sel => $(sel).addEventListener('change', () => { readPaymentsFiltersFromDOM(); renderPayments(); }));
    $('#btn-reset-pfilters').addEventListener('click', () => {
      $('#p-project').value = ''; state.paymentsFilters.customers.length = 0; $('#p-from').value = ''; $('#p-to').value = '';
      readPaymentsFiltersFromDOM();
      refreshDropdowns();
      renderPayments();
    });

    // export / import
    $('#btn-export').addEventListener('click', exportData);
    $('#input-import').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });

    // reminders
    $('#reminder-dismiss').addEventListener('click', dismissBanner);
    $('#btn-reminders').addEventListener('click', () => {
      $('#notif-enabled').checked = state.settings.notifyEnabled;
      $('#notif-minutes').value = state.settings.remindMinutes;
      $('#reminders-backdrop').classList.remove('hidden');
    });
    $('#reminders-close').addEventListener('click', () => $('#reminders-backdrop').classList.add('hidden'));
    $('#reminders-backdrop').addEventListener('click', (e) => { if (e.target.id === 'reminders-backdrop') $('#reminders-backdrop').classList.add('hidden'); });
    $('#notif-enabled').addEventListener('change', (e) => {
      if (e.target.checked) {
        const granted = requestNotificationPermission();
        if (granted) {
          state.settings.notifyEnabled = true;
          saveSettings();
        } else {
          // Permission is pending or unavailable; the async callback will persist the final state.
          if (!('Notification' in window) || Notification.permission === 'denied') {
            e.target.checked = false;
            state.settings.notifyEnabled = false;
            saveSettings();
          }
        }
      } else {
        state.settings.notifyEnabled = false;
        saveSettings();
      }
    });
    $('#notif-minutes').addEventListener('change', (e) => { state.settings.remindMinutes = parseInt(e.target.value, 10); saveSettings(); });
    $('#btn-export-ics').addEventListener('click', exportAllIcs);
    $('#btn-event-ics').addEventListener('click', exportSingleEventIcs);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeEventModal(); closeDayPanel(); $('#reminders-backdrop').classList.add('hidden'); }
    });
  }

  function changeMonth(delta) {
    state.calMonth += delta;
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    renderCalendarTab();
  }

  /* ================= INIT ================= */
  function init() {
    bindEvents();
    refreshDropdowns();
    renderCalendarTab();
    renderReminderBanner();
    checkReminders();
    setInterval(checkReminders, 60000);
    window.addEventListener('focus', checkReminders);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
