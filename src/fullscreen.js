// Full screen + iPhone Add-to-Home-Screen hint. Used by the menu, HUD and pause toggle.
const HINT = 'Tap Share, then Add to Home Screen, then open Sanctum of Ashes from your Home Screen for full screen';

export function isStandalone() {
  // Installed PWA / iOS Home Screen only. Do NOT treat the Fullscreen API
  // (which can make display-mode: fullscreen match) as "installed".
  try {
    if (window.navigator.standalone === true) return true;
    return matchMedia('(display-mode: standalone)').matches
      || (matchMedia('(display-mode: fullscreen)').matches && !isFullscreen());
  } catch { return false; }
}

export function hideHomeScreenHint() {
  return isStandalone();
}

export function isIPhone() {
  return /iPhone/i.test(navigator.userAgent) && !/iPad/i.test(navigator.userAgent);
}

export function canFullscreen() {
  if (isIPhone()) return false; // iPhone Safari has no Fullscreen API
  const el = document.documentElement;
  return typeof (el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen) === 'function';
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

async function lockLandscape() {
  try { await screen.orientation?.lock('landscape'); } catch {}
}

export async function enterFullscreen() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else if (el.webkitRequestFullScreen) el.webkitRequestFullScreen();
  } catch {}
  await lockLandscape();
}

export async function exitFullscreen() {
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch {}
  try { screen.orientation?.unlock(); } catch {}
}

export async function toggleFullscreen() {
  if (isFullscreen()) await exitFullscreen();
  else await enterFullscreen();
}

function $(id) { return document.getElementById(id); }

function syncButtons() {
  const standalone = isStandalone();
  const fs = isFullscreen();
  const api = canFullscreen();
  document.body.classList.toggle('standalone', standalone);
  document.body.classList.toggle('is-fullscreen', fs);
  const label = fs ? 'Exit full screen' : 'Full screen';
  const compact = fs ? '✕' : '⛶';
  for (const id of ['fs-btn-menu', 'fs-btn-pause']) {
    const b = $(id); if (!b) continue;
    b.hidden = standalone;
    b.textContent = label;
    b.setAttribute('aria-pressed', fs ? 'true' : 'false');
  }
  const hud = $('fs-btn-hud');
  if (hud) {
    hud.hidden = standalone;
    hud.textContent = compact;
    hud.setAttribute('aria-label', label);
    hud.setAttribute('aria-pressed', fs ? 'true' : 'false');
  }
  const hint = $('fs-hint');
  if (hint && (standalone || fs)) hint.classList.add('hidden');
}

function showHint() {
  if (isStandalone()) return;
  const hint = $('fs-hint');
  if (!hint) return;
  const body = hint.querySelector('.fs-hint-text');
  if (body) body.textContent = HINT;
  hint.classList.remove('hidden');
}

function hideHint() { $('fs-hint')?.classList.add('hidden'); }

async function onToggle(e) {
  e?.preventDefault();
  if (isStandalone()) return;
  if (canFullscreen()) {
    await toggleFullscreen();
    syncButtons();
    return;
  }
  showHint();
}

export function initFullscreen() {
  for (const id of ['fs-btn-menu', 'fs-btn-hud', 'fs-btn-pause']) {
    $(id)?.addEventListener('click', onToggle);
  }
  $('fs-hint-close')?.addEventListener('click', hideHint);
  $('fs-hint')?.addEventListener('click', ev => { if (ev.target.id === 'fs-hint') hideHint(); });
  document.addEventListener('fullscreenchange', () => { syncButtons(); window.dispatchEvent(new Event('resize')); });
  document.addEventListener('webkitfullscreenchange', () => { syncButtons(); window.dispatchEvent(new Event('resize')); });
  if (isStandalone()) lockLandscape();
  syncButtons();
  window.__soaFs = { canFullscreen, isStandalone, isFullscreen, isIPhone, enterFullscreen, exitFullscreen, toggleFullscreen, showHint, hideHint, HINT };
}

export { HINT };
