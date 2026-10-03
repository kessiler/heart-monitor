import { t } from './i18n.js';

const steps = ['observe', 'extract', 'analyze'];
const sourceNames = ['Camera', 'Demo', 'Video'];
let mountedPresentation;

function stateFor(status) {
  if (status === 'runtime.loading') return 'loading';
  if (status === 'runtime.cameraRequest' || status === 'runtime.videoLoading') return 'pending';
  if (status === 'runtime.selecting') return 'selecting';
  if (status === 'runtime.warming') return 'warming';
  if (status === 'runtime.tracking') return 'tracking';
  if (status === 'runtime.weak') return 'weak';
  if (status === 'runtime.stalled') return 'stalled';
  if (status === 'runtime.stopped') return 'stopped';
  if (/Denied|Missing|Busy|Unavailable|Error/.test(status)) return 'error';
  return 'ready';
}

/** Decorative presentation only. The host supplies session state; processing is untouched. */
export function initPresentation() {
  if (typeof document === 'undefined') return { setExperimentState() {}, destroy() {} };
  mountedPresentation?.destroy();
  const surfaces = [...document.querySelectorAll('[data-motion-surface]')];
  const illustrations = [...document.querySelectorAll('[data-process-illustration]')];
  const buttons = [...document.querySelectorAll('[data-process-step]')];
  const motionButtons = [...document.querySelectorAll('[data-motion-toggle]')];
  const lab = document.getElementById('lab-panel');
  const stateLabel = document.getElementById('session-state-label');
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const visibility = new Map();
  const disposers = [];
  let step = 'observe';
  let manuallyPaused = false;
  let destroyed = false;
  let experiment = { source: '', active: false, status: 'runtime.ready' };

  function listen(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    disposers.push(() => target.removeEventListener(event, handler));
  }

  function renderMotion() {
    const reduced = Boolean(media?.matches);
    const paused = manuallyPaused || reduced;
    for (const surface of surfaces) {
      const offscreen = visibility.get(surface) === false;
      const stop = paused || document.hidden || offscreen;
      surface.classList.toggle('motion-paused', stop);
      surface.dataset.motionState = reduced ? 'reduced' : manuallyPaused ? 'paused'
        : document.hidden ? 'hidden' : offscreen ? 'offscreen' : 'running';
    }
    for (const motionButton of motionButtons) {
      const key = reduced ? 'motion.reducedLabel' : paused ? 'motion.resumeLabel' : 'motion.pauseLabel';
      motionButton.disabled = reduced;
      motionButton.setAttribute('aria-pressed', String(paused));
      const accessibleKey = reduced ? 'motion.reducedLabel' : 'motion.toggleLabel';
      motionButton.setAttribute('aria-label', t(accessibleKey));
      motionButton.setAttribute('title', t(key));
      motionButton.dataset.i18nAriaLabel = accessibleKey;
      const motionLabel = motionButton.querySelector('[data-motion-label]');
      if (motionLabel) {
        const labelKey = reduced ? 'motion.reduced' : paused ? 'motion.resume' : 'motion.pause';
        motionLabel.dataset.i18n = labelKey;
        motionLabel.textContent = t(labelKey);
      }
    }
  }

  function renderStep() {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.processStep === step)));
    illustrations.forEach(illustration => { illustration.dataset.step = step; });
    const title = document.getElementById('process-detail-title');
    const description = document.getElementById('process-detail-description');
    const caption = document.getElementById('diagram-caption');
    const index = document.getElementById('process-detail-index');
    if (title) { title.dataset.i18n = `process.${step}Title`; title.textContent = t(title.dataset.i18n); }
    if (description) { description.dataset.i18n = `process.${step}Body`; description.textContent = t(description.dataset.i18n); }
    if (caption) { caption.dataset.i18n = `process.${step}Caption`; caption.textContent = t(caption.dataset.i18n); }
    if (index) index.textContent = `0${steps.indexOf(step) + 1}`;
  }

  function selectStep(nextStep, focus = false) {
    if (!steps.includes(nextStep)) return;
    step = nextStep;
    renderStep();
    if (focus) buttons.find(button => button.dataset.processStep === step)?.focus();
    window.dispatchEvent(new CustomEvent('processstepchange', { detail: { step } }));
  }

  for (const button of buttons) {
    listen(button, 'click', () => selectStep(button.dataset.processStep));
    listen(button, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = steps.indexOf(button.dataset.processStep);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? steps.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + steps.length) % steps.length;
      selectStep(steps[next], true);
    });
  }

  function setExperimentState(values = {}) {
    if (destroyed) return;
    experiment = { ...experiment, ...values };
    const source = sourceNames.includes(experiment.source) ? experiment.source : '';
    const state = stateFor(String(experiment.status));
    if (lab) { lab.dataset.state = state; lab.dataset.source = source; }
    document.getElementById('start-camera')?.setAttribute('aria-pressed', String(experiment.active && source === 'Camera'));
    document.getElementById('start-demo')?.setAttribute('aria-pressed', String(experiment.active && source === 'Demo'));
    document.querySelector('.upload-label')?.classList.toggle('is-active', Boolean(experiment.active && source === 'Video'));
    if (stateLabel) {
      const key = `presentation.state${state[0].toUpperCase()}${state.slice(1)}`;
      stateLabel.dataset.i18n = key;
      stateLabel.textContent = t(key);
    }
  }

  motionButtons.forEach(button => listen(button, 'click', () => { manuallyPaused = !manuallyPaused; renderMotion(); }));
  listen(document, 'visibilitychange', renderMotion);
  listen(window, 'localechange', () => { renderStep(); renderMotion(); setExperimentState(); });
  if (media?.addEventListener) listen(media, 'change', renderMotion);
  else if (media?.addListener) {
    media.addListener(renderMotion);
    disposers.push(() => media.removeListener(renderMotion));
  }

  let observer;
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => visibility.set(entry.target, entry.isIntersecting));
      renderMotion();
    }, { threshold: 0.01 });
    for (const surface of surfaces) {
      const rect = surface.getBoundingClientRect();
      visibility.set(surface, rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth);
      observer.observe(surface);
    }
  } else {
    const checkVisibility = () => {
      for (const surface of surfaces) {
        const rect = surface.getBoundingClientRect();
        visibility.set(surface, rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth);
      }
      renderMotion();
    };
    listen(window, 'scroll', checkVisibility);
    listen(window, 'resize', checkVisibility);
    checkVisibility();
  }

  renderStep(); renderMotion(); setExperimentState();
  const api = {
    setExperimentState,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      disposers.forEach(dispose => dispose());
      surfaces.forEach(surface => { surface.classList.add('motion-paused'); surface.dataset.motionState = 'paused'; });
      if (mountedPresentation === api) mountedPresentation = undefined;
    },
  };
  mountedPresentation = api;
  return api;
}
