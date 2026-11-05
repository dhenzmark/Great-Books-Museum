<script setup>
/* One full analysis: poster, key facts, tabs, gallery and insight. */
import TabGroup from "../ui/TabGroup.vue";
import WorkFoot from "../ui/WorkFoot.vue";
import WorkSummary from "./WorkSummary.vue";
import WorkGallery from "./WorkGallery.vue";
import WorkPoster from "./WorkPoster.vue";
import OdysseyMapToggle from "./OdysseyMapToggle.vue";
import WorkBackdrop from "./WorkBackdrop.vue";
import OliphantArtifact from "./OliphantArtifact.vue";
import ShieldArtifact from "./ShieldArtifact.vue";
import BowArtifact from "./BowArtifact.vue";
import ChariotArtifact from "./ChariotArtifact.vue";
import PitcherArtifact from "./PitcherArtifact.vue";
import RamaBowArtifact from "./RamaBowArtifact.vue";
import JobArtifact from "./JobArtifact.vue";

const props = defineProps({
  work: { type: Object, required: true },
  current: { type: Boolean, default: false },
});

const artifacts = { panchatantra: PitcherArtifact, mahabharata: ChariotArtifact, iliad: ShieldArtifact, odyssey: BowArtifact, roland: OliphantArtifact, ramayana: RamaBowArtifact, job: JobArtifact };
const elementsTab = props.work.tabs.findIndex((t) => t.label === "Literary Elements");
</script>

<template>
  <article :id="work.id" class="work" :class="{ 'is-right': work.right, 'in-view': current }" :aria-labelledby="work.titleId">
    <i class="work-card" aria-hidden="true"></i>
    <WorkBackdrop :id="work.id" />
    <WorkPoster v-reveal :work="work" />
    <WorkSummary v-reveal :work="work" />

    <TabGroup v-reveal :tabs="work.tabs" :prefix="work.tabPrefix" :label="`${work.title} analysis`">
      <template v-if="work.id === 'odyssey'" #panel-0><OdysseyMapToggle /></template>
      <!-- 3D artifacts sit in Literary Elements, beside the symbolism they illustrate -->
      <template v-if="artifacts[work.id]" #[`panel-${elementsTab}`]><component :is="artifacts[work.id]" /></template>
    </TabGroup>


    <WorkGallery v-if="work.gallery.length" :title="`${work.title} in Art`" :paintings="work.gallery" />

    <WorkFoot v-reveal :quote="work.quote.text" :cite="work.quote.cite">
      <p v-html="work.insight"></p>
    </WorkFoot>
  </article>
</template>
