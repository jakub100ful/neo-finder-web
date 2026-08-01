# NEO Finder Web

NEO Finder is a SvelteKit web version of the original React Native app. It turns an important date into a personal orbital catalogue: browse the near Earth objects recorded close to that date, inspect their real NASA values, and place selected objects into a live Three.js scene around a custom Earth.

## What is included

- Retro arcade / pixel-inspired space interface with intro, date onboarding, dashboard, catalogue, object detail and Earth customisation flows.
- Live NASA NeoWs feed lookup for a single anchor date.
- Local demo objects when live data is disabled, a date has no returned objects, or the NASA service is unavailable.
- Three.js Earth and asteroid scene. Diameter, relative speed, close-approach distance and inclination drive the compressed visual model; the UI keeps the real values visible.
- Browser-local favourites, Earth name, Earth palette and NASA token storage.
- Optional NASA token gate controlled by a build-time feature flag.
- Static SvelteKit output configured for GitHub-to-Netlify deployment.

## Local development

Requirements: Node 22 or newer.

Copy the .env.example file to .env if you want to change the feature flags, then run:

~~~sh
npm install
npm run dev
~~~

The default build calls NASA with DEMO_KEY and falls back to the local demo set if the request is rate-limited or unavailable. For regular use, create a key at [api.nasa.gov](https://api.nasa.gov) and paste it into the in-app NASA Access settings.

## Feature flags

VITE_ENABLE_LIVE_NASA_DATA=false creates a demo-only build without network calls.

VITE_REQUIRE_NASA_TOKEN=true adds a token gate to the first-run flow. When it is false, visitors can use the NASA demo key or add their own key later in Customise.

Tokens are stored in localStorage on the visitor's device. This is intentionally a client-side experience: do not use this flow for a private server-side secret.

NASA documents the NeoWs feed and lookup endpoints at [api.nasa.gov](https://api.nasa.gov/). NASA's default key is limited to 1,000 requests per hour, while DEMO_KEY is intended for exploration and has lower hourly and daily limits.

## Deployment

This repo is configured for a free static Netlify deployment:

1. Push the repository to GitHub.
2. In Netlify, choose Add new site → Import an existing project and select the GitHub repository.
3. Netlify will use netlify.toml: build command npm run build, publish directory build, Node 22.
4. Add VITE_ENABLE_LIVE_NASA_DATA and VITE_REQUIRE_NASA_TOKEN under the site's build environment variables if you want to override the defaults.

The static adapter keeps the deployment simple and means there are no server functions or database costs for this first version. Netlify's SvelteKit documentation describes the adapter-based path for projects that later need server-rendered routes or functions.

## Research notes

The original app uses Expo, Three.js, a NASA feed request keyed by date, AsyncStorage favourites and a scaled geometry pipeline for asteroid size, speed, orbit radius and inclination. This web version keeps those product ideas but uses browser storage and a static SvelteKit shell.

Three.js was selected over Babylon.js for this first web version because it is the rendering library already used by the original app, has a small direct scene API for this scope, and can be loaded only in onMount so SvelteKit's build remains server-safe. Babylon.js remains a reasonable future option if the scene grows into a larger simulation with editor tooling, physics or richer material pipelines.
