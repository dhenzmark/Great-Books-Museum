<script setup>
/*
  The museum behind the Analyses page (the 3D scene is museumScene.js, loaded only here).
  It stays on screen behind the analyses; the empty gap before each analysis is where you walk:
  as a gap scrolls past you step back into the hall, walk to that work's painting and turn to
  face it. Then, as its analysis comes up the page (still unseen), the painting lifts off the
  wall as a flat picture and flies to exactly where the poster's picture sits; the poster takes
  over, the card appears round it, and the words arrive one after another. If WebGL is not
  available the gaps close and the page reads as before.
*/
import { ref, onMounted, onBeforeUnmount } from "vue";
import works from "../../data/works.js";

const emit = defineEmits(["unavailable"]);
const host = ref(null);
const veil = ref(null);
const flyer = ref(null);
const flyImg = ref(null);
let museum = null;
let io = null;
let frame = 0;
/* the words of each poster, in the order they arrive */
const TEXT = ".work-poster-top, .work-poster-title, .work-poster-orig, .work-poster-lens, .work-poster-hook, .work-poster-bottom";

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);
const mix = (a, b, e) => a + (b - a) * e;
const mixRect = (a, b, e) => ({ x: mix(a.x, b.x, e), y: mix(a.y, b.y, e), w: mix(a.w, b.w, e), h: mix(a.h, b.h, e) });

/* the flight in progress: which work, where it lands (picture and frame, in the museum's own
   pixels), how far it has flown (e) and how opaque it is */
let flight = null;
let lifted = -1;
let navH = 0;
let rest = 0; // where an analysis comes to rest: a little below the nav, level with the list of works

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
  const { pic, box, e, fade, W, H } = flight;
  const p = mixRect(from, pic, e), c = mixRect(from, box, e);
  put(img, "transform", `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${(p.w / nw).toFixed(4)}, ${(p.h / nh).toFixed(4)})`);
  put(el, "clipPath", `inset(${c.y.toFixed(1)}px ${(W - c.x - c.w).toFixed(1)}px ${(H - c.y - c.h).toFixed(1)}px ${c.x.toFixed(1)}px round ${(flight.radius * e).toFixed(1)}px)`);
  put(el, "opacity", fade.toFixed(2));
  put(el, "visibility", "visible");
}

/* which walk is under way: the last gap that has started, and how far through it you are */
function update() {
  frame = 0;
  if (!museum) return;
  const vh = window.innerHeight;
  const gaps = document.querySelectorAll(".walk-gap");
  const articles = [...document.querySelectorAll("#analyses .work")];

  /* ---- read everything first ---- */
  let k = -1, t = 0;
  gaps.forEach((gap, i) => {
    const r = gap.getBoundingClientRect();
    const p = (vh - r.top) / r.height; // the walk: while the gap crosses the screen
    if (p > 0) {
      k = i;
      t = p;
    }
  });
  const boxes = articles.map((el) => el.getBoundingClientRect());
  const hostBox = host.value.getBoundingClientRect();
  const cur = articles[k];
  /* load and decode the next picture while you walk to it, so its flight never waits */
  const next = cur && (cur._src || (cur._src = cur.querySelector(".work-poster-img")?.getAttribute("src")));
  if (next && flyImg.value.getAttribute("src") !== next) {
    flyImg.value.src = next;
    flyImg.value.decode?.().then(schedule, () => {});
  }
  let posterBox = null, imgBox = null;
  if (cur) {
    const poster = cur._poster || (cur._poster = cur.querySelector(".work-poster"));
    const img = poster && (poster._img || (poster._img = poster.querySelector(".work-poster-img")));
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
  articles.forEach((el, i) => {
    /* zi: how far the analysis has come up, from the bottom of the screen (0) to just below the nav (1) */
    const was = el._pin || 0;
    const top = boxes[i].top - was, bottom = boxes[i].bottom - was; // where it is in the page, without the hold
    /* it comes to rest with its picture centred in the screen below the nav (never closer to the
       nav than `rest`) */
    const poster = el._poster || (el._poster = el.querySelector(".work-poster"));
    if (poster && el._ph === undefined) { el._lift = poster.offsetTop; el._ph = poster.offsetHeight; } // measured once (and again on resize)
    const ph = el._ph || 0;
    const stop = Math.max(rest, navH + (vh - navH - ph) / 2) - (el._lift || 0);
    const raw = (vh - top) / (vh - stop);
    const zi = clamp01(raw);
    if (i === k) zk = zi;
    /* the picture lands, the poster takes it over, its shading comes down over the picture,
       then the card and the rest of the analysis, then the words */
    const pic = clamp01((zi - 0.78) / 0.03);
    const shade = clamp01((zi - 0.81) / 0.06);
    const card = clamp01((zi - 0.87) / 0.06);
    /* until it reaches the top, the analysis is held at its resting place, so the picture lands
       exactly where the poster will stay, and everything arrives with it standing still */
    el._pin = raw > 0 && raw < 1 ? stop - top : 0;
    put(el, "transform", el._pin ? `translate3d(0, ${el._pin.toFixed(1)}px, 0)` : "");
    put(el, "opacity", pic.toFixed(2));
    put(el, "--card", card.toFixed(2));
    if (poster) put(poster, "--shade", shade.toFixed(2));
    for (const child of el.children) {
      if (child === poster) continue;
      put(child, "opacity", card < 1 ? card.toFixed(2) : "");
      put(child, "transition", card < 1 ? "none" : "");
    }
    const parts = el._parts || (el._parts = [...el.querySelectorAll(TEXT)]);
    parts.forEach((part, j) => {
      const v = clamp01((zi - 0.89 - j * 0.015) / 0.05);
      put(part, "opacity", v < 1 ? smooth(v).toFixed(2) : "");
      put(part, "transform", v < 1 ? `translateY(${((1 - v) * 14).toFixed(1)}px)` : "");
    });
    if (top < vh && bottom > navH) dim = Math.max(dim, pic);

    if (i === k && posterBox && zi > 0 && pic < 1) {
      const dy = el._pin - was; // the hold just written moves the poster by this much
      const nw = flyImg.value.naturalWidth || 1, nh = flyImg.value.naturalHeight || 1;
      const into = (r) => ({ x: r.x - hostBox.left, y: r.y + dy - hostBox.top, w: r.w, h: r.h });
      flight = {
        k: i,
        box: into({ x: posterBox.left, y: posterBox.top, w: posterBox.width, h: posterBox.height }),
        pic: into(coverRect(imgBox, nw, nh, poster._fit)),
        radius: poster._radius,
        fade: clamp01(zi / 0.05), // first it appears exactly over the painting on the wall
        e: smooth(clamp01((zi - 0.04) / 0.74)), // then it flies to the poster
        W: hostBox.width,
        H: hostBox.height,
      };
      dim = Math.max(dim, flight.e);
    }
  });
  /* once the picture has lifted off, its frame on the wall stays empty while you face it (the
     picture is on the page now); it is hung back as you walk on to the next room */
  const lift = k >= 0 && t >= 1 && zk >= 0.05 ? k : -1;
  if (lift !== lifted) museum.lift((lifted = lift));
  museum.setWalk(k, t);
  placeFlyer();
  put(veil.value, "opacity", (dim * 0.55).toFixed(2)); // the room settles into shadow behind the reading
}
const schedule = () => frame || (frame = requestAnimationFrame(update));
const readNav = () => {
  navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 0;
  rest = navH + (window.innerWidth > 760 ? 24 : 12);
};
const onResize = () => {
  readNav();
  document.querySelectorAll("#analyses .work").forEach((el) => (el._ph = undefined));
  museum && museum.resize();
  schedule();
};

onMounted(async () => {
  try {
    const { createMuseum } = await import("./museumScene.js");
    museum = createMuseum(host.value, works, placeFlyer);
  } catch {
    emit("unavailable"); // no WebGL: read the analyses without the museum
    return;
  }
  flyImg.value.addEventListener("load", schedule);
  readNav();
  update();
  io = new IntersectionObserver(([e]) => museum && museum.setActive(e.isIntersecting));
  io.observe(host.value.parentElement);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", onResize);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  if (io) io.disconnect();
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", onResize);
  document.querySelectorAll(`#analyses .work, #analyses .work > *, #analyses .work-poster, #analyses ${TEXT}`).forEach((el) => {
    el.style.opacity = el.style.transform = el.style.transition = "";
    el.style.removeProperty("--card");
    el.style.removeProperty("--shade");
    el._put = el._pin = undefined;
  });
  if (museum) museum.dispose();
});
</script>

<template>
  <div ref="host" class="museum" aria-hidden="true">
    <i ref="veil" class="museum-veil"></i>
    <div ref="flyer" class="museum-flyer"><img ref="flyImg" alt="" decoding="async" /></div>
  </div>
</template>
