import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  /* "/" on Vercel; the GitHub Pages workflow sets BASE_PATH=/Great-Books-Museum/ */
  base: process.env.BASE_PATH || "/",
  build: {
    /* minified JS and CSS (each page is already its own chunk, loaded when visited) */
    minify: true,
    cssMinify: true,
    cssCodeSplit: true,
    rolldownOptions: {
      output: {
        /* Vue and the router change far less often than the site, so they get their own
           file that browsers keep cached between updates */
        advancedChunks: {
          groups: [
            { name: "vendor", test: /[\\/]node_modules[\\/](vue|@vue|vue-router)[\\/]/ },
            { name: "three", test: /[\\/]node_modules[\\/]three[\\/]/ }, // only the Analyses page loads it
          ],
        },
      },
    },
  },
});
