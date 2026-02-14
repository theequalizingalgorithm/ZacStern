(function () {
    'use strict';

    // ===== MOBILE MENU =====
    var hamburger = document.querySelector('.hamburger');
    var navMenu = document.querySelector('.nav-menu');

    hamburger.addEventListener('click', function () {
        navMenu.classList.toggle('active');
    });

    document.querySelectorAll('.nav-link').forEach(function (link) {
        link.addEventListener('click', function () {
            navMenu.classList.remove('active');
        });
    });

    // ===== SMOOTH SCROLL & ACTIVE NAV =====
    window.addEventListener('scroll', function () {
        var sections = document.querySelectorAll('section');
        var current = '';
        sections.forEach(function (section) {
            var sectionTop = section.offsetTop;
            if (pageYOffset >= sectionTop - 200) {
                current = section.getAttribute('id');
            }
        });
        document.querySelectorAll('.nav-link').forEach(function (link) {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + current) {
                link.classList.add('active');
            }
        });
    });

    // ===== VIDEO MODAL =====
    var modal = document.getElementById('videoModal');
    var modalIframe = document.getElementById('modalIframe');
    var modalContent = document.getElementById('modalContent');
    var modalClose = document.getElementById('modalClose');

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
    modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeModal();
    });

    // ===== HELPERS =====
    function thumbUrl(fileId) {
        return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w640';
    }

    function createVideoCard(fileId, orientation) {
        var card = document.createElement('div');
        card.className = 'video-card ' + orientation;
        card.dataset.id = fileId;

        var img = document.createElement('img');
        img.className = 'thumb';
        img.src = thumbUrl(fileId);
        img.alt = 'Video thumbnail';
        img.loading = 'lazy';
        img.onerror = function () {
            // Replace with gradient placeholder on error
            var placeholder = document.createElement('div');
            placeholder.className = 'thumb-placeholder';
            placeholder.innerHTML = '<i class="fas fa-play"></i>';
            card.replaceChild(placeholder, img);
        };
        card.appendChild(img);

        // Play overlay
        var overlay = document.createElement('div');
        overlay.className = 'play-overlay';
        overlay.innerHTML = '<i class="fas fa-play-circle"></i>';
        card.appendChild(overlay);

        var isVertical = orientation === 'vertical';
        card.addEventListener('click', function () {
            openModal(fileId, isVertical);
        });

        return card;
    }

    // ===== RENDER FROM CONFIG =====
    fetch('config.json')
        .then(function (res) { return res.json(); })
        .then(function (config) {
            renderReels(config.videos.reels);
            renderFeaturedWork(config.featuredWork);
            renderUGC(config.videos.ugc);
            renderProjects(config.site.projects);
            renderSocial(config.site.socials);
            renderContactInfo(config.site);
            initScrollReveal();
        })
        .catch(function (err) {
            console.error('Failed to load config.json:', err);
            initScrollReveal();
        });

    // ===== REELS =====
    function renderReels(reels) {
        var container = document.getElementById('reelsContainer');
        reels.forEach(function (reel) {
            var card = document.createElement('div');
            card.className = 'reel-card';
            card.innerHTML =
                '<div class="reel-video">' +
                '<iframe src="https://drive.google.com/file/d/' + reel.fileId + '/preview" ' +
                'allowfullscreen loading="lazy"></iframe>' +
                '</div>' +
                '<h3>' + reel.title + '</h3>' +
                '<p>' + reel.description + '</p>';
            container.appendChild(card);
        });
    }

    // ===== FEATURED WORK =====
    function renderFeaturedWork(featured) {
        var container = document.getElementById('featuredContainer');

        // Social media performance block
        if (featured.socialMedia) {
            var sm = featured.socialMedia;
            var block = document.createElement('div');
            block.className = 'featured-block';
            var headerHtml =
                '<div class="featured-block-header">' +
                '<i class="fas fa-chart-line"></i>' +
                '<h3>' + sm.title + '</h3>' +
                '</div>' +
                '<p class="featured-block-desc">' + sm.description + '</p>';
            block.innerHTML = headerHtml;

            var grid = document.createElement('div');
            grid.className = 'featured-items';
            sm.items.forEach(function (item) {
                var el = document.createElement('div');
                el.className = 'featured-item';
                el.innerHTML = '<h4>' + item.title + '</h4>' +
                    (item.stats ? '<div class="stats"><i class="fas fa-eye"></i> ' + item.stats + '</div>' : '');
                grid.appendChild(el);
            });
            block.appendChild(grid);
            container.appendChild(block);
        }

        // AGT block
        if (featured.agt) {
            var agt = featured.agt;
            var agtBlock = document.createElement('div');
            agtBlock.className = 'featured-block';
            var agtHeader =
                '<div class="featured-block-header">' +
                '<i class="fas fa-star"></i>' +
                '<h3>' + agt.title + '</h3>' +
                '</div>' +
                '<p class="featured-block-desc">' + agt.description + '</p>';
            agtBlock.innerHTML = agtHeader;

            var agtGrid = document.createElement('div');
            agtGrid.className = 'featured-items';
            agt.items.forEach(function (item) {
                var el = document.createElement('div');
                el.className = 'featured-item';
                el.innerHTML = '<h4>' + item.title + '</h4>' +
                    (item.stats ? '<div class="stats"><i class="fas fa-eye"></i> ' + item.stats + '</div>' : '');
                agtGrid.appendChild(el);
            });
            agtBlock.appendChild(agtGrid);
            container.appendChild(agtBlock);
        }
    }

    // ===== UGC GRID =====
    function renderUGC(ugc) {
        var hGrid = document.getElementById('horizontalGrid');
        var vGrid = document.getElementById('verticalGrid');

        ugc.horizontal.forEach(function (id) {
            hGrid.appendChild(createVideoCard(id, 'horizontal'));
        });

        ugc.vertical.forEach(function (id) {
            vGrid.appendChild(createVideoCard(id, 'vertical'));
        });
    }

    // ===== PROJECTS =====
    function renderProjects(projects) {
        var grid = document.getElementById('projectsGrid');
        projects.forEach(function (proj) {
            var a = document.createElement('a');
            a.href = proj.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'project-card';
            a.innerHTML =
                '<div class="project-bg"><i class="fas ' + proj.icon + '"></i></div>' +
                '<h3>' + proj.name + '</h3>' +
                '<p>' + proj.description + '</p>' +
                '<span class="project-link">Visit <i class="fas fa-arrow-right"></i></span>';
            grid.appendChild(a);
        });
    }

    // ===== SOCIAL =====
    function renderSocial(socials) {
        var grid = document.getElementById('socialGrid');

        // Instagram
        var igCard = document.createElement('a');
        igCard.href = socials.instagram;
        igCard.target = '_blank';
        igCard.rel = 'noopener noreferrer';
        igCard.className = 'social-card';
        igCard.innerHTML =
            '<i class="fab fa-instagram"></i>' +
            '<h3>Instagram</h3>' +
            '<p>' + socials.instagramHandle + '</p>' +
            '<span class="follow-btn">Follow</span>';
        grid.appendChild(igCard);

        // Trend.io
        var trendCard = document.createElement('a');
        trendCard.href = socials.trend;
        trendCard.target = '_blank';
        trendCard.rel = 'noopener noreferrer';
        trendCard.className = 'social-card';
        trendCard.innerHTML =
            '<i class="fas fa-video"></i>' +
            '<h3>Trend</h3>' +
            '<p>Creator Profile</p>' +
            '<span class="follow-btn">View Profile</span>';
        grid.appendChild(trendCard);
    }

    // ===== CONTACT INFO =====
    function renderContactInfo(site) {
        var container = document.getElementById('contactInfo');
        container.innerHTML =
            '<div class="contact-item">' +
            '<i class="fas fa-envelope"></i>' +
            '<div><h3>Email</h3><a href="mailto:' + site.email + '">' + site.email + '</a></div>' +
            '</div>' +
            '<div class="contact-item">' +
            '<i class="fab fa-instagram"></i>' +
            '<div><h3>Instagram</h3><a href="' + site.socials.instagram + '" target="_blank">' + site.socials.instagramHandle + '</a></div>' +
            '</div>' +
            '<div class="contact-item">' +
            '<i class="fas fa-globe"></i>' +
            '<div><h3>Portfolio Sites</h3>' +
            '<div class="portfolio-links">' +
            site.projects.map(function (p) {
                return '<a href="' + p.url + '" target="_blank">' + p.name + '</a>';
            }).join('') +
            '</div></div>' +
            '</div>';
    }

    // ===== CONTACT FORM =====
    var contactForm = document.getElementById('contactForm');
    contactForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = contactForm.querySelector('input[type="text"]').value;
        var email = contactForm.querySelector('input[type="email"]').value;
        var message = contactForm.querySelector('textarea').value;
        var mailtoLink = 'mailto:sternzachary25@gmail.com?subject=Portfolio Inquiry from ' +
            encodeURIComponent(name) + '&body=' + encodeURIComponent(message) +
            '%0A%0AFrom: ' + encodeURIComponent(name) +
            '%0AEmail: ' + encodeURIComponent(email);
        window.location.href = mailtoLink;
        setTimeout(function () { contactForm.reset(); }, 500);
    });

    // ===== SCROLL REVEAL =====
    function initScrollReveal() {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

        var selectors = '.video-card, .reel-card, .project-card, .social-card, .contact-item, .featured-item';
        document.querySelectorAll(selectors).forEach(function (el) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            observer.observe(el);
        });
    }

    console.log('Portfolio loaded.');
})();
