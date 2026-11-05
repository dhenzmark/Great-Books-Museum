<script setup>
import works from "../data/works.js";
import { watch } from "vue";
import { useScrollSpy } from "../composables/useScrollSpy.js";
import { backdrop, traditionOf } from "../composables/backdrop.js";
import PageTitle from "../components/layout/PageTitle.vue";
import NextPage from "../components/layout/NextPage.vue";
import WorkToc from "../components/analyses/WorkToc.vue";
import WorkArticle from "../components/analyses/WorkArticle.vue";
import { museum } from "../museum/state.js";

const active = useScrollSpy(works.map((w) => w.id));
/* the background shows the tradition of the work you are reading */
watch(active, (id) => (backdrop.tradition = traditionOf[id] || "all"), { immediate: true });
</script>

<template>
  <div class="page">
    <PageTitle
      label="Seven Works"
      prefix="SEVEN "
      before="W"
      image="assets/img/panchatantra-lion-bull.webp"
      after="RKS"
      quote-source="Job 38:4, King James Version"
    >
      Each analysis reads its work through one literary lens, then covers the story, its characters, its themes, how it is told, and the culture
      that produced it. Use the tabs to move through each one, and select any painting to view more.
      <template #quote>&ldquo;Where wast thou when I laid the foundations of the earth?&rdquo;</template>
      <template #credit>
        Pictures above: the lion and the bull from a Kalila wa Dimna manuscript, Herat, 1430, and William Blake, The Lord Answering Job out of the
        Whirlwind, c. 1805.
      </template>
    </PageTitle>

    <main id="main">
      <section id="analyses" class="section" :class="{ 'with-museum': museum.on }" aria-labelledby="page-title">
        <div class="wrap">
          <div class="with-toc">
            <WorkToc :works="works" :active="active" />
            <div class="toc-body">
              <template v-for="work in works" :key="work.id">
                <!-- the walk to this work's painting; then its analysis comes up over the view -->
                <div class="walk">
                  <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
                  <WorkArticle :work="work" :current="work.id === active" />
                  <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </section>
      <NextPage to="/masterpiece" title="Favorite Literary Masterpiece" />
    </main>
  </div>
</template>
