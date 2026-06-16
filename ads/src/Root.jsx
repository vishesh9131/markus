import { Composition } from "remotion";
import { Teaser } from "./Teaser";

// 15s landscape teaser. Duplicate with width/height 1080x1920 for a vertical cut.
export const RemotionRoot = () => (
  <Composition
    id="Teaser"
    component={Teaser}
    durationInFrames={450}
    fps={30}
    width={1920}
    height={1080}
  />
);
