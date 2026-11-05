<script setup>
/*
  The museum behind the whole site (the 3D scene is museum/scene.js, the rooms museum/plan.js).
  One building, a wing per page in the order of the menu. It stays on screen behind every page;
  each page marks with a .walk-gap where you walk to its next room, and the section right after
  the gap is what comes up over the view when you arrive:
  - an analysis (it has a poster): the painting lifts off the wall and flies to exactly where
    the poster's picture sits; the poster takes over, its shading comes down, the card appears
    round it and the words arrive one after another;
  - any other section: it comes up on its card as you face the painting.
  Changing page walks you through the door into the next wing, or, for a jump across the
  building, fades across. If WebGL is not available the gaps close and the pages read as before.
*/
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { ROOMS, WING_START, WINGS, ORDER } from "../../museum/plan.js";
import { museum as state } from "../../museum/state.js";

const route = useRoute();
const host = ref(null);
const veil = ref(null);
const fade = ref(null);
const flyer = ref(null);
const flyImg = ref(null);
let museum = null;
let frame = 0;
/* the words of each poster, in the order they arrive */
const TEXT = ".work-poster-top, .work-poster-title, .work-poster-orig, .work-poster-lens, .work-poster-hook, .work-poster-bottom";
/* how far into a wing's first room you stand at the top of its page: just through the door */
const ENTRY = 0.45;
/* walking through the door to the next wing, after a page change */
const TRAVEL_MS = 1600;
/* a section fades out as its bottom edge rises through this share of the screen below the nav */
const LEAVE = 0.3;

/* this page's wing and the next one: what gets loaded while you read */
function preloadWing(name) {
  if (!(name in WING_START)) name = ORDER[0]; // from Home, the first wing is next
  const at = WING_START[name];
  const next = ORDER[ORDER.indexOf(name) + 1];
  museum.preload(at - 1, at + (WINGS[name]?.length || 1) + (next ? WINGS[next].length : 0));
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);
const mix = (a, b, e) => a + (b - a) * e;
const mixRect = (a, b, e) => ({ x: mix(a.x, b.x, e), y: mix(a.y, b.y, e), w: mix(a.w, b.w, e), h: mix(a.h, b.h, e) });

/* the flight in progress: which room, where it lands (picture and frame, in the museum's own
   pixels), how far it has flown (e) and how opaque it is */
let flight = null;
let lifted = -1;
let navH = 0;
let rest = 0; // where a section comes to rest: a little below the nav
let here = 0; // the room you are in (or last walked into)
let travel = null; // { k, start }: walking through the door into room k
let pumpUntil = 0; // keep updating every frame until then (a new page settling in)

/* write a style only when it changes: most scroll steps touch nothing */
function put(el, prop, value) {
  const c = el._put || (el._put = {});
  if (c[prop] === value) return;
  c[prop] = value;
  if (prop[0] === "-") el.style.setProperty(prop, value);
  else el.style[prop] = value;
}

/* where an <img> with object-fit: cover draws its picture, given its box */
function coverRect(b, nw, nh, [px, py]) {
  const s = Math.max(b.width / nw, b.height / nh);
  const w = nw * s, h = nh * s;
  return { x: b.left + (b.width - w) * px, y: b.top + (b.height - h) * py, w, h };
}

/* put the flying picture where it belongs: on every scroll step and after every 3D frame.
   It only reads the 3D camera, never the page, so it costs no layout */
function placeFlyer() {
  const el = flyer.value, img = flyImg.value;
  if (!el) return;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  const from = flight && museum && museum.artRect(flight.k);
  if (!flight || !from || !nw || !img.complete) {
    put(el, "visibility", "hidden");
    return;
  }
  const { pic, box, e, fade: f, W, H } = flight;
  const p = mixRect(from, pic, e), c = mixRect(from, box, e);
  /* only transforms, which the GPU moves without repainting: the frame is a W x H box scaled down
     to the frame's rectangle (it clips the picture), and the picture inside is scaled back up by
     as much, so it lands where it should */
  const sx = Math.max(c.w, 1) / W, sy = Math.max(c.h, 1) / H;
  put(el, "transform", `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0) scale(${sx.toFixed(5)}, ${sy.toFixed(5)})`);
  put(el, "borderRadius", `${((flight.radius * e) / sx).toFixed(1)}px / ${((flight.radius * e) / sy).toFixed(1)}px`);
  put(img, "transform", `translate3d(${((p.x - c.x) / sx).toFixed(1)}px, ${((p.y - c.y) / sy).toFixed(1)}px, 0) scale(${(p.w / nw / sx).toFixed(5)}, ${(p.h / nh / sy).toFixed(5)})`);
  put(el, "opacity", f.toFixed(2));
  put(el, "visibility", "visible");
}

function update(now = performance.now()) {
  frame = 0;
  if (!museum || !(route.name in WING_START)) return; // (Home is a plain page: no museum)
  const vh = window.innerHeight;
  const start = WING_START[route.name];
  const gaps = [...document.querySelectorAll(".panel .walk-gap")];
  const stops = gaps.map((g) => g.nextElementSibling).filter(Boolean);

  /* ---- read everything first ---- */
  /* which walk is under way on this page: the last gap that has started, and how far through */
  stops.forEach((el) => {
    if (el._h !== undefined) return; // measured once (and again on resize)
    const p = el._poster !== undefined ? el._poster : (el._poster = el.querySelector(".work-poster"));
    el._lift = p ? p.offsetTop : 0;
    el._h = p ? p.offsetHeight : el.offsetHeight;
    /* it comes to rest centred in the screen below the nav if it fits, else just below the nav;
       it is held there for the last (vh - stop) of its walk */
    el._stop = Math.max(rest, navH + (vh - navH - el._h) / 2) - el._lift;
    /* nothing is held any more: the section rises with the page; its arrival plays as it rises */
    el._hold = 0;
    const walk = el.parentElement;
    walk.style.setProperty("--stop", el._stop.toFixed(0) + "px");
    walk.style.setProperty("--hold", el._hold.toFixed(0) + "px");
  });
  let k = -1, t = 0;
  gaps.forEach((gap, i) => {
    /* the walk starts only once the section before has gone up past the nav, and ends as the
       next section starts coming up (from the bottom of the screen, to be held at rest) */
    const r = gap.getBoundingClientRect();
    const gone = navH + vh * LEAVE; // the section before has faded out by the time its bottom is here
    const st = stops[i];
    const end = vh; // the walk ends as the next section starts rising into view
    const p = (gone - r.top) / (r.height - (end - gone));
    if (p > 0) {
      k = i;
      t = p;
    }
  });
  const boxes = stops.map((el) => el.getBoundingClientRect());
  const gapBoxes = gaps.map((g) => g.getBoundingClientRect());
  const hostBox = host.value.getBoundingClientRect();
  const cur = stops[k];
  const poster = cur && (cur._poster !== undefined ? cur._poster : (cur._poster = cur.querySelector(".work-poster")));
  /* load and decode the next poster picture while you walk to it, so its flight never waits */
  const next = poster && (poster._src || (poster._src = poster.querySelector(".work-poster-img")?.getAttribute("src")));
  if (next && flyImg.value.getAttribute("src") !== next) {
    flyImg.value.src = next;
    flyImg.value.decode?.().then(schedule, () => {});
  }
  let posterBox = null, imgBox = null;
  if (poster) {
    const img = poster._img || (poster._img = poster.querySelector(".work-poster-img"));
    if (img) {
      posterBox = poster.getBoundingClientRect();
      imgBox = img.getBoundingClientRect();
      if (!poster._fit) {
        poster._fit = getComputedStyle(img).objectPosition.split(" ").map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : 0.5));
        poster._radius = parseFloat(getComputedStyle(poster).borderTopLeftRadius) || 0;
      }
    }
  }

  /* ---- then write ---- */
  let dim = 0, zk = 0;
  flight = null;
  stops.forEach((el, i) => {
    /* zi: how far the section has come up, from the bottom of the screen (0) to its resting place (1) */
    /* where it would be without the hold: just after its gap */
    const top = gapBoxes[i].bottom, bottom = boxes[i].bottom;
    const p = el._poster;
    const raw = (vh - top) / Math.max(1, vh - el._stop); // 0 as it enters at the bottom, 1 at its resting place
    const zi = clamp01(raw);
    if (i === k) zk = zi;
    if (!p) {
      /* a plain section: it comes up on its card while you face the painting */
      const out = clamp01((bottom - navH) / (vh * LEAVE)); // and away as it leaves, so the next walk can start
      const v = Math.min(clamp01(zi / 0.4), out); // it fades up as it rises into view
      put(el, "opacity", v.toFixed(2));
      /* (beside its painting, the room hardly dims: the painting is meant to be seen with the words) */
      const side = window.innerWidth >= 1000 && el.classList.contains("is-side");
      if (top < vh && bottom > navH) dim = Math.max(dim, v * (side ? 0.3 : 1));
      return;
    }
    /* an analysis: the picture lands, the poster takes it over, its shading comes down over the
       picture, then the card and the rest of the analysis, then the words */
    /* (raw goes past 1 as the poster carries on up the page: the last steps happen on the move) */
    const pic = clamp01((raw - 0.92) / 0.05);
    const shade = clamp01((raw - 0.95) / 0.05);
    const card = clamp01((raw - 0.97) / 0.06);
    put(el, "opacity", Math.min(pic, clamp01((bottom - navH) / (vh * LEAVE))).toFixed(2));
    const shading = p._shade || (p._shade = p.querySelector(".work-poster-shade"));
    if (shading) put(shading, "opacity", shade.toFixed(2));
    for (const child of el.children) {
      if (child === p) continue;
      put(child, "opacity", card < 1 ? card.toFixed(2) : "");
      put(child, "transition", card < 1 ? "none" : "");
    }
    const parts = el._parts || (el._parts = [...el.querySelectorAll(TEXT)]);
    parts.forEach((part, j) => {
      const v = clamp01((raw - 0.98 - j * 0.012) / 0.04); // all in by the time it reaches its place and moves on
      put(part, "opacity", v < 1 ? smooth(v).toFixed(2) : "");
      put(part, "transform", v < 1 ? `translateY(${((1 - v) * 14).toFixed(1)}px)` : "");
    });
    if (top < vh && bottom > navH) dim = Math.max(dim, pic);

    if (i === k && posterBox && zi > 0 && pic < 1) {
      /* the picture flies to where the poster will be at rest and waits there while the page brings
         the poster up underneath it; only at the very end does it follow the poster itself */
      const dy = (el._stop - top) * (1 - smooth(clamp01((raw - 0.82) / 0.12)));
      const nw = flyImg.value.naturalWidth || 1, nh = flyImg.value.naturalHeight || 1;
      const into = (r) => ({ x: r.x - hostBox.left, y: r.y + dy - hostBox.top, w: r.w, h: r.h });
      flight = {
        k: start + i,
        box: into({ x: posterBox.left, y: posterBox.top, w: posterBox.width, h: posterBox.height }),
        pic: into(coverRect(imgBox, nw, nh, p._fit)),
        radius: p._radius,
        fade: clamp01(zi / 0.05), // first it appears exactly over the painting on the wall
        e: smooth(clamp01((zi - 0.04) / 0.7)), // then it flies to the poster's resting place
        W: hostBox.width,
        H: hostBox.height,
      };
      dim = Math.max(dim, flight.e);
    }
  });

  /* where that puts you in the building: at the top of a page you stand just inside its wing */
  let K, T;
  if (k < 0) [K, T] = start === 0 ? [-1, 0] : [start, ENTRY];
  else [K, T] = [start + k, k === 0 && start > 0 ? ENTRY + (1 - ENTRY) * t : t];
  /* just after a page change: walk through the door from the last room rather than appear */
  if (travel) {
    const e = clamp01((now - travel.start) / TRAVEL_MS);
    /* (before it starts, the old page is still on its way out: ignore it) */
    if (now < travel.start || (e < 1 && K === travel.k && T <= ENTRY + 0.001)) {
      [K, T] = [travel.k, ENTRY * (e < 0.5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2)];
      if (now < travel.start) flight = null;
      schedule();
    } else travel = null;
  }
  here = K < 0 ? 0 : T >= 0.5 ? K : Math.max(0, K - 1);

  /* once the picture has lifted off, its frame on the wall stays empty while you face it (the
     picture is on the page now); it is hung back as you walk on to the next room */
  const lift = k >= 0 && t >= 1 && zk >= 0.05 && stops[k]?._poster ? start + k : -1;
  if (lift !== lifted) museum.lift((lifted = lift));
  museum.setWalk(K, T);
  placeFlyer();
  put(veil.value, "opacity", (dim * 0.55).toFixed(2)); // the room settles into shadow behind the reading
  if (now < pumpUntil) schedule();
}
const schedule = () => frame || (frame = requestAnimationFrame(update));
const readNav = () => {
  navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 0;
  rest = navH + (window.innerWidth > 760 ? 24 : 12);
};
const remeasure = () => document.querySelectorAll(".panel .walk-gap + *").forEach((el) => (el._h = undefined));
/* (a page that changes height, e.g. a tab opened, keeps its holds: they depend on the screen only,
   apart from a poster, whose height does not change) */
const onResize = () => {
  readNav();
  remeasure();
  museum && museum.resize();
  schedule();
};

/* on a museum page the site floats over the building; on Home it is a plain page */
function inside(name) {
  const on = name in WING_START;
  document.documentElement.classList.toggle("museum-on", on);
  if (host.value) host.value.style.visibility = on ? "" : "hidden";
  museum && museum.setActive(on);
}
/* a page change: into the next wing you walk through the door; anywhere else, a quick fade */
watch(
  () => route.name,
  (name, old) => {
    if (museum) inside(name); // (also the first time: the router may only know the page after the museum is up)
    if (!museum || !old || name === old) return;
    if (!(name in WING_START)) return;
    const to = WING_START[name];
    pumpUntil = performance.now() + 1800; // the new page is still arriving: follow it every frame
    preloadWing(name);
    if (to === here + 1) {
      travel = { k: to, start: performance.now() + 600 }; // once the old page is out of the way
      schedule();
      return;
    }
    travel = null;
    const f = fade.value;
    if (!(old in WING_START)) f.style.opacity = "1"; // coming in from Home: start dark, the building fades up
    f.style.opacity = "1";
    setTimeout(() => {
      update();
      museum.snap();
      f.style.opacity = "0";
    }, 320);
  }
);

onMounted(async () => {
  try {
    const { createMuseum } = await import("../../museum/scene.js");
    museum = createMuseum(host.value, ROOMS, placeFlyer, giveUp);
  } catch {
    state.on = false; // no WebGL: read the site without the museum
    document.documentElement.classList.remove("museum-on", "museum-loading");
    return;
  }
  inside(route.name);
  flyImg.value.addEventListener("load", schedule);
  readNav();
  pumpUntil = performance.now() + 1500;
  update();
  museum.snap();
  requestAnimationFrame(() => document.documentElement.classList.remove("museum-loading")); // the first view is drawn: fade it up
  preloadWing(route.name);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", onResize);
  if (/[?&]fps/.test(location.search)) showMeter();
});
/* ?fps in the address: frames per second while the page is moving, the 3D resolution and the GPU */
function showMeter() {
  const box = document.createElement("div");
  box.className = "fps-meter";
  document.body.appendChild(box);
  let last = 0, n = 0, sum = 0, worst = 0;
  const tick = (now) => {
    const dt = now - last;
    last = now;
    if (dt < 250) { n++; sum += dt; worst = Math.max(worst, dt); }
    if (sum > 500) {
      box.textContent = `${Math.round((1000 * n) / sum)} fps · worst ${Math.round(worst)} ms · 3D at ${Math.round(museum.ratio() * 100)}%
${museum.gpu.slice(0, 70)}`;
      n = sum = worst = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
/* the browser turned out too slow to walk the museum: stay where you are, on the plain pages */
function giveUp() {
  if (!museum) return;
  const vh = window.innerHeight;
  /* the section in view, to keep it in view once the walking gaps have gone */
  const anchor = [...document.querySelectorAll(".panel .walk-gap + *")].find((el) => el.getBoundingClientRect().bottom > vh * 0.2);
  const offset = anchor ? anchor.getBoundingClientRect().top : 0;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", onResize);
  cancelAnimationFrame(frame);
  museum.dispose();
  museum = null;
  document.querySelectorAll(".panel .walk-gap + *, .panel .walk-gap + * *").forEach((el) => {
    if (!el._put) return;
    for (const p of Object.keys(el._put)) p[0] === "-" ? el.style.removeProperty(p) : (el.style[p] = "");
    el._put = undefined;
  });
  document.documentElement.classList.remove("museum-on", "museum-loading");
  state.on = false;
  nextTick(() => anchor && window.scrollTo({ top: anchor.getBoundingClientRect().top + window.scrollY - Math.max(offset, navH), behavior: "instant" }));
}
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", onResize);
  document.documentElement.classList.remove("museum-on");
  if (museum) museum.dispose();
  museum = null;
});
</script>

<template>
  <div v-if="state.on" ref="host" class="museum" aria-hidden="true">
    <i ref="veil" class="museum-veil"></i>
    <i ref="fade" class="museum-fade"></i>
    <div ref="flyer" class="museum-flyer"><img ref="flyImg" alt="" decoding="async" /></div>
  </div>
</template>
