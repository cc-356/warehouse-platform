(() => {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const format = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  function parse(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return format(date) === value ? date : null;
  }
  function monthDays(year, month) {
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    return { offset, count };
  }
  if (typeof module !== 'undefined') module.exports = { format, parse, monthDays };
  if (typeof document === 'undefined') return;
  let active = null;
  let view = new Date();
  function close(restoreFocus = false) {
    if (!active) return;
    const button = active.querySelector('[data-calendar-toggle]');
    active.querySelector('.supplier-calendar').hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
    active.classList.remove('calendar-above');
    active = null;
  }
  function choose(value) {
    const input = active.querySelector('input');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    close();
    input.focus();
  }
  function render() {
    const year = view.getFullYear(), month = view.getMonth();
    const input = active.querySelector('input');
    const { offset, count } = monthDays(year, month);
    const today = format(new Date());
    const years = Array.from({ length: 41 }, (_, i) => year - 20 + i);
    const header = '<div class="calendar-heading"><button type="button" data-calendar-shift="-1" aria-label="上个月">‹</button>'
      + '<select data-calendar-year aria-label="年份">' + years.map(y => '<option ' + (y === year ? 'selected' : '') + '>' + y + '</option>').join('') + '</select>'
      + '<select data-calendar-month aria-label="月份">' + Array.from({ length: 12 }, (_, i) => '<option value="' + i + '" ' + (i === month ? 'selected' : '') + '>' + (i + 1) + '月</option>').join('') + '</select>'
      + '<button type="button" data-calendar-shift="1" aria-label="下个月">›</button></div>';
    const weekdays = '<div class="calendar-week">' + ['一','二','三','四','五','六','日'].map(day => '<span>' + day + '</span>').join('') + '</div>';
    let days = '<div class="calendar-days">' + '<span></span>'.repeat(offset);
    for (let day = 1; day <= count; day++) {
      const value = year + '-' + pad(month + 1) + '-' + pad(day);
      days += '<button type="button" data-calendar-date="' + value + '" aria-label="' + value + '" aria-pressed="' + (value === input.value) + '"'
        + ' class="' + (value === input.value ? 'selected ' : '') + (value === today ? 'today' : '') + '">' + day + '</button>';
    }
    days += '</div>';
    active.querySelector('.supplier-calendar').innerHTML = header + weekdays + days
      + '<div class="calendar-footer"><button type="button" data-calendar-clear>清空</button><button type="button" data-calendar-today>今天</button><button type="button" data-calendar-close>关闭</button></div>';
    // Scroll the modal, rather than the page, so the complete inline calendar is visible.
    const panel = active.querySelector('.supplier-calendar');
    const dialog = active.closest('dialog');
    if (dialog) {
      const bounds = dialog.getBoundingClientRect(), calendar = panel.getBoundingClientRect();
      const bottom = bounds.top + dialog.clientTop + dialog.clientHeight - 16;
      const top = bounds.top + dialog.clientTop + 16;
      if (calendar.bottom > bottom) dialog.scrollTop += calendar.bottom - bottom;
      else if (calendar.top < top) dialog.scrollTop -= top - calendar.top;
    } else if(active.classList.contains('demand-date-field')) {
      active.classList.remove('calendar-above');
      const bounds=active.getBoundingClientRect(),height=panel.getBoundingClientRect().height;
      active.classList.toggle('calendar-above',window.innerHeight-bounds.bottom<height+20 && bounds.top>height+90);
      const rect=panel.getBoundingClientRect();
      if(rect.bottom>window.innerHeight||rect.top<80)panel.scrollIntoView({block:'nearest',behavior:'instant'});
    }
  }
  document.addEventListener('click', event => {
    const calendarInput=event.target.closest('[data-calendar-input]');
    const toggle=event.target.closest('[data-calendar-toggle]')||calendarInput?.closest('.supplier-date-field').querySelector('[data-calendar-toggle]');
    if (toggle) {
      const field = toggle.closest('.supplier-date-field');
      if (active === field) { if(!calendarInput)close(); return; }
      close();
      active = field;
      view = parse(active.querySelector('input').value) || new Date();
      active.querySelector('.supplier-calendar').hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      render();
      return;
    }
    if (!active) return;
    if (!active.contains(event.target)) { close(); return; }
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-calendar-date')) choose(button.dataset.calendarDate);
    else if (button.hasAttribute('data-calendar-today')) choose(format(new Date()));
    else if (button.hasAttribute('data-calendar-clear')) choose('');
    else if (button.hasAttribute('data-calendar-close')) close(true);
    else if (button.hasAttribute('data-calendar-shift')) {
      view = new Date(view.getFullYear(), view.getMonth() + Number(button.dataset.calendarShift), 1);
      render();
    }
  });
  document.addEventListener('change', event => {
    if (!active) return;
    if (event.target.matches('[data-calendar-year]')) view = new Date(Number(event.target.value), view.getMonth(), 1);
    else if (event.target.matches('[data-calendar-month]')) view = new Date(view.getFullYear(), Number(event.target.value), 1);
    else return;
    render();
  });
  document.querySelectorAll('[data-calendar-input]').forEach(input=>input.addEventListener('input',()=>input.setCustomValidity(input.value && !parse(input.value)?'请输入有效日期，格式为 YYYY-MM-DD':'')));
  document.addEventListener('keydown', event => {
    if(event.target.matches('[data-calendar-input]')&&(event.key==='Enter'||(event.altKey&&event.key==='ArrowDown'))){event.preventDefault();event.target.closest('.supplier-date-field').querySelector('[data-calendar-toggle]').click();return;}
    if (active && event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
  }, true);
  document.getElementById('editor')?.addEventListener('close', () => close());
})();
