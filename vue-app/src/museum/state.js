/* whether the museum is showing behind the site (false when the browser has no WebGL: then the
   pages read as plain pages, with no walking gaps) */
import { reactive } from "vue";

export const museum = reactive({ on: true });
