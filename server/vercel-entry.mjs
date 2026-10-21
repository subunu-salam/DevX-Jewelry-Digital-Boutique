// Vercel entrypoint for the API service.
// The real server is bundled into vercel/index.mjs during the Vercel build
// (npm run build:vercel). This file exists in the repo so Vercel can find the
// entrypoint before the build runs; the .mjs extension keeps Node in ES-module mode.
export { default } from "./vercel/index.mjs";
