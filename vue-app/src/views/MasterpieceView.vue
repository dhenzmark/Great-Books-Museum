<script setup>
import { museum } from "../museum/state.js";
import PageTitle from "../components/layout/PageTitle.vue";
import NextPage from "../components/layout/NextPage.vue";
import WorkFoot from "../components/ui/WorkFoot.vue";
import AngerArcFeature from "../components/masterpiece/AngerArcFeature.vue";
import PrincipleList from "../components/masterpiece/PrincipleList.vue";
import AchillesCompare from "../components/masterpiece/AchillesCompare.vue";
import FavoriteScene from "../components/masterpiece/FavoriteScene.vue";
</script>

<template>
  <div class="page">
    <PageTitle
      label="Favorite Work"
      before="FAV"
      image="assets/img/iliad-ivanov-priam.webp"
      after="RITE"
      suffix=" WORK"
      quote-source="Homer, the Iliad, Book I, translated by Samuel Butler"
    >
      Of all seven works, Homer&rsquo;s <em>Iliad</em> stayed with me the longest. It looks like a poem about war, but underneath, it is about grief,
      pride, and the moment two enemies recognize each other as human.
      <template #quote>&ldquo;Sing, O goddess, the anger of Achilles son of Peleus.&rdquo;</template>
      <template #credit>
        Pictures above: Alexander Ivanov, Priam Asking Achilles for the Return of Hector&rsquo;s Body, 1824, and Franz von Matsch, The Triumph of
        Achilles, 1892.
      </template>
    </PageTitle>

    <main id="main">
      <section id="masterpiece" class="section deep" aria-labelledby="page-title">
        <div class="wrap">
          <div class="walk">
            <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
            <div class="museum-stop is-side">
              <AngerArcFeature />
            </div>
            <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
          </div>
          <div class="walk">
            <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
            <div class="museum-stop is-side">
              <PrincipleList />
            </div>
            <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
          </div>
          <div class="walk">
            <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
            <div class="museum-stop is-side">
              <AchillesCompare />
            </div>
            <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
          </div>
          <div class="walk">
            <div v-if="museum.on" class="walk-gap" aria-hidden="true"></div>
            <div class="museum-stop is-side">
              <FavoriteScene />
            <WorkFoot
              v-reveal
              style="margin-top: 56px"
              quote="“His father and mother laughed to see him, but Hector took the helmet from his head and laid it all gleaming upon the ground.”"
              cite="Book VI, translated by Samuel Butler"
              heading="What It Means to Me"
            >
              <p>
                The <em>Iliad</em> taught me that anger is easy, but mercy takes courage. Achilles&rsquo; pride reminded me of how <em>hiya</em> and
                wounded pride can make us push away the people we need most. The poem ends with a funeral, much like our own <em>lamay</em>, where even
                old rivals come to grieve together. I want to remember Achilles in Book 24, not Book 22: the moment he chose compassion over revenge.
              </p>
            </WorkFoot>
            </div>
            <div v-if="museum.on" class="walk-spacer" aria-hidden="true"></div>
          </div>
        </div>
      </section>
      <NextPage to="/learning" title="Summary of Learning" />
    </main>
  </div>
</template>
