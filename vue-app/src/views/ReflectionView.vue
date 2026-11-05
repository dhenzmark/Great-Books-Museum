<script setup>
import { museum } from "../museum/state.js";
import PageTitle from "../components/layout/PageTitle.vue";
import NextPage from "../components/layout/NextPage.vue";
import ReflectionLetter from "../components/reflection/ReflectionLetter.vue";
</script>

<template>
  <div class="page">
    <PageTitle
      label="Reflection"
      before="REFLECTI"
      image="assets/img/iliad-david-andromache.webp"
      after="N"
      quote-source="From my reflection"
    >
      Looking back on this journey through seven great works, here is what changed in the way I read, think, and see the world.
      <template #quote>If the Iliad taught me anything, it is that anger is easy, but mercy takes courage.</template>
      <template #credit>
        Pictures above: Jacques-Louis David, Andromache Mourning Hector, 1783, and J. M. W. Turner, Ulysses Deriding Polyphemus, 1829.
      </template>
    </PageTitle>

    <main id="main">
      <section id="reflection" class="section reflection" aria-labelledby="page-title">
        <div class="wrap">
          <div class="walk">
            <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
            <div class="museum-stop is-side">
              <ReflectionLetter />
            </div>
            <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
          </div>
        </div>
      </section>
      <NextPage to="/profile" title="Student Profile" />
    </main>
  </div>
</template>
