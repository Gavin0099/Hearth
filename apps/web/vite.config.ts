import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { execSync } from "node:child_process";

function resolveGitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const buildCommit = process.env.VITE_APP_COMMIT ?? resolveGitCommit();
const buildTime = process.env.VITE_APP_BUILD_TIME ?? new Date().toISOString();

function toVendorChunkName(id: string) {
  const afterNodeModules = id.split("node_modules/")[1];
  if (!afterNodeModules) {
    return "vendor_misc";
  }

  const parts = afterNodeModules.split("/");
  const packageName = parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
  return `vendor_${packageName.replace("@", "").replace("/", "_")}`;
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_COMMIT__: JSON.stringify(buildCommit),
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
  },
  resolve: {
    alias: {
      "@hearth/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          return toVendorChunkName(id);
        },
      },
    },
  },
});
