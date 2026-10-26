import '@/utils/three-polyfill';

import { Ionicons } from '@expo/vector-icons';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber/native';
import { useGLTF, useProgress } from '@react-three/drei/native';
import { Component, Suspense, useCallback, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as THREE from 'three';

import { T } from '@/components/ui';
import { C, R, S } from '@/constants/theme';

// Interactive 3D car viewer — mobile only (iOS/Android).
//
// Library choice (documented per the owner's "sperimenta" request): expo-gl + @react-three/fiber/native +
// @react-three/drei/native. This is the most mature path for real-time 3D in an Expo managed app: expo-gl
// provides the native WebGL-ish context, @react-three/fiber lets three.js scenes be written as React
// components, and drei's `useGLTF` is the one GLTFLoader wrapper that is actually wired for React Native
// (it resolves a bundled asset via expo-asset/expo-file-system; three's stock GLTFLoader expects a browser
// `fetch`/`Image` which don't exist on native). Alternatives considered: expo-three (older, less maintained,
// superseded in practice by expo-gl + r3f) and a 2.5D sprite fallback (rejected: the owner explicitly asked
// for real, interactive 3D).
//
// Platform support: expo-gl requires a **development build** — it does not run inside Expo Go (same
// constraint as expo-maps, see map.tsx). expo-gl and @react-three/fiber/native do ship web implementations
// in principle, but that path was never exercised here (no browser/device available while building this),
// so — to avoid silently shipping a broken web bundle — the web build uses the honest fallback in
// car-3d-view.web.tsx instead, same pattern as map.tsx/map.web.tsx.
//
// Model: a generic "concept car" glTF (assets/models/car-concept.glb), not an Alfa Romeo Giulia — no
// free, clearly-licensed Giulia 3D model was found. Labelled "illustrativo" in the UI; full credit and
// licence are in src/app/profile.tsx (Crediti), same standard as the hero photo.
// Same "one object, inline require()" shape as HERO_PHOTO in car-illustration.tsx, so swapping the 3D
// asset later is a one-line change here too.
const CAR_MODEL = { source: require('../../assets/models/car-concept.glb') as string };

// The model's own scale/origin are whatever the source file ships with; normalising them at runtime
// (see CarModel below) means this constant is the only thing to tune if the asset is ever swapped.
const TARGET_SIZE = 2.4; // world units the model's longest side is scaled to
const AUTO_ROTATE_SPEED = 0.18; // rad/s, only while the user isn't dragging
const DRAG_SENSITIVITY = 3.6; // radians of rotation per full (-1..1) pointer sweep
const MAX_TILT = Math.PI / 7; // clamp vertical orbit so the car can't be flipped upside down

function CarModel() {
  const { scene } = useGLTF(CAR_MODEL.source);

  // Neutralise glTF `KHR_materials_transmission` (the car-concept model's "Glass" material uses it for
  // the windows) before the scene is ever rendered. three.js decides per-material, at render-list build
  // time, whether an object is "transmissive" purely from `material.transmission > 0` (see
  // node_modules/three/build/three.module.js, function `push` inside WebGLRenderList — the only check is
  // `material.transmission > 0.0`). Any transmissive object makes three.js run `renderTransmissionPass`,
  // which allocates an internal multisampled render target via `renderbufferStorageMultisample()` — a
  // WebGL2 call expo-gl does not implement, so it throws "Exception in HostFunction" and crashes the app
  // (this happens inside the requestAnimationFrame render loop, outside React's render phase, so a React
  // Error Boundary like ModelErrorBoundary below cannot catch it). Zeroing `transmission` on every
  // material is checked every frame at push-time, so this single pass over the materials — run once per
  // load — is sufficient to keep the scene out of the transmissive path for good. The glass still reads
  // as glass via transparency/opacity instead of true refraction.
  useMemo(() => {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) {
          material.transmission = 0;
          material.transparent = true;
          material.opacity = 0.35;
        }
      }
    });
  }, [scene]);

  // Centre and scale the model once per load instead of hand-measuring constants (the source file's
  // units/pivot aren't guaranteed): mirrors the "measure once, keep it swappable" approach already used
  // for the hero photo in car-illustration.tsx.
  const { scale, center } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const boxCenter = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(boxCenter);
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    return { scale: TARGET_SIZE / maxDimension, center: boxCenter };
  }, [scene]);

  return (
    <group scale={scale}>
      <group position={[-center.x, -center.y, -center.z]}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

function Scene({ interactingRef }: { interactingRef: MutableRefObject<boolean> }) {
  const groupRef = useRef<THREE.Group>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  useFrame((_, delta) => {
    if (groupRef.current && !interactingRef.current) {
      groupRef.current.rotation.y += delta * AUTO_ROTATE_SPEED;
    }
  });

  const startDrag = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      interactingRef.current = true;
      lastPointer.current = { x: e.pointer.x, y: e.pointer.y };
    },
    [interactingRef],
  );

  const moveDrag = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!lastPointer.current || !groupRef.current) return;
    const dx = e.pointer.x - lastPointer.current.x;
    const dy = e.pointer.y - lastPointer.current.y;
    lastPointer.current = { x: e.pointer.x, y: e.pointer.y };
    groupRef.current.rotation.y += dx * DRAG_SENSITIVITY;
    groupRef.current.rotation.x = THREE.MathUtils.clamp(groupRef.current.rotation.x - dy * DRAG_SENSITIVITY, -MAX_TILT, MAX_TILT);
  }, []);

  const endDrag = useCallback(() => {
    lastPointer.current = null;
    interactingRef.current = false;
  }, [interactingRef]);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 2]} intensity={1.1} />
      {/* Invisible plane, placed between the camera and the model and sized to always cover the
          viewport: it is the single drag surface, so rotation starts the same way whether the finger
          lands on the car's own geometry or the empty background around it. `onLostPointerCapture` is
          needed in addition to `onPointerUp`: the parent Screen is a ScrollView, which can steal the
          touch responder mid-gesture (see the native event mapping in @react-three/fiber/native), and
          that path only fires `lostpointercapture`, not `pointerup`. */}
      <mesh
        position={[0, 0, 2]}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onLostPointerCapture={endDrag}>
        <planeGeometry args={[30, 30]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <group ref={groupRef}>
        <CarModel />
      </group>
    </>
  );
}

class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Message only, never the stack/asset path: keeps this consistent with the rest of the app's rule
    // of never logging more than needed to diagnose (see uconnect/errors.ts).
    console.warn('[car-3d-view] modello 3D non caricato:', error.message);
  }

  render() {
    if (this.state.failed) {
      return (
        <View style={styles.message}>
          <Ionicons name="cube-outline" size={28} color={C.textMuted} />
          <T variant="secondary">Il modello 3D non è disponibile al momento.</T>
        </View>
      );
    }
    return this.props.children;
  }
}

/** Interactive 3D viewer for the "Servizi" screen. See the top of this file for the library choice and limits. */
export function Car3DView() {
  const { height: windowHeight } = useWindowDimensions();
  const viewHeight = Math.max(windowHeight * 0.4, 320);
  const interactingRef = useRef(false);

  return (
    <View style={[styles.wrap, { height: viewHeight }]}>
      <ModelErrorBoundary>
        <Canvas style={{ backgroundColor: C.surface }} camera={{ position: [0, 0.55, 4.8], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0)}>
          <Suspense fallback={null}>
            <Scene interactingRef={interactingRef} />
          </Suspense>
        </Canvas>
      </ModelErrorBoundary>
      <CanvasLoadingOverlay />
    </View>
  );
}

// useProgress (drei) reads three's global DefaultLoadingManager, so it can sit outside the Canvas/Suspense
// tree and show a plain React Native spinner instead of needing a Three.js-renderable fallback.
function CanvasLoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <View style={styles.overlay} pointerEvents="none">
      <ActivityIndicator color={C.accent} />
      <T variant="caption">{`Caricamento modello 3D… ${Math.round(progress)}%`}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: R.sm, overflow: 'hidden' },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.sm },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: C.surface },
});
