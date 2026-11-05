<script setup>
/*
  The opening poster of an analysis, in the style of a gallery exhibition page:
  the painting full-bleed, the title huge and letter-spaced, small labels in the corners.
*/
import { computed } from "vue";
import exhibits from "../../data/exhibits.js";
import LookButton from "../ui/LookButton.vue";

const props = defineProps({
  work: { type: Object, required: true },
});

/* zoom past the paper margins of the engraving and the manuscript page */
const zoom = { job: 1.32, panchatantra: 1.22 };
/* frame each painting on its most telling part */
const focus = { job: "50% 55%", panchatantra: "62% 52%", ramayana: "50% 30%", mahabharata: "50% 70%", iliad: "50% 40%", odyssey: "50% 55%", roland: "50% 50%" };

const region = computed(() => {
  const exhibit = exhibits.find((e) => e.href.endsWith(`#${props.work.id}`));
  return exhibit ? exhibit.meta.split(",")[0] : "";
});
/* first sentence of the painting's caption, e.g. "Raja Ravi Varma, c. 1895."
   (a sentence ends at ". " followed by a capital, so "c. 1616" is not cut) */
const credit = computed(() => (props.work.plate.look?.caption || props.work.plate.caption).split(/(?<=\.)\s(?=[A-Z])/)[0]);
const roman = ["I", "II", "III", "IV", "V", "VI", "VII"];
</script>

<template>
  <header class="work-poster">
    <img v-parallax="0.06" class="work-poster-img" :src="work.plate.src" :alt="work.plate.alt" loading="lazy" decoding="async" :style="{ objectPosition: focus[work.id] || '50% 50%', scale: zoom[work.id] }" />
    <i class="work-poster-shade" aria-hidden="true"></i>

    <div class="work-poster-top">
      <p><span class="work-poster-num">{{ roman[Number(work.num) - 1] }}</span> · {{ region }}</p>
      <p>{{ work.kicker }}</p>
    </div>

    <div class="work-poster-middle">
      <h3 :id="work.titleId" class="work-poster-title">{{ work.title }}</h3>
      <p class="work-poster-orig" :class="work.orig.font" :lang="work.orig.lang">{{ work.orig.text }}</p>
      <p class="work-poster-lens">Read through the <strong>{{ work.lens }}</strong> lens</p>
      <p class="work-poster-hook">{{ work.hook }}</p>
    </div>

    <div class="work-poster-bottom">
      <p class="work-poster-credit">{{ credit }}</p>
      <LookButton v-if="work.plate.look" :painting="work.plate.look" :alt="work.plate.alt" />
    </div>
  </header>
</template>
