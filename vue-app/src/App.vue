<script setup>
import { ref, computed, nextTick, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { applyPendingScroll, scrollOldPageAway } from "./router.js";
import { prefersReducedMotion } from "./composables/motion.js";
import { pageTransition } from "./composables/pageTransition.js";
import SiteNav from "./components/layout/SiteNav.vue";
import SiteFooter from "./components/layout/SiteFooter.vue";
import PaintingViewer from "./components/layout/PaintingViewer.vue";
import TraditionBackdrop from "./components/layout/TraditionBackdrop.vue";
import BackToTop from "./components/layout/BackToTop.vue";
import SiteMuseum from "./components/layout/SiteMuseum.vue";

const router = useRouter();
const route = useRoute();
const card = ref(null);
const destination = computed(() => route.meta.title || "");

/* Links written as plain <a href="/..."> (e.g. inside the analysis text) go through the router */
function followInternalLink(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest("a[href]");
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
  const href = a.getAttribute("href");
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/assets/")) return;
  e.preventDefault();
  router.push(href);
}

/*
  Page change. Two styles:
  - simple fade (top menu, in-text links): the old page fades out, the new one rises in;
  - transition card (links at the bottom: "next page" card and footer menu): a panel
    rises over the old page showing the destination's name, then lifts off the new page.
*/
const EASE = "cubic-bezier(.65, 0, .35, 1)";
const EASE_OUT = "cubic-bezier(.22, 1, .36, 1)";
let style = "fade";

/* finishing a leave synchronously breaks Vue's page swap, so finish on the next frame */
const finishSoon = (done) => requestAnimationFrame(() => done());

/* the old page is out of sight: go to the top now, then let Vue swap the pages */
const leaveDone = (done) => () => {
  scrollOldPageAway();
  finishSoon(done);
};

function onLeave(el, done) {
  style = prefersReducedMotion() ? "none" : pageTransition.card ? "card" : "fade";
  pageTransition.card = false;
  if (style === "none") return leaveDone(done)();
  if (style === "fade") {
    el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-16px)" }], { duration: 280, easing: "ease-in", fill: "forwards" })
      .finished.then(leaveDone(done));
    return;
  }
  const c = card.value;
  c.style.visibility = "visible";
  el.animate([{ opacity: 1, transform: "none" }, { opacity: 0.3, transform: "translateY(-40px) scale(.985)" }], { duration: 520, easing: EASE, fill: "forwards" });
  c.animate([{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], { duration: 520, easing: EASE, fill: "forwards" })
    .finished.then(leaveDone(done));
  c.querySelectorAll("small, strong").forEach((t, i) =>
    t.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { duration: 500, delay: 220 + i * 70, easing: EASE_OUT, fill: "both" })
  );
}

function onEnter(el, done) {
  applyPendingScroll();
  if (style === "none") return done();
  if (style === "fade") {
    el.animate([{ opacity: 0, transform: "translateY(28px)" }, { opacity: 1, transform: "none" }], { duration: 650, easing: EASE_OUT, fill: "backwards" })
      .finished.then(done);
    return;
  }
  /* hold the new page's own entrance animations until the card starts lifting */
  const root = document.documentElement;
  root.classList.add("card-hold");
  setTimeout(() => root.classList.remove("card-hold"), 260);
  const c = card.value;
  c.animate([{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }], { duration: 640, delay: 180, easing: EASE, fill: "forwards" })
    .finished.then(() => {
      c.style.visibility = "hidden";
      c.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    });
  el.animate([{ opacity: 0, transform: "translateY(60px)" }, { opacity: 1, transform: "none" }], { duration: 900, delay: 260, easing: EASE_OUT, fill: "backwards" })
    .finished.then(done);
}

onMounted(() => router.isReady().then(() => nextTick(applyPendingScroll)));
</script>

<template>
  <TraditionBackdrop />
  <SiteMuseum />
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="side-word" aria-hidden="true">Epic Voices</div>
  <div class="panel" @click="followInternalLink">
    <SiteNav />
    <RouterView v-slot="{ Component, route: r }">
      <Transition mode="out-in" :css="false" @leave="onLeave" @enter="onEnter">
        <component :is="Component" :key="r.path" />
      </Transition>
    </RouterView>
    <SiteFooter />
  </div>
  <div ref="card" class="transition-card" aria-hidden="true">
    <small>Epic Voices</small>
    <strong>{{ destination }}</strong>
  </div>
  <BackToTop />
  <PaintingViewer />
</template>
