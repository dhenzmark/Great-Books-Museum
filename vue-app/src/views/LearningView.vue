<script setup>
import { museum } from "../museum/state.js";
import PageTitle from "../components/layout/PageTitle.vue";
import NextPage from "../components/layout/NextPage.vue";
import LessonGrid from "../components/learning/LessonGrid.vue";
import LensGuide from "../components/learning/LensGuide.vue";
import ComparisonTable from "../components/learning/ComparisonTable.vue";
import CraftNotes from "../components/learning/CraftNotes.vue";
</script>

<template>
  <div class="page">
    <PageTitle
      label="Summary of Learning"
      prefix="SUMMARY "
      image="assets/img/homer-bust.webp"
      after="F"
      suffix=" LEARNING"
      quote-source="The Song of Roland, laisse 87"
    >
      These seven works came from different places and centuries, yet they kept answering the same human questions. Here are the most important
      ideas I learned and how the works connect.
      <template #quote>&ldquo;Roland is fierce and Oliver is wise.&rdquo;</template>
      <template #credit>
        Pictures above: bust of Homer, The British Museum, and Achille-Etna Michallon, Landscape with the Death of Roland (sketch), c. 1819&ndash;22.
      </template>
    </PageTitle>

    <main id="main">
      <section id="learning" class="section" aria-labelledby="page-title">
        <div class="wrap">
          <div class="walk">
            <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
            <div class="museum-stop is-side">
              <LessonGrid />
            </div>
            <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
          </div>
          <div class="walk">
            <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
            <div class="museum-stop is-side">
              <LensGuide />
            </div>
            <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
          </div>
          <div class="walk">
            <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
            <div class="museum-stop is-side">
              <ComparisonTable />
            </div>
            <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
          </div>
          <div class="walk">
            <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
            <div class="museum-stop is-side">
              <CraftNotes />
            </div>
            <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
          </div>
        </div>
      </section>
      <NextPage to="/reflection" title="Personal Reflection" />
    </main>
  </div>
</template>
