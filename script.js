const reels = [
  {
    title: 'Producing Reel',
    description: 'A curated look at production work and campaign execution.',
    fileId: '1jBcteaSi96mM2VjfpJpW9XoqKS-4kU6e',
    orientation: 'horizontal',
  },
  {
    title: 'Directing Reel',
    description: 'Direction-focused cuts with cinematic framing and pacing.',
    fileId: '1p9dzJDjNvzzGFV_vJ7CgKrsDnh4nLNkK',
    orientation: 'horizontal',
  },
];

const ugcVideos = [
  {
    title: 'UGC Producing Cut',
    description: 'Performance-driven cut for ads and social campaigns.',
    fileId: '1jBcteaSi96mM2VjfpJpW9XoqKS-4kU6e',
    orientation: 'horizontal',
  },
  {
    title: 'UGC Directing Cut',
    description: 'Narrative-led edit with premium visual tone.',
    fileId: '1p9dzJDjNvzzGFV_vJ7CgKrsDnh4nLNkK',
    orientation: 'horizontal',
  },
];

const reelGrid = document.getElementById('reel-grid');
const ugcVerticalGrid = document.getElementById('ugc-vertical-grid');
const ugcHorizontalGrid = document.getElementById('ugc-horizontal-grid');

const modal = document.getElementById('video-modal');
const modalPlayer = document.getElementById('modal-player');
const closeModal = document.getElementById('close-modal');

function createVideoCard(video, mode = 'preview') {
  const card = document.createElement('article');
  card.className = 'video-card';

  const embedUrl = `https://drive.google.com/file/d/${video.fileId}/preview`;
  const viewUrl = `https://drive.google.com/file/d/${video.fileId}/view`;

  if (video.orientation === 'vertical') {
    card.classList.add('vertical-card');
  }

  if (mode === 'modal') {
    card.classList.add('ugc-clickable');
    card.innerHTML = `
      <button class="video-trigger" type="button" aria-label="Play ${video.title}">
        <iframe
          src="${embedUrl}"
          title="${video.title}"
          loading="lazy"
          allow="autoplay"
          referrerpolicy="no-referrer"
        ></iframe>
      </button>
      <h3>${video.title}</h3>
      <p>${video.description}</p>
      <a class="text-link" href="${viewUrl}" target="_blank" rel="noopener noreferrer">Open in Drive ↗</a>
    `;

    const trigger = card.querySelector('.video-trigger');
    trigger.addEventListener('click', () => {
      modalPlayer.src = `${embedUrl}?autoplay=1`;
      modal.showModal();
    });
  } else {
    card.innerHTML = `
      <iframe
        src="${embedUrl}"
        title="${video.title}"
        loading="lazy"
        allow="autoplay"
        referrerpolicy="no-referrer"
        allowfullscreen
      ></iframe>
      <h3>${video.title}</h3>
      <p>${video.description}</p>
      <a class="text-link" href="${viewUrl}" target="_blank" rel="noopener noreferrer">Open in Drive ↗</a>
    `;
  }

  return card;
}

for (const reel of reels) {
  reelGrid.appendChild(createVideoCard(reel));
}

for (const ugcVideo of ugcVideos) {
  const card = createVideoCard(ugcVideo, 'modal');

  if (ugcVideo.orientation === 'vertical') {
    ugcVerticalGrid.appendChild(card);
  } else {
    ugcHorizontalGrid.appendChild(card);
  }
}

closeModal.addEventListener('click', () => {
  modal.close();
});

modal.addEventListener('close', () => {
  modalPlayer.src = '';
});

modal.addEventListener('click', (event) => {
  const box = modal.getBoundingClientRect();
  const outsideDialog =
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom;

  if (outsideDialog) {
    modal.close();
  }
});

const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');

menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!expanded));
  nav.classList.toggle('open');
});
