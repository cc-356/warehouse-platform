(() => {
  'use strict';
  const links = [...document.querySelectorAll('.tabs a')];
  const sections = links.map(link => ({
    id: link.getAttribute('href').slice(1),
    link,
    element: document.getElementById(link.getAttribute('href').slice(1))
  })).filter(section => section.element);
  let preferred = location.hash.slice(1);
  let queued = false;

  function highlight(id) {
    sections.forEach(section => {
      const active = section.id === id;
      section.link.classList.toggle('active', active);
      if (active) section.link.setAttribute('aria-current', 'location');
      else section.link.removeAttribute('aria-current');
    });
  }

  function update() {
    queued = false;
    if (!sections.length) return;
    // The upper third of the viewport determines which section is being read.
    const readingLine = Math.min(window.innerHeight * 0.3, 220);
    const positions = sections.map(section => ({
      ...section, top: (section.id === 'library' && getComputedStyle(section.element).position === 'sticky'
        ? section.element.parentElement : section.element).getBoundingClientRect().top
    }));
    let current = positions[0];
    const reached = positions.filter(section => section.top <= readingLine);
    if (reached.length) {
      const nearestTop = Math.max(...reached.map(section => section.top));
      const group = reached.filter(section => Math.abs(section.top - nearestTop) < 2);
      // Side-by-side panels share a vertical position. Keep the user's selection.
      current = group.find(section => section.id === preferred) || group[0];
    }
    const bottom = document.documentElement.scrollHeight - window.innerHeight;
    if (bottom > 0 && window.scrollY > 0 && window.scrollY >= bottom - 2) {
      current = positions[positions.length - 1];
    }
    highlight(current.id);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }

  links.forEach(link => link.addEventListener('click', () => {
    preferred = link.getAttribute('href').slice(1);
    schedule();
  }));
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', () => {
    preferred = location.hash.slice(1);
    schedule();
  });
  window.addEventListener('pageshow', schedule);
  // Imports, profiles, and match results can change section positions.
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(schedule);
    sections.forEach(section => observer.observe(section.element));
  }
  update();
})();
