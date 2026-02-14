// ===== MOBILE MENU =====
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger.addEventListener('click', () => {
    navMenu.classList.toggle('active');
});

// Close menu when a link is clicked
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
    });
});

// ===== SMOOTH SCROLL & ACTIVE NAV =====
let currentSection = 'hero';

window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section');
    let current = '';

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
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

// ===== VIDEO MODAL =====
const modal = document.getElementById('videoModal');
const modalVideo = document.getElementById('modalVideo');
const closeBtn = document.querySelector('.close');

function openVideoModal(videoSource) {
    modalVideo.src = videoSource;
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.style.display = 'none';
    modalVideo.pause();
    modalVideo.src = '';
    document.body.style.overflow = 'auto';
}

closeBtn.addEventListener('click', closeModal);

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.style.display === 'block') {
        closeModal();
    }
});

// ===== VIDEO GRID FUNCTIONALITY =====
// Sample video data - Replace with your actual video sources
const videoData = {
    vertical: [
        // { title: 'Video 1', src: 'path/to/video1.mp4' },
        // { title: 'Video 2', src: 'path/to/video2.mp4' },
        // Add your vertical videos here
    ],
    horizontal: [
        // { title: 'Video 1', src: 'path/to/video1.mp4' },
        // { title: 'Video 2', src: 'path/to/video2.mp4' },
        // Add your horizontal videos here
    ]
};

function loadVideoGrid() {
    const verticalGrid = document.getElementById('verticalGrid');
    const horizontalGrid = document.getElementById('horizontalGrid');

    // Clear existing placeholders if needed
    // verticalGrid.innerHTML = '';
    // horizontalGrid.innerHTML = '';

    // Load vertical videos
    videoData.vertical.forEach(video => {
        const videoCard = createVideoCard(video);
        verticalGrid.appendChild(videoCard);
    });

    // Load horizontal videos
    videoData.horizontal.forEach(video => {
        const videoCard = createVideoCard(video);
        horizontalGrid.appendChild(videoCard);
    });
}

function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
        <video class="video-thumbnail" preload="metadata">
            <source src="${video.src}" type="video/mp4">
        </video>
        <div class="video-overlay">
            <div class="play-button">
                <i class="fas fa-play"></i>
            </div>
        </div>
    `;

    card.addEventListener('click', () => {
        openVideoModal(video.src);
    });

    return card;
}

// Load videos when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadVideoGrid();
});

// ===== CONTACT FORM =====
const contactForm = document.getElementById('contactForm');

contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = new FormData(contactForm);
    const name = contactForm.querySelector('input[type="text"]').value;
    const email = contactForm.querySelector('input[type="email"]').value;
    const message = contactForm.querySelector('textarea').value;

    // Create mailto link with form data
    const mailtoLink = `mailto:sternzachary25@gmail.com?subject=Portfolio Inquiry from ${name}&body=${encodeURIComponent(message)}%0A%0AFrom: ${name}%0AEmail: ${email}`;

    // Open default email client
    window.location.href = mailtoLink;

    // Optionally, reset form
    setTimeout(() => {
        contactForm.reset();
    }, 500);
});

// ===== LAZY LOADING VIDEOS =====
if ('IntersectionObserver' in window) {
    const videoElements = document.querySelectorAll('video');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.play().catch(() => {
                    // Autoplay prevented by browser
                });
                observer.unobserve(entry.target);
            }
        });
    });

    videoElements.forEach(video => observer.observe(video));
}

// ===== ANIMATION ON SCROLL =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const animationObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeIn 0.6s ease forwards';
        }
    });
}, observerOptions);

document.querySelectorAll('.reel-card, .project-card, .social-card, .contact-item').forEach(el => {
    animationObserver.observe(el);
});

// ===== TYPEWRITER EFFECT (Optional for hero title) =====
function typewriterEffect(element, text, speed = 50) {
    let index = 0;
    element.textContent = '';

    function type() {
        if (index < text.length) {
            element.textContent += text.charAt(index);
            index++;
            setTimeout(type, speed);
        }
    }

    type();
}

// Uncomment if you want typewriter effect on hero title
// document.addEventListener('DOMContentLoaded', () => {
//     const heroTitle = document.querySelector('.hero-title .accent');
//     if (heroTitle) {
//         typewriterEffect(heroTitle, 'Producer', 50);
//     }
// });

// ===== SCROLL REVEAL ANIMATION =====
const revealElements = document.querySelectorAll('[data-reveal]');

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            revealObserver.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.15
});

revealElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    revealObserver.observe(el);
});

// ===== INSTAGRAM FEED INTEGRATION =====
// This requires Instagram Access Token
// You can use the Instagram Basic Display API
async function loadInstagramFeed() {
    try {
        const accessToken = 'YOUR_INSTAGRAM_ACCESS_TOKEN'; // Replace with your token
        const userId = '65810aa89f5be2618c0264d6';
        const feedContainer = document.getElementById('instafeed-container');

        if (accessToken === 'YOUR_INSTAGRAM_ACCESS_TOKEN') {
            // If no token is set, show instruction
            feedContainer.innerHTML = '<p class="feed-note">Instagram feed integration requires an access token. <a href="https://developers.instagram.com/docs/instagram-basic-display-api" target="_blank">Learn more</a></p>';
            return;
        }

        // Fetch recent media
        const response = await fetch(
            `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,timestamp&access_token=${accessToken}`
        );

        if (!response.ok) throw new Error('Failed to fetch Instagram data');

        const data = await response.json();

        if (data.data && data.data.length > 0) {
            feedContainer.innerHTML = '';
            data.data.slice(0, 6).forEach(post => {
                const postElement = document.createElement('div');
                postElement.className = 'instagram-post';
                postElement.innerHTML = `
                    <a href="https://instagram.com/p/${post.id}" target="_blank" rel="noopener noreferrer">
                        <img src="${post.media_url}" alt="${post.caption || 'Instagram post'}" />
                    </a>
                `;
                feedContainer.appendChild(postElement);
            });
        }
    } catch (error) {
        console.log('Instagram feed could not be loaded:', error);
    }
}

// Uncomment to load Instagram feed
// document.addEventListener('DOMContentLoaded', loadInstagramFeed);

// ===== CUSTOM CURSOR (Optional) =====
document.addEventListener('mousemove', (e) => {
    // Optional: Add custom cursor effects here
});

// ===== UTILITY FUNCTIONS =====
function getAspectRatio(videoElement) {
    return videoElement.videoWidth / videoElement.videoHeight;
}

function isVerticalVideo(videoElement) {
    return getAspectRatio(videoElement) < 1;
}

// ===== INITIALIZE =====
console.log('Portfolio website initialized successfully!');
console.log('To use the video grid, add your videos to the videoData object in script.js');
