// ============================================================
// SECTIONS.JS — Section Overlay Manager
// Controls HTML panel visibility, navigation arrows, transitions
// ============================================================

export class SectionManager {
    constructor(sectionData) {
        this.sections = sectionData; // [{id, name, pathT, color}, ...]
        this.panels = new Map();
        this.activeSectionId = null;
        this.prevSectionId = null;
        this.navArrows = { prev: null, next: null };
        this.transitionDuration = 400; // ms

        this._initPanels();
        this._initNavArrows();
    }

    _initPanels() {
        // Find all section panels in the DOM
        for (let i = 0; i < this.sections.length; i++) {
            const section = this.sections[i];
            const panel = document.querySelector(`.section-panel[data-section="${section.id}"]`);
            if (panel) {
                this.panels.set(section.id, panel);
                // Billboard side: even index = right, odd = left (matches scene.js)
                if (section.id !== 'hero') {
                    panel.classList.add(i % 2 === 0 ? 'panel-right' : 'panel-left');
                }
                // Start all hidden except hero
                if (section.id === 'hero') {
                    panel.classList.add('active');
                } else {
                    panel.classList.remove('active');
                }
            }
        }
    }

    _initNavArrows() {
        this.navArrows.prev = document.getElementById('navPrev');
        this.navArrows.next = document.getElementById('navNext');

        if (this.navArrows.prev) {
            this.navArrows.prev.addEventListener('click', () => {
                if (this.onNavigate) this.onNavigate('prev');
            });
        }
        if (this.navArrows.next) {
            this.navArrows.next.addEventListener('click', () => {
                if (this.onNavigate) this.onNavigate('next');
            });
        }
    }

    // Set navigation callback
    setNavigateCallback(cb) {
        this.onNavigate = cb;
    }

    // Update which section is active based on camera position
    updateActiveSection(sectionId, cameraController) {
        if (sectionId === this.activeSectionId) return;

        const prevId = this.activeSectionId;
        this.activeSectionId = sectionId;

        // Hide previous section
        if (prevId && this.panels.has(prevId)) {
            const prevPanel = this.panels.get(prevId);
            prevPanel.classList.remove('active');
            prevPanel.classList.add('exiting');
            // Clear ALL billboard-projection inline styles
            prevPanel.style.cssText = '';
            const prevInner = prevPanel.querySelector('.panel-inner');
            if (prevInner) { prevInner.style.cssText = ''; prevInner.classList.remove('billboard-active'); }
            const prevScroll = prevPanel.querySelector('.panel-scrollable');
            if (prevScroll) prevScroll.style.cssText = '';
            setTimeout(() => {
                prevPanel.classList.remove('exiting');
            }, this.transitionDuration);
        }

        // Show new section
        if (sectionId && this.panels.has(sectionId)) {
            const panel = this.panels.get(sectionId);
            panel.classList.add('active');
            panel.classList.remove('exiting');
        }

        // Update navigation arrows
        this._updateNavArrows(cameraController);
    }

    // Show transitional state (between sections)
    showTransition() {
        if (this.activeSectionId && this.panels.has(this.activeSectionId)) {
            // Fade out current section when moving between
            const panel = this.panels.get(this.activeSectionId);
            panel.classList.remove('active');
            panel.classList.add('exiting');
            // Clear ALL billboard-projection inline styles
            panel.style.cssText = '';
            const inner = panel.querySelector('.panel-inner');
            if (inner) { inner.style.cssText = ''; inner.classList.remove('billboard-active'); }
            const scroll = panel.querySelector('.panel-scrollable');
            if (scroll) scroll.style.cssText = '';
            setTimeout(() => {
                panel.classList.remove('exiting');
            }, this.transitionDuration);
        }
        this.activeSectionId = null;
    }

    _updateNavArrows(cameraController) {
        if (!cameraController) return;

        const navInfo = cameraController.getNavDirection();
        const currentIdx = cameraController.activeSectionIndex;

        // Update prev arrow
        if (this.navArrows.prev) {
            if (navInfo.hasPrev) {
                this.navArrows.prev.style.opacity = '1';
                this.navArrows.prev.style.pointerEvents = 'auto';
                this.navArrows.prev.title = this.sections[currentIdx - 1]?.name || 'Previous';
            } else {
                this.navArrows.prev.style.opacity = '0.3';
                this.navArrows.prev.style.pointerEvents = 'none';
            }
        }

        // Update next arrow
        if (this.navArrows.next) {
            if (navInfo.hasNext) {
                this.navArrows.next.style.opacity = '1';
                this.navArrows.next.style.pointerEvents = 'auto';
                this.navArrows.next.title = this.sections[currentIdx + 1]?.name || 'Next';
            } else {
                this.navArrows.next.style.opacity = '0.3';
                this.navArrows.next.style.pointerEvents = 'none';
            }
        }

        // Update section label
        const sectionLabel = document.getElementById('sectionLabel');
        if (sectionLabel) {
            if (this.activeSectionId) {
                const section = this.sections.find(s => s.id === this.activeSectionId);
                sectionLabel.textContent = section ? section.name : '';
                sectionLabel.style.opacity = '1';
            } else {
                sectionLabel.style.opacity = '0';
            }
        }
    }

    // Get section index by ID
    getSectionIndex(id) {
        return this.sections.findIndex(s => s.id === id);
    }

    // Scroll the document to match a section's pathT (for sync)
    syncScrollToSection(pathT) {
        const scrollHeight = document.getElementById('scrollSpacer')?.offsetHeight || 0;
        const maxScroll = scrollHeight - window.innerHeight;
        window.scrollTo({
            top: pathT * maxScroll,
            behavior: 'smooth'
        });
    }
}
