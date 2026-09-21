// Gads kājenē
var yrEl = document.getElementById('yr');
if (yrEl) yrEl.textContent = new Date().getFullYear();

// Navigācija: caurspīdīga virs hero (tikai lapās, kur ir hero sadaļa)
var nav = document.getElementById('main-nav');
var hero = document.querySelector('.hero');

function updateNav() {
  if (hero && window.scrollY < window.innerHeight * 0.8) {
    nav.classList.add('over-hero');
  } else {
    nav.classList.remove('over-hero');
  }
}

if (hero) {
  updateNav();
  window.addEventListener('scroll', updateNav, { passive: true });
}

// Parādīšanās animācija ritinot
if ('IntersectionObserver' in window) {
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.sr').forEach(function (el) { obs.observe(el); });
}

// Mobilā izvēlne
var menuBtn = document.getElementById('mobile-menu-btn');
var navLinks = document.getElementById('nav-links');
if (menuBtn && navLinks) {
  menuBtn.addEventListener('click', function () { navLinks.classList.toggle('open'); });
  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () { navLinks.classList.remove('open'); });
  });
}

// Projekta modāls (tikai projekti.html)
var overlay = document.getElementById('proj-modal-overlay');
if (overlay) {
  var closeBtn = document.getElementById('proj-modal-close');

  document.querySelectorAll('.proj-card').forEach(function (card) {
    card.addEventListener('click', function () {
      document.getElementById('proj-modal-img').src = card.dataset.img;
      document.getElementById('proj-modal-img').alt = card.dataset.title;
      document.getElementById('proj-modal-cat').textContent = card.dataset.cat;
      document.getElementById('proj-modal-title').textContent = card.dataset.title;
      document.getElementById('proj-modal-desc').textContent = card.dataset.desc;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  });

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });
}

// Formas iesniegšana (tikai kontakts.html)
var form = document.getElementById('cf');
if (form) {
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var fs = document.getElementById('fs');
    var btn = document.getElementById('sbtn');
    var fil = document.getElementById('hfil').value;
    var col = document.getElementById('hcol').value;
    var name = document.getElementById('iname').value;
    var email = document.getElementById('iemail').value;
    var phone = document.getElementById('iphone').value;
    var link = document.getElementById('ilink').value;
    var msg = document.getElementById('imsg').value;
    var full = 'Avots: 3dpakalpojumi.lv\nFilaments: ' + fil + '\nKrāsa: ' + col + '\nTālrunis: ' + (phone || 'nav norādīts') + '\n3D modeļa saite: ' + (link || 'nav norādīta') + '\n\nProjekts:\n' + msg;

    btn.disabled = true;
    btn.textContent = 'Sūta...';

    try {
      var r = await fetch('https://shopforms.vercel.app/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email, message: full, form_identifier: 'manufacturing' })
      });
      if (r.ok) {
        fs.className = 'form-status ok';
        fs.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Paldies! Pieteikums nosūtīts. Atbildēsim 24h laikā.';
        form.reset();
      } else {
        throw new Error();
      }
    } catch (err) {
      fs.className = 'form-status err';
      fs.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg> Kļūda. Rakstiet tieši: razosana@bratus.lv';
    }

    btn.disabled = false;
    btn.innerHTML = 'Nosūtīt pieprasījumu <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
  });
}

// Vienmērīga ritināšana (enkuri šajā lapā)
document.querySelectorAll('a[href^="#"]').forEach(function (a) {
  a.addEventListener('click', function (e) {
    var t = document.querySelector(a.getAttribute('href'));
    if (t) {
      e.preventDefault();
      t.scrollIntoView({ behavior: 'smooth' });
    }
  });
});
