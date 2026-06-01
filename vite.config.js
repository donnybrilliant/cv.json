import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cvApiMiddleware } from "./server/api.js";

// Local file-backed API mounted on the dev server so `npm run dev` runs the app
// and the persistence API together on one port (no second process, no proxy).
function cvApiPlugin() {
  return {
    name: "cv-api",
    configureServer(server) {
      server.middlewares.use(cvApiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(cvApiMiddleware());
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cvApiPlugin()],
  server: {
    // Autosave writes JSON into data/; without this, every save would change a
    // watched file and trigger a full-page HMR reload (visible flash + lost UI
    // state). Ignore the data dir so edits stay smooth.
    watch: { ignored: ["**/data/**"] },
  },
  build: {
    sourcemap: false,
  },
});

