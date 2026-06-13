"use client";

import { useEffect, useRef, useState } from "react";

// A refined Three.js scene: a small, gently-floating stack of rounded
// manuscript pages with a soft contact shadow — a calm nod to what Markus
// makes. Monochrome, theme-aware, with light pointer parallax.
export default function HeroCanvas() {
  const mountRef = useRef(null);
  const [nonce, setNonce] = useState(0);

  // rebuild the scene with new colours when the theme changes
  useEffect(() => {
    const onTheme = () => setNonce((n) => n + 1);
    window.addEventListener("markus-theme", onTheme);
    return () => window.removeEventListener("markus-theme", onTheme);
  }, []);

  useEffect(() => {
    let raf = 0;
    let renderer, scene, camera, onResize, onPointer;
    let disposed = false;

    (async () => {
      const THREE = await import("three");
      const mount = mountRef.current;
      if (!mount || disposed) return;

      const dark = document.documentElement.dataset.theme === "dark";
      const pageColor = dark ? 0x2a313b : 0xffffff;
      const edgeColor = dark ? 0x202730 : 0xece9e0;
      const inkColor = dark ? 0xe8e3d0 : 0x1a1916;

      const w = mount.clientWidth;
      const h = mount.clientHeight || 460;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
      camera.position.set(0, 0.4, 10);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      mount.appendChild(renderer.domElement);

      // lighting — soft and directional
      scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.55 : 0.75));
      const key = new THREE.DirectionalLight(0xffffff, dark ? 0.7 : 0.85);
      key.position.set(5, 7, 6);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.3);
      fill.position.set(-6, -1, 4);
      scene.add(fill);

      // rounded-rectangle page geometry
      function roundedRect(width, height, r) {
        const s = new THREE.Shape();
        const x = -width / 2;
        const y = -height / 2;
        s.moveTo(x + r, y);
        s.lineTo(x + width - r, y);
        s.quadraticCurveTo(x + width, y, x + width, y + r);
        s.lineTo(x + width, y + height - r);
        s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        s.lineTo(x + r, y + height);
        s.quadraticCurveTo(x, y + height, x, y + height - r);
        s.lineTo(x, y + r);
        s.quadraticCurveTo(x, y, x + r, y);
        return s;
      }
      const PW = 3.0;
      const PH = 3.9;
      const geo = new THREE.ExtrudeGeometry(roundedRect(PW, PH, 0.22), {
        depth: 0.06,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 2,
        steps: 1,
      });
      geo.center();

      const pageMat = new THREE.MeshStandardMaterial({ color: pageColor, roughness: 0.65, metalness: 0 });
      const edgeMat = new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.8 });

      const group = new THREE.Group();
      scene.add(group);

      // a neat fanned stack of 3 pages
      const layout = [
        { x: -0.5, y: -0.32, z: -0.5, rot: 0.16 },
        { x: 0.18, y: 0.0, z: -0.2, rot: -0.05 },
        { x: 0.05, y: 0.18, z: 0.18, rot: -0.12 },
      ];
      let topPage;
      layout.forEach((p, i) => {
        const mesh = new THREE.Mesh(geo, [pageMat, edgeMat]);
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.z = p.rot;
        group.add(mesh);
        if (i === layout.length - 1) topPage = mesh;
      });

      // fine "text" on the top page (title bar + body lines), as thin meshes
      const lineMat = new THREE.MeshStandardMaterial({
        color: inkColor,
        roughness: 0.9,
        transparent: true,
        opacity: dark ? 0.5 : 0.42,
      });
      const titleMat = new THREE.MeshStandardMaterial({ color: inkColor, roughness: 0.9, transparent: true, opacity: dark ? 0.8 : 0.7 });
      const faceZ = 0.05;
      const title = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.012), titleMat);
      title.position.set(-0.45, 1.2, faceZ);
      topPage.add(title);
      const lineWidths = [2.1, 2.0, 1.7, 2.05, 1.4, 1.95, 2.0, 1.6, 1.85, 1.2];
      lineWidths.forEach((lw, i) => {
        const line = new THREE.Mesh(new THREE.BoxGeometry(lw, 0.075, 0.01), lineMat);
        line.position.set(-1.2 + lw / 2, 0.7 - i * 0.3, faceZ);
        topPage.add(line);
      });
      group.rotation.x = -0.16;

      // soft contact shadow (radial-gradient sprite on a flat plane)
      const sc = document.createElement("canvas");
      sc.width = sc.height = 256;
      const sctx = sc.getContext("2d");
      const grad = sctx.createRadialGradient(128, 128, 10, 128, 128, 128);
      grad.addColorStop(0, "rgba(0,0,0,0.32)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 256, 256);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 5),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, opacity: dark ? 0.5 : 0.35, depthWrite: false })
      );
      shadow.position.set(0, -2.5, -0.5);
      shadow.rotation.x = -Math.PI / 2.5;
      scene.add(shadow);

      // gentle pointer parallax
      let px = 0;
      let py = 0;
      let tx = 0;
      let ty = 0;
      onPointer = (e) => {
        const r = mount.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
        ty = ((e.clientY - r.top) / r.height - 0.5) * 0.3;
      };
      mount.addEventListener("pointermove", onPointer);
      mount.addEventListener("pointerleave", () => { tx = 0; ty = 0; });

      const start = performance.now();
      function animate(now) {
        const t = (now - start) / 1000;
        px += (tx - px) * 0.05;
        py += (ty - py) * 0.05;
        group.rotation.y = Math.sin(t * 0.3) * 0.28 + px;
        group.rotation.x = -0.16 + py;
        group.position.y = Math.sin(t * 0.7) * 0.1;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(animate);
      }
      raf = requestAnimationFrame(animate);

      onResize = () => {
        const nw = mount.clientWidth;
        const nh = mount.clientHeight || 460;
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
  }, [nonce]);

  return <div className="hero-canvas" ref={mountRef} aria-hidden="true" />;
}
