<script setup>
/**
 * Runs a demo from docs/demos/ inside a guide page.
 *
 * The engine only runs in a browser, so the demo module is imported after
 * mount, never during server-side rendering. Each demo module exports a
 * default async function that takes a canvas and resolves to the running
 * M2D instance. The instance is paused while scrolled out of view and
 * destroyed when the page is left.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  /** `docs/demos/<name>.js`, or `docs/demos/<name>/main.js` for a multi-file demo. */
  name: { type: String, required: true },
  /** CSS aspect ratio of the canvas. */
  aspect: { type: String, default: '16 / 9' }
});

const canvas = ref(null);
const status = ref('loading');
const message = ref('');

const demos = import.meta.glob(['../../demos/*.js', '../../demos/*/main.js']);

let game = null;
let observer = null;

onMounted(async () => {
  const load = demos[`../../demos/${props.name}.js`] ?? demos[`../../demos/${props.name}/main.js`];
  if (!load) {
    status.value = 'error';
    message.value = `No demo named "${props.name}" in docs/demos/.`;
    return;
  }
  try {
    const module = await load();
    game = await module.default(canvas.value);
    // Reachable from the browser console as document.querySelector('canvas').m2d
    canvas.value.m2d = game;
    status.value = 'running';
    observer = new IntersectionObserver(([entry]) => {
      if (game) game.paused = !entry.isIntersecting;
    });
    observer.observe(canvas.value);
  } catch (error) {
    status.value = 'error';
    message.value = error.message;
    console.error(error);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  game?.destroy();
  game = null;
});
</script>

<template>
  <figure class="m2d-demo" :data-status="status">
    <canvas ref="canvas" :style="{ aspectRatio: aspect }"></canvas>
    <p v-if="status === 'loading'" class="m2d-demo-status">Loading demo…</p>
    <p v-else-if="status === 'error'" class="m2d-demo-status m2d-demo-error">{{ message }}</p>
    <figcaption v-if="$slots.default"><slot /></figcaption>
  </figure>
</template>
