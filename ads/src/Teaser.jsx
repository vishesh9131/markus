import React from "react";
import {
  AbsoluteFill,
  Series,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";

// ---- brutalist system: raw B/W, one loud accent + a yellow, heavy caps, mono,
// thick borders, hard cuts, slam-in motion. No rounded corners, no shadows. ----
const C = { bg: "#ffffff", ink: "#0a0a0a", blue: "#2b2bff", yellow: "#eaff00" };
const HEAVY = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'Courier New', ui-monospace, monospace";

const slam = (frame, fps, delay = 0) =>
  spring({ frame: frame - delay, fps, config: { damping: 11, stiffness: 220, mass: 0.7 } });

const blink = (frame, period = 16) => (Math.floor(frame / period) % 2 === 0 ? 1 : 0);

// hard black inset frame on every scene
const Frame = ({ children, bg = C.bg }) => (
  <AbsoluteFill style={{ backgroundColor: bg, border: `14px solid ${C.ink}`, boxSizing: "border-box" }}>
    {children}
  </AbsoluteFill>
);

const Center = ({ children, gap = 30 }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap }}>
    {children}
  </AbsoluteFill>
);

// 1 — LOGO
const SceneLogo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = slam(frame, fps);
  const tag = slam(frame, fps, 12);
  return (
    <Frame>
      <Center>
        <div style={{ fontFamily: HEAVY, fontWeight: 900, fontSize: 250, color: C.ink, letterSpacing: -8, transform: `scale(${s})` }}>
          MARKUS
        </div>
        <div style={{ transform: `scaleX(${tag})`, transformOrigin: "center", background: C.blue, color: "#fff", fontFamily: MONO, fontWeight: 700, fontSize: 42, padding: "12px 24px" }}>
          {"MARKDOWN -> LATEX"}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 46, color: C.ink, opacity: blink(frame) }}>_</span>
      </Center>
    </Frame>
  );
};

// 2 — WRITE PLAIN TEXT (code -> pdf)
const MKS_SRC = `---
title: Attention
author: A. Vaswani
---

# Results

Self-attention is
$O(n^2 \\cdot d)$.

| Model | BLEU |
|-------|------|
| Ours  | 28.4 |`;

const SceneWrite = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const h = slam(frame, fps);
  const code = slam(frame, fps, 14);
  const pdf = slam(frame, fps, 34);
  return (
    <Frame>
      <AbsoluteFill style={{ padding: 70, flexDirection: "column", gap: 40 }}>
        <div style={{ fontFamily: HEAVY, fontWeight: 900, fontSize: 96, color: C.ink, letterSpacing: -3, transform: `translateX(${interpolate(h, [0, 1], [-40, 0])}px)`, opacity: h }}>
          WRITE PLAIN TEXT.
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 30 }}>
          <div style={{ flex: 1, border: `8px solid ${C.ink}`, background: "#fff", transform: `translateY(${interpolate(code, [0, 1], [60, 0])}px)`, opacity: code }}>
            <div style={{ background: C.ink, color: "#fff", fontFamily: MONO, fontWeight: 700, fontSize: 28, padding: "8px 16px" }}>DOC.MKS</div>
            <pre style={{ margin: 0, padding: 20, fontFamily: MONO, fontSize: 28, lineHeight: 1.4, color: C.ink, whiteSpace: "pre" }}>{MKS_SRC}</pre>
          </div>
          <div style={{ fontFamily: HEAVY, fontWeight: 900, fontSize: 90, color: C.blue }}>{"->"}</div>
          <div style={{ flex: 1, border: `8px solid ${C.ink}`, background: C.blue, color: "#fff", alignSelf: "stretch", transform: `scale(${pdf})`, opacity: pdf, display: "flex", flexDirection: "column" }}>
            <div style={{ background: C.ink, color: "#fff", fontFamily: MONO, fontWeight: 700, fontSize: 28, padding: "8px 16px" }}>DOC.PDF</div>
            <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
              <div style={{ fontFamily: HEAVY, fontWeight: 900, fontSize: 44 }}>RESULTS</div>
              {[90, 80, 95, 60, 84].map((w, i) => (
                <div key={i} style={{ height: 14, width: `${w}%`, background: "rgba(255,255,255,0.85)" }} />
              ))}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Frame>
  );
};

// 3 — FEATURES (words slam, marquee)
const Marquee = ({ text, bottom = 36 }) => {
  const frame = useCurrentFrame();
  const x = -((frame * 7) % 1200);
  return (
    <div style={{ position: "absolute", bottom, left: 0, right: 0, overflow: "hidden", borderTop: `6px solid ${C.ink}`, borderBottom: `6px solid ${C.ink}`, background: C.yellow }}>
      <div style={{ whiteSpace: "nowrap", transform: `translateX(${x}px)`, fontFamily: MONO, fontWeight: 700, fontSize: 40, padding: "8px 0", color: C.ink }}>
        {(text + "   ").repeat(20)}
      </div>
    </div>
  );
};

const SceneFeatures = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = ["MATH.", "CITATIONS.", "TABLES.", "THEOREMS."];
  return (
    <Frame>
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 70px", gap: 6 }}>
        {words.map((w, i) => {
          const s = slam(frame, fps, i * 10);
          const accent = i % 2 === 1;
          return (
            <div key={w} style={{ fontFamily: HEAVY, fontWeight: 900, fontSize: 150, lineHeight: 0.92, letterSpacing: -5, color: accent ? C.blue : C.ink, transform: `translateX(${interpolate(s, [0, 1], [-60, 0])}px)`, opacity: s }}>
              {w}
            </div>
          );
        })}
      </AbsoluteFill>
      <Marquee text="* MARKDOWN SIMPLE * LATEX QUALITY *" />
    </Frame>
  );
};

// 4 — YOUR FILES + PRICE
const ScenePrice = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = slam(frame, fps);
  const b = slam(frame, fps, 20);
  return (
    <Frame>
      <Center gap={44}>
        <div style={{ fontFamily: HEAVY, fontWeight: 900, fontSize: 110, color: C.ink, letterSpacing: -4, textAlign: "center", opacity: a, transform: `scale(${a})` }}>
          YOUR DRIVE.<br />YOUR FILES.
        </div>
        <div style={{ background: C.yellow, border: `10px solid ${C.ink}`, padding: "18px 40px", transform: `rotate(${interpolate(b, [0, 1], [-4, -2])}deg) scale(${b})`, opacity: b }}>
          <span style={{ fontFamily: HEAVY, fontWeight: 900, fontSize: 96, color: C.ink }}>{"₹9 / 2 MONTHS"}</span>
        </div>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 40, color: C.blue, opacity: b }}>FREE TO START</div>
      </Center>
    </Frame>
  );
};

// 5 — CTA
const SceneCTA = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = slam(frame, fps);
  return (
    <Frame bg={C.blue}>
      <Center gap={36}>
        <div style={{ fontFamily: HEAVY, fontWeight: 900, fontSize: 140, color: "#fff", letterSpacing: -5, textAlign: "center", transform: `scale(${s})` }}>
          OPEN<br />MARKUS STUDIO
        </div>
        <div style={{ background: "#fff", border: `8px solid ${C.ink}`, padding: "14px 28px", opacity: blink(frame, 22) ? 1 : 0.35 }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 46, color: C.ink }}>markus-studio.netlify.app</span>
        </div>
      </Center>
    </Frame>
  );
};

export const Teaser = () => (
  <AbsoluteFill style={{ backgroundColor: C.ink }}>
    <Series>
      <Series.Sequence durationInFrames={75}><SceneLogo /></Series.Sequence>
      <Series.Sequence durationInFrames={110}><SceneWrite /></Series.Sequence>
      <Series.Sequence durationInFrames={95}><SceneFeatures /></Series.Sequence>
      <Series.Sequence durationInFrames={85}><ScenePrice /></Series.Sequence>
      <Series.Sequence durationInFrames={85}><SceneCTA /></Series.Sequence>
    </Series>
  </AbsoluteFill>
);
