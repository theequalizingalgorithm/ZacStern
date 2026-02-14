// ===== MOBILE MENU =====
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger.addEventListener('click', () => {
    navMenu.classList.toggle('active');
});

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
    });
});

// ===== SMOOTH SCROLL & ACTIVE NAV =====
window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section');
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (pageYOffset >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});

// ===== VIDEO MODAL (iframe-based) =====
const modal = document.getElementById('videoModal');
const modalIframe = document.getElementById('modalIframe');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');

function openModal(fileId, isVertical) {
    modalIframe.src = 'https://drive.google.com/file/d/' + fileId + '/preview';
    modalContent.classList.remove('modal-vertical', 'modal-horizontal');
    modalContent.classList.add(isVertical ? 'modal-vertical' : 'modal-horizontal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.style.display = 'none';
    modalIframe.src = '';
    document.body.style.overflow = 'auto';
}

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', function(e) {
    if (e.target === modal) closeModal();
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
});

// ===== ADD EXPAND BUTTONS TO VIDEO CARDS =====
document.querySelectorAll('.video-card').forEach(function(card) {
    var btn = document.createElement('button');
    btn.className = 'expand-btn';
    btn.innerHTML = '<i class="fas fa-expand"></i>';
    btn.title = 'Fullscreen';
    card.appendChild(btn);

    var fileId = card.dataset.id;
    var isVertical = card.classList.contains('vertical');

    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openModal(fileId, isVertical);
    });
});

// ===== CONTACT FORM =====
var contactForm = document.getElementById('contactForm');
contactForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var name = contactForm.querySelector('input[type="text"]').value;
    var email = contactForm.querySelector('input[type="email"]').value;
    var message = contactForm.querySelector('textarea').value;
    var mailtoLink = 'mailto:sternzachary25@gmail.com?subject=Portfolio Inquiry from ' + encodeURIComponent(name) + '&body=' + encodeURIComponent(message) + '%0A%0AFrom: ' + encodeURIComponent(name) + '%0AEmail: ' + encodeURIComponent(email);
    window.location.href = mailtoLink;
    setTimeout(function() { contactForm.reset(); }, 500);
});

// ===== SCROLL REVEAL =====
var revealObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('.video-card, .reel-card, .project-card, .social-card, .contact-item').forEach(function(el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    revealObserver.observe(el);
});

console.log('Portfolio loaded.');
