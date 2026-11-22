"use strict";

(() => {
  const instanceKey = Symbol.for("secretSanta.snow");
  if (window[instanceKey]) return;

  const canvas = document.createElement("canvas");
  canvas.className = "festive-snow";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);

  const context = canvas.getContext("2d");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false;
  let suspended = false;
  let frame = 0;
  let previousTime = 0;
  let width = 0;
  let height = 0;
  let flakes = [];

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(64, Math.max(24, Math.round(width / 23)));
    flakes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 1 + Math.random() * 1.5,
      speed: 16 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function draw(time) {
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
    previousTime = time;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(241,238,232,0.48)";
    for (const flake of flakes) {
      flake.y += flake.speed * delta;
      flake.x += Math.sin(time / 3000 + flake.phase) * 5 * delta;
      if (flake.y > height + 4) {
        flake.y = -4;
        flake.x = Math.random() * width;
      }
      context.beginPath();
      context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      context.fill();
    }
    frame = requestAnimationFrame(draw);
  }

  function syncSnow() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    const visible = Boolean(context) && !disposed && !suspended &&
      !reducedMotion.matches && !document.hidden;
    canvas.hidden = !visible;
    if (visible) frame = requestAnimationFrame(draw);
  }

  function onPageHide(event) {
    if (!event.persisted) {
      dispose();
      return;
    }
    suspended = true;
    syncSnow();
  }

  function onPageShow() {
    suspended = false;
    syncSnow();
  }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", syncSnow);
    reducedMotion.removeEventListener("change", syncSnow);
    canvas.remove();
    delete window[instanceKey];
  }

  window[instanceKey] = { dispose };
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", syncSnow);
  reducedMotion.addEventListener("change", syncSnow);
  resize();
  syncSnow();
})();
