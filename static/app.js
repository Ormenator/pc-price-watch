function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("ppw-theme", theme); } catch (e) { /* ignore */ }
  drawChart();
}

function chartColors() {
  const light = currentTheme() === "light";
  return {
    line: light ? "#ff5a36" : "#ff7a59",
    fill: light ? "rgba(255, 90, 54, 0.16)" : "rgba(255, 122, 89, 0.18)",
    tick: light ? "#8a5344" : "#f0c9b0",
    grid: light ? "rgba(240, 201, 160, 0.45)" : "rgba(90, 56, 100, 0.6)",
  };
}

function drawChart() {
  const data = window.PRICE_CHART;
  const canvas = document.getElementById("price-chart");
  if (!data || !canvas || !window.Chart) return;
  const colors = chartColors();
  const labels = data.labels.length ? data.labels : ["Now"];
  const series = data.series.length ? data.series : [];
  if (window.__ppwChart) window.__ppwChart.destroy();
  window.__ppwChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: series,
        borderColor: colors.line,
        backgroundColor: colors.fill,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: colors.line,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: colors.tick }, grid: { color: colors.grid } },
        y: { ticks: { color: colors.tick }, grid: { color: colors.grid } },
      },
    },
  });
}

function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    setTheme(currentTheme() === "dark" ? "light" : "dark");
  });
}

function setupCursorGlow() {
  const glow = document.querySelector(".cursor-glow");
  if (!glow) return;
  window.addEventListener("pointermove", (event) => {
    glow.style.left = `${event.clientX}px`;
    glow.style.top = `${event.clientY}px`;
  });
}

function setupTilt() {
  document.querySelectorAll("[data-tilt]").forEach((el) => {
    el.addEventListener("pointermove", (event) => {
      const box = el.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      el.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
    });
  });
}

function setupSuggestions() {
  const form = document.querySelector("[data-suggest]");
  const box = form && form.querySelector(".suggest");
  const input = document.getElementById("global-search");
  const raw = document.getElementById("part-suggestions");
  if (!form || !box || !input || !raw) return;
  let items = [];
  try { items = JSON.parse(raw.textContent || "[]"); } catch (e) { items = []; }

  function render(list) {
    if (!list.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = list.map((item) => (
      `<button type="button" data-q="${item.query.replace(/"/g, "&quot;")}">${item.query} <span class="muted">· ${item.mood}</span></button>`
    )).join("");
  }

  input.addEventListener("focus", () => render(items.slice(0, 6)));
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    const list = items.filter((item) => (
      item.query.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    )).slice(0, 6);
    render(q ? list : items.slice(0, 6));
  });
  box.addEventListener("click", (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    input.value = btn.getAttribute("data-q") || "";
    form.submit();
  });
  document.addEventListener("click", (event) => {
    if (!form.contains(event.target)) box.hidden = true;
  });
}

function setupFilters() {
  const chips = document.querySelector("[data-filter-chips]");
  if (!chips) return;
  chips.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-filter]");
    if (!chip) return;
    chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-on", c === chip));
    const filter = chip.getAttribute("data-filter");
    document.querySelectorAll(".card[data-category]").forEach((card) => {
      card.hidden = filter !== "all" && card.getAttribute("data-category") !== filter;
    });
  });
}

function setupWatchFilters() {
  document.querySelectorAll("[data-watch-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-watch-filter]").forEach((c) => c.classList.toggle("is-on", c === chip));
      const filter = chip.getAttribute("data-watch-filter");
      document.querySelectorAll(".card[data-status]").forEach((card) => {
        const status = card.getAttribute("data-status");
        const cheap = status === "good" || status === "lowest";
        if (filter === "all") card.hidden = false;
        else if (filter === "good") card.hidden = !cheap;
        else card.hidden = status !== filter;
      });
    });
  });
}

function setupSteps() {
  const steps = document.querySelectorAll("[data-step]");
  steps.forEach((step) => {
    step.addEventListener("click", () => {
      steps.forEach((s) => s.classList.toggle("is-on", s === step));
    });
  });
}

function setupTarget() {
  const input = document.querySelector("[data-live-target]");
  const live = document.querySelector("[data-target-live]");
  if (!input || !live) return;
  const update = () => {
    const value = input.value.trim();
    live.textContent = value
      ? `We’ll tap you if it drops to ${value} or below.`
      : "Leave blank to only hear about new lows.";
  };
  input.addEventListener("input", update);
  document.querySelectorAll(".stepper").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number(btn.getAttribute("data-step") || 0);
      const current = Number(input.value || 0);
      input.value = Math.max(0, current + delta);
      update();
    });
  });
}

function setupCompare() {
  const root = document.querySelector("[data-compare]");
  const out = document.querySelector("[data-compare-out]");
  if (!root || !out) return;
  root.addEventListener("change", () => {
    const picked = [...root.querySelectorAll("[data-compare-item]:checked")].map((box) => {
      const card = box.closest(".offer");
      card.classList.toggle("is-picked", true);
      return Number(card.getAttribute("data-price"));
    });
    root.querySelectorAll(".offer").forEach((card) => {
      const on = card.querySelector("[data-compare-item]").checked;
      card.classList.toggle("is-picked", on);
    });
    if (!picked.length) {
      out.textContent = "Tick a few to compare.";
      return;
    }
    const low = Math.min(...picked);
    out.textContent = `Among the ${picked.length} you ticked, cheapest is ${low.toFixed(2)}.`;
  });
}

function setupDismiss() {
  document.querySelectorAll("[data-dismiss-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest("[data-dismiss]");
      if (!card) return;
      card.classList.add("is-away");
      setTimeout(() => card.remove(), 280);
    });
  });
}

function setupReveal() {
  document.querySelectorAll("[data-reveal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.previousElementSibling;
      if (!input) return;
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      btn.textContent = hidden ? "Hide" : "Show";
    });
  });
}

function setupBusyButtons() {
  document.querySelectorAll("[data-busy]").forEach((btn) => {
    btn.closest("form")?.addEventListener("submit", () => {
      btn.disabled = true;
      btn.textContent = btn.getAttribute("data-busy") || "Working…";
    });
  });
}

function setupScroll() {
  document.querySelectorAll("[data-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.querySelector(btn.getAttribute("data-scroll"));
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function setupStats() {
  document.querySelectorAll("[data-stat]").forEach((stat) => {
    stat.addEventListener("click", () => {
      document.querySelectorAll("[data-stat]").forEach((s) => s.classList.toggle("is-on", s === stat));
    });
  });
}

async function maybeNotify() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupThemeToggle();
  setupCursorGlow();
  setupTilt();
  setupSuggestions();
  setupFilters();
  setupWatchFilters();
  setupSteps();
  setupTarget();
  setupCompare();
  setupDismiss();
  setupReveal();
  setupBusyButtons();
  setupScroll();
  setupStats();
  drawChart();
  maybeNotify();
});
