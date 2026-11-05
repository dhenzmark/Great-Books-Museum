<script setup>
import { museum } from "../museum/state.js";
import HeroSlideshow from "../components/home/HeroSlideshow.vue";
import HeroIntro from "../components/home/HeroIntro.vue";
import HeroLinks from "../components/home/HeroLinks.vue";
import WorksSection from "../components/home/WorksSection.vue";
import TimelineExplorer from "../components/home/TimelineExplorer.vue";
import NextPage from "../components/layout/NextPage.vue";
</script>

<template>
  <div class="page">
    <header id="top" class="hero">
      <!-- in the museum the entrance hall itself is the picture: no slideshow, no strip of links -->
      <HeroSlideshow v-if="!museum.on" />
      <HeroIntro />
      <HeroLinks v-if="!museum.on" />
    </header>
    <main id="main">
      <div class="walk">
        <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
        <div class="museum-stop is-wide is-bare">
          <WorksSection />
        </div>
        <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
      </div>
      <div class="walk">
        <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
        <div class="museum-stop is-wide is-bare">
          <TimelineExplorer />
        </div>
        <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
      </div>
      <NextPage to="/analyses" eyebrow="Start here" title="Seven Literary Analyses" />
    </main>
  </div>
</template>
