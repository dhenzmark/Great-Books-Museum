<script setup>
import { museum } from "../museum/state.js";
import PageTitle from "../components/layout/PageTitle.vue";
import NextPage from "../components/layout/NextPage.vue";
import ProfileWelcome from "../components/profile/ProfileWelcome.vue";
import ProfileFigures from "../components/profile/ProfileFigures.vue";
</script>

<template>
  <div class="page">
    <PageTitle label="Profile" before="PR" image="assets/img/mahabharata-krishna-arjuna.webp" after="FILE" quote-source="From my profile">
      Who I am, how I read, and why these old stories still matter to a student in the Philippines today.
      <template #quote>These works feel ancient, but the people in them feel surprisingly close.</template>
      <template #credit>Picture above: Krishna and Arjuna on the chariot, India, 18th&ndash;19th century.</template>
    </PageTitle>

    <main id="main">
      <div class="walk">
        <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
        <div class="museum-stop is-side">
          <ProfileWelcome />
        </div>
        <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
      </div>
      <div class="walk">
        <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
        <div class="museum-stop is-side">
          <ProfileFigures />
        </div>
        <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
      </div>
      <NextPage to="/" eyebrow="Back to the beginning" title="Epic Voices home" />
    </main>
  </div>
</template>
