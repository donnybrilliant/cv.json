import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cvApiMiddleware } from "./server/api.js";

// Local file-backed API mounted on the dev server so `npm run dev` runs the app
// and the persistence API together on one port (no second process, no proxy).
// `env` carries server-only secrets (e.g. OPENROUTER_API_KEY) loaded from .env;
// they stay in the Node middleware and never reach the client bundle.
function cvApiPlugin(env) {
  return {
    name: "cv-api",
    configureServer(server) {
      server.middlewares.use(cvApiMiddleware(env));
    },
    configurePreviewServer(server) {
      server.middlewares.use(cvApiMiddleware(env));
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (no prefix filter) for server-side use only.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), cvApiPlugin(env)],
    server: {
      // Autosave writes JSON into data/; without this, every save would change
      // a watched file and trigger a full-page HMR reload (visible flash + lost
      // UI state). Ignore the data dir so edits stay smooth.
      watch: { ignored: ["**/data/**"] },
    },
    build: {
      sourcemap: false,
    },
  };
});

