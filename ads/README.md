# Markus ads (Remotion)

Brutalist motion-graphics teaser for Markus.

```bash
cd ads
npm install
npm run studio    # live preview/edit in the browser
npm run render    # -> out/markus-teaser.mp4 (needs ffmpeg; Remotion downloads Chromium on first run)
npm run still     # one frame -> out/frame.png (quick sanity check)
```

Edit `src/Teaser.jsx` (scenes + brutalist style tokens at the top). For a
vertical reel, copy the `<Composition>` in `src/Root.jsx` with `width={1080}
height={1920}` and a layout tweak.
