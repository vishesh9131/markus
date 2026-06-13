"use client";

import { useEffect, useRef } from "react";

// A small Three.js scene: a fanned stack of "manuscript pages" gently floating
// and rotating — a nod to what Markus makes. Monochrome, theme-aware, subtle.
export default function HeroCanvas() {
  const mountRef = useRef(null);

  useEffect(() => {
    let raf = 0;
    let renderer, scene, camera, group, onResize;
    let disposed = false;

    (async () => {
      const THREE = await import("three");
      const mount = mountRef.current;
      if (!mount || disposed) return;

      const dark = document.documentElement.dataset.theme === "dark";
      const sheetColor = dark ? "#222831" : "#ffffff";
      const inkColor = dark ? "#e8e3d0" : "#1a1916";

      const w = mount.clientWidth;
      const h = mount.clientHeight;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
      camera.position.set(0, 0, 9);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      mount.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const key = new THREE.DirectionalLight(0xffffff, 0.9);
      key.position.set(4, 6, 8);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 0.35);
      rim.position.set(-6, -2, 4);
      scene.add(rim);

      // a page texture with faint "text" lines drawn on a canvas
      function pageTexture() {
        const c = document.createElement("canvas");
        c.width = 512;
        c.height = 680;
        const ctx = c.getContext("2d");
        ctx.fillStyle = sheetColor;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = inkColor;
        // heading
        ctx.globalAlpha = 0.9;
        ctx.fillRect(60, 70, 240, 26);
        // body lines
        ctx.globalAlpha = 0.45;
        let y = 140;
        for (let i = 0; i < 16; i++) {
          const lw = 360 - (i % 4) * 40 - (Math.random() * 40);
          ctx.fillRect(60, y, Math.max(120, lw), 10);
          y += 30;
          if (i === 5 || i === 11) y += 16; // paragraph gaps
        }
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 4;
        return tex;
      }

      group = new THREE.Group();
      scene.add(group);

      const geo = new THREE.BoxGeometry(2.7, 3.6, 0.04);
      const N = 5;
      const pages = [];
      for (let i = 0; i < N; i++) {
        const tex = pageTexture();
        const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
        const side = new THREE.MeshStandardMaterial({ color: sheetColor, roughness: 0.95 });
        // [ +x, -x, +y, -y, +z(front), -z ]
        const mats = [side, side, side, side, front, side];
        const mesh = new THREE.Mesh(geo, mats);
        const t = (i - (N - 1) / 2) / N;
        mesh.position.set(t * 2.4, -t * 0.7, i * 0.16);
        mesh.rotation.set(0.18, -0.5 + t * 0.5, t * 0.5);
        mesh.userData.phase = Math.random() * Math.PI * 2;
        group.add(mesh);
        pages.push(mesh);
      }
      group.rotation.x = -0.12;

      const start = performance.now();
      function animate(now) {
        const t = (now - start) / 1000;
        group.rotation.y = Math.sin(t * 0.25) * 0.35;
        group.position.y = Math.sin(t * 0.6) * 0.12;
        pages.forEach((p, i) => {
          p.position.y += Math.sin(t * 0.8 + p.userData.phase) * 0.0008 * (i + 1);
        });
        renderer.render(scene, camera);
        raf = requestAnimationFrame(animate);
      }
      raf = requestAnimationFrame(animate);

      onResize = () => {
        const nw = mount.clientWidth;
        const nh = mount.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener("resize", onResize);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (onResize) window.removeEventListener("resize", onResize);
      if (renderer) {
        renderer.dispose();
        renderer.domElement?.remove();
      }
    };
  }, []);

  return <div className="hero-canvas" ref={mountRef} aria-hidden="true" />;
}
