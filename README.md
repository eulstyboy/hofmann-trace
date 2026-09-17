# Hofmann Trace

A drawing tool based on Hofmann's grid principle.

Hofmann Trace lets you build vector shapes from a grid of circles and rounded squares, smooth selected tangents with metaball-style junctions, edit individual supports, import a reference image, and export the result as SVG, merged SVG, EPS, PNG or JPEG.

The app runs entirely in the browser. It can be hosted as a static site and installed as a PWA on mobile.

## Credits

This project started from [bbtgnn/hofmann-1.0.0](https://github.com/bbtgnn/hofmann-1.0.0), an open-source tool inspired by Armin Hofmann's graphic work.

Hofmann Trace was extended with mobile support, project saving, reference images, contrast tracing, node editing, merge tools, metaball controls, export improvements and PWA deployment support.

Developed with Claude and Codex.

## Live Deployment

This repository is ready to deploy on Vercel as a static site.

Recommended Vercel settings:

- Framework Preset: `Other`
- Build Command: empty
- Output Directory: empty
- Install Command: empty

`vercel.json` runs the build and deploys the generated `public/` directory. It also adds cache headers so `index.html` and `sw.js` refresh correctly after updates.

## Local Use

Open `index.html` directly in a browser, or serve the folder locally if you want to test the PWA service worker.

The standalone app does not need a backend, account, database or external font request.

## Development

The editable source lives in `src/`. The build script assembles the standalone `index.html` and updates the static assets.

```bash
npm install
npm run build
npm test
```

The tests use Playwright and Chrome.

## License

This project is released under the GNU General Public License v3.0.

Because it derives from `bbtgnn/hofmann-1.0.0`, which is GPL-3.0 licensed, redistributed versions should keep the same license and preserve attribution to the original project.
