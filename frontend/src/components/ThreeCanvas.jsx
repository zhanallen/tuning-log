import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF, useProgress } from '@react-three/drei';
import { Loader2 } from 'lucide-react';
import { useStore, PARAM_CONFIGS, getVehicleConfig } from '../store';
import * as THREE from 'three';

// 3D Model Renderer component
function CarModel({ modelPath, activePartKey }) {
  const { scene } = useGLTF(modelPath);
  const currentVehicle = useStore(state => state.currentVehicle);
  
  // Read scale multiplier directly from the vehicle configuration (default to 1.0)
  const scaleMultiplier = currentVehicle?.model_scale !== undefined ? currentVehicle.model_scale : 1.0;

  // Real-world car length (meters) drives the auto-fit; fall back to a typical
  // sports-car length when the vehicle has none configured.
  const targetLength = currentVehicle?.length_m ? parseFloat(currentVehicle.length_m) : 4.1;

  // Retrieve model offset from dynamic config
  const config = getVehicleConfig(currentVehicle);
  const [offsetX, offsetY, offsetZ] = config.modelOffset;

  useEffect(() => {
    if (scene) {
      // Reset scale and position offsets first to do clean measurements
      scene.scale.setScalar(1.0);
      scene.position.set(0, 0, 0);
      scene.updateMatrixWorld(true);

      // Measure in the scene's OWN local space, independent of the parent
      // groups (model_scale / modelOffset). child.matrixWorld bakes in the
      // current model_scale, so measuring with it computed a baseScale that
      // only matched at that scale — lowering the slider afterwards shrank the
      // car. Taking each mesh transform relative to the scene root cancels any
      // parent transform, making baseScale constant regardless of model_scale.
      const sceneInv = scene.matrixWorld.clone().invert();

      // 1. Measure the bounding box of car meshes only (ignore ground/skys)
      const box = new THREE.Box3();
      let hasMesh = false;

      scene.traverse((child) => {
        if (child.isMesh) {
          const name = child.name.toLowerCase();
          // Skip environment nodes, helper points, cameras, or ground planes
          if (
            name.includes('ground') || 
            name.includes('floor') || 
            name.includes('plane') || 
            name.includes('sky') || 
            name.includes('helper') ||
            name.includes('camera') ||
            name.includes('light')
          ) {
            return;
          }

          if (child.geometry) {
            if (!child.geometry.boundingBox) {
              child.geometry.computeBoundingBox();
            }
            const localMatrix = sceneInv.clone().multiply(child.matrixWorld);
            const meshBox = child.geometry.boundingBox.clone().applyMatrix4(localMatrix);
            if (!hasMesh) {
              box.copy(meshBox);
              hasMesh = true;
            } else {
              box.union(meshBox);
            }
          }
        }
      });

      if (hasMesh) {
        const size = new THREE.Vector3();
        box.getSize(size);
        
        const center = new THREE.Vector3();
        box.getCenter(center);

        // 2. Base scale factor to normalize the model's longest horizontal
        //    dimension to the vehicle's real-world length (targetLength, meters).
        //    Use the model's TRUE measured length so any model — regardless of
        //    its native unit scale — auto-fits. Only a tiny epsilon guards
        //    against a degenerate/empty bounding box. (The previous 1.0 floor
        //    mis-scaled models whose native units were < 1 unit long, forcing
        //    the admin to manually crank model_scale up to ~20x.)
        const currentLength = Math.max(size.z, size.x, 0.0001);
        const baseScale = targetLength / currentLength;
        
        // 3. Normalize the inner scene object once
        scene.scale.setScalar(baseScale);
        scene.position.x = -center.x * baseScale;
        scene.position.z = -center.z * baseScale;
        scene.position.y = -box.min.y * baseScale;
      }
    }
  }, [scene, targetLength]); // Re-normalize on load and when the target car length changes

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        // standard material adjustment
        if (child.material) {
          child.material.roughness = 0.2;
          child.material.metalness = 0.8;
        }

        // Transparency logic when adjusting suspension (as required by SDD)
        const isBodyPart = child.name.toLowerCase().includes('body') || 
                           child.name.toLowerCase().includes('door') || 
                           child.name.toLowerCase().includes('hood') || 
                           child.name.toLowerCase().includes('fender') || 
                           child.name.toLowerCase().includes('bumper') || 
                           child.name.toLowerCase().includes('window') || 
                           child.name.toLowerCase().includes('glass') || 
                           child.name.toLowerCase().includes('paint') || 
                           child.name.toLowerCase().includes('carbon') || 
                           child.name.toLowerCase().includes('roof');
                           
        if (child.material) {
          if (activePartKey && activePartKey.startsWith('susp') && isBodyPart) {
            child.material.transparent = true;
            child.material.opacity = 0.15;
            child.material.needsUpdate = true;
          } else {
            // Restore original opacity
            if (child.material.transparent && child.material.opacity === 0.15) {
              child.material.opacity = 1.0;
              child.material.transparent = false;
              child.material.needsUpdate = true;
            }
          }
        }
      }
    });
  }, [scene, activePartKey]);

  return (
    <group scale={[scaleMultiplier, scaleMultiplier, scaleMultiplier]}>
      <group position={[offsetX, offsetY, offsetZ]}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

// Camera Lerping and Orbit Target Controller (Smooth and Non-blocking)
function CameraController({ activePartKey }) {
  const { camera, controls } = useThree();
  const currentVehicle = useStore(state => state.currentVehicle);
  const config = getVehicleConfig(currentVehicle);

  const scaleMultiplier = currentVehicle?.model_scale !== undefined ? currentVehicle.model_scale : 1.0;

  const [animating, setAnimating] = useState(false);
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());

  // Dynamic Focus targets based on calibrated hotspots
  const fl = config.hotspots.pressure_fl;
  const fr = config.hotspots.pressure_fr;
  const rl = config.hotspots.pressure_rl;
  const rr = config.hotspots.pressure_rr;
  const af = config.hotspots.aero_f;
  const ar = config.hotspots.aero_r;
  
  const shf = config.hotspots.susp_h_f;
  const sdf = config.hotspots.susp_d_f;
  const shr = config.hotspots.susp_h_r;
  const sdr = config.hotspots.susp_d_r;

  const dynamicTargets = {
    pressure_fl: { pos: [fl[0] - 1.05, fl[1] + 0.35, fl[2] + 0.55], look: fl },
    pressure_fr: { pos: [fr[0] + 1.05, fr[1] + 0.35, fr[2] + 0.55], look: fr },
    pressure_rl: { pos: [rl[0] - 1.02, rl[1] + 0.35, rl[2] - 0.55], look: rl },
    pressure_rr: { pos: [rr[0] + 1.02, rr[1] + 0.35, rr[2] - 0.55], look: rr },
    aero_f: { pos: [af[0], af[1] + 0.85, af[2] + 1.1], look: af },
    aero_r: { pos: [ar[0], ar[1] + 0.65, ar[2] - 1.1], look: ar },
    susp_h_f: { pos: [shf[0] - 1.25, shf[1] + 0.4, shf[2] + 0.25], look: shf },
    susp_d_f: { pos: [sdf[0] + 1.25, sdf[1] + 0.4, sdf[2] + 0.25], look: sdf },
    susp_h_r: { pos: [shr[0] - 1.25, shr[1] + 0.4, shr[2] - 0.25], look: shr },
    susp_d_r: { pos: [sdr[0] + 1.25, sdr[1] + 0.4, sdr[2] - 0.25], look: sdr },
  };

  // Trigger lerping camera to focus position (both target and close-up position) when activePartKey changes
  useEffect(() => {
    if (activePartKey && dynamicTargets[activePartKey]) {
      const t = dynamicTargets[activePartKey];
      targetPos.current.set(t.pos[0], t.pos[1], t.pos[2]);
      targetLook.current.set(t.look[0], t.look[1], t.look[2]);
    } else {
      // Default overview position
      targetPos.current.set(3.2, 1.8, 4.2);
      targetLook.current.set(0, 0.45, 0);
    }
    setAnimating(true);
  }, [activePartKey]);

  // Update controls target coordinate instantly when active hotspot coordinates change
  // so that rotation center matches the moving hotspot, but without resetting camera position/zoom.
  useEffect(() => {
    if (activePartKey && dynamicTargets[activePartKey] && controls) {
      const t = dynamicTargets[activePartKey];
      controls.target.set(t.look[0], t.look[1], t.look[2]);
      controls.update();
    }
  }, [activePartKey, fl, fr, rl, rr, af, ar, shf, sdf, shr, sdr, controls]);

  // Interrupt animation if the user manually interacts with OrbitControls (drag/pan/zoom/wheel)
  useEffect(() => {
    if (!controls) return;

    const handleInteraction = () => {
      setAnimating(false);
    };

    controls.addEventListener('start', handleInteraction);
    
    // Also listen to wheel and pointer events on window to ensure zoom/rotate interrupts work
    // even if the user's cursor is positioned directly over the HTML overlay hotspots.
    window.addEventListener('wheel', handleInteraction, { passive: true });
    window.addEventListener('pointerdown', handleInteraction, { passive: true });

    return () => {
      controls.removeEventListener('start', handleInteraction);
      window.removeEventListener('wheel', handleInteraction);
      window.removeEventListener('pointerdown', handleInteraction);
    };
  }, [controls]);

  useFrame(() => {
    if (!animating) return;

    // Lerp camera position
    camera.position.lerp(targetPos.current, 0.05);

    // Lerp OrbitControls target
    if (controls) {
      controls.target.lerp(targetLook.current, 0.05);
      controls.update();
    }

    // Stop animating when camera is close to target positions
    const distCam = camera.position.distanceTo(targetPos.current);
    const distLook = controls ? controls.target.distanceTo(targetLook.current) : 0;
    
    if (distCam < 0.02 && distLook < 0.02) {
      setAnimating(false);
    }
  });

  return null;
}

// Matches drei's distanceFactor behaviour so all hotspots keep a consistent size.
const HOTSPOT_DISTANCE_FACTOR = 5.5;

// Interactive Hotspot Element with hover-boosting zIndex and layering support
function HotspotElement({ spot, isSelected, currentVal, config, isAero, setActivePartKey }) {
  const [hovered, setHovered] = useState(false);
  const { camera } = useThree();
  const scaleRef = useRef(null);
  const spotVec = useRef(new THREE.Vector3());

  // Boost z-index on hover (70-80) and selection (90-100) to keep labels on top of other hotspots
  const zIndexRange = isSelected
    ? [100, 90]
    : (hovered ? [80, 70] : [30, 0]);

  // Apply the perspective scale OURSELVES every frame instead of relying on
  // drei <Html distanceFactor>. drei only recomputes that scale when the
  // element's 2D screen position changes; the selected hotspot is aimed at by
  // the camera (screen-centred), so a dolly zoom keeps its screen position
  // fixed and drei would freeze its scale at the click-moment value. Computing
  // the scale directly from camera distance updates unconditionally.
  useFrame(() => {
    if (!scaleRef.current) return;
    spotVec.current.set(spot.pos[0], spot.pos[1], spot.pos[2]);
    const dist = camera.position.distanceTo(spotVec.current);
    const vFOV = (camera.fov * Math.PI) / 180;
    const scaleFOV = 2 * Math.tan(vFOV / 2) * dist;
    const scale = (1 / scaleFOV) * HOTSPOT_DISTANCE_FACTOR;
    scaleRef.current.style.transform = `scale(${scale})`;
  });

  return (
    <Html
      position={spot.pos}
      center
      zIndexRange={zIndexRange}
    >
      <div ref={scaleRef} style={{ transformOrigin: 'center center' }}>
      <div
        className="relative flex items-center justify-center select-none group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Floating value tag on hover or selection (with z-10 to stay on top of the dot within same context) */}
        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded border text-[9px] font-mono whitespace-nowrap transition-all duration-200 z-10 backdrop-blur-md ${
          isSelected
            ? 'bg-primary-container/85 text-white border-primary-container/60 scale-105 shadow-[0_0_8px_rgba(255,92,0,0.4)]'
            : 'bg-surface-container/30 text-outline border-white/10 opacity-0 group-hover:opacity-100'
        }`}>
          {spot.name}: <span className="font-bold">{currentVal}{config?.unit}</span>
        </div>

        {/* Hotspot circular button (z-0) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActivePartKey(isSelected ? null : spot.key);
          }}
          className={`w-3.5 h-3.5 rounded-full border-2 border-background cursor-pointer transition-all duration-200 flex items-center justify-center z-0 ${
            isAero
              ? `bg-tertiary ${isSelected ? 'scale-125 shadow-[0_0_15px_#8bdc00]' : 'hotspot-pulse-aero'}`
              : `bg-primary ${isSelected ? 'scale-125 shadow-[0_0_15px_#ffb59a]' : 'hotspot-pulse-susp'}`
          }`}
        >
          <div className="w-1 h-1 bg-background rounded-full"></div>
        </button>
      </div>
      </div>
    </Html>
  );
}

// Full-canvas loading overlay shown while the GLB model downloads, so users on
// slow networks see clear progress instead of an empty/black canvas and assume
// the page froze. Driven by drei's useProgress (THREE's DefaultLoadingManager),
// which also re-fires whenever a different vehicle's model starts loading.
function ModelLoadingOverlay({ vehicleName }) {
  const { active, progress } = useProgress();

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#1a1c1e] to-[#0c0e10] transition-opacity duration-500 ${
        active ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <Loader2 className="animate-spin text-primary" size={40} strokeWidth={2.5} />

      <div className="flex flex-col items-center gap-2 w-48">
        <span className="font-display text-xs font-bold text-on-surface tracking-wide">
          載入 3D 模型中…
        </span>
        {vehicleName && (
          <span className="font-mono text-[10px] text-outline truncate max-w-full">
            {vehicleName}
          </span>
        )}

        <div className="w-full h-1 bg-surface-container-high rounded-full overflow-hidden mt-1">
          <div
            className="h-full bg-primary-container rounded-full transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="font-mono text-[10px] text-on-surface-variant">
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}

export default function ThreeCanvas() {
  const { currentVehicle, activePartKey, setActivePartKey, currentParams } = useStore();

  if (!currentVehicle) return null;

  // Read scale multiplier directly from current vehicle
  const scaleMultiplier = currentVehicle.model_scale !== undefined ? currentVehicle.model_scale : 1.0;
  const config = getVehicleConfig(currentVehicle);

  // Define Hotspot details (calibrated coordinates)
  const hotspots = [
    { key: 'pressure_fl', name: '左前輪胎壓', pos: config.hotspots.pressure_fl, type: 'tire' },
    { key: 'pressure_fr', name: '右前輪胎壓', pos: config.hotspots.pressure_fr, type: 'tire' },
    { key: 'pressure_rl', name: '左後輪胎壓', pos: config.hotspots.pressure_rl, type: 'tire' },
    { key: 'pressure_rr', name: '右後輪胎壓', pos: config.hotspots.pressure_rr, type: 'tire' },
    { key: 'aero_f', name: '前翼下壓力', pos: config.hotspots.aero_f, type: 'aero' },
    { key: 'aero_r', name: '尾翼下壓力', pos: config.hotspots.aero_r, type: 'aero' },
    
    // Front suspension
    { key: 'susp_h_f', name: '前懸吊高度', pos: config.hotspots.susp_h_f, type: 'susp' },
    { key: 'susp_d_f', name: '前懸吊阻尼', pos: config.hotspots.susp_d_f, type: 'susp' },
    
    // Rear suspension
    { key: 'susp_h_r', name: '後懸吊高度', pos: config.hotspots.susp_h_r, type: 'susp' },
    { key: 'susp_d_r', name: '後懸吊阻尼', pos: config.hotspots.susp_d_r, type: 'susp' },
  ];

  // Filter based on what parameters this vehicle allows
  const activeHotspots = hotspots.filter(h => currentVehicle.allowed_params.includes(h.key));

  // `z-0` traps the canvas + drei <Html> hotspots in their own stacking context,
  // so any HUD panel with z-index > 0 (admin calibrator, HUDPanel) always renders
  // above the hotspots and receives clicks without the hotspots blocking/stealing them.
  return (
    <div className="w-full h-full relative z-0" style={{ minHeight: '400px' }}>
      <Canvas
        shadows
        camera={{ position: [3.2, 1.8, 4.2], fov: 45 }}
        className="w-full h-full bg-gradient-to-b from-[#1a1c1e] to-[#0c0e10]"
      >
        <ambientLight intensity={0.6} />
        <directionalLight
          castShadow
          position={[5, 10, 5]}
          intensity={1.2}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-5, 5, -5]} intensity={0.5} />
        <pointLight position={[0, -2, 0]} intensity={0.3} color="#ffb59a" />

        <Suspense fallback={null}>
          <CarModel modelPath={currentVehicle.model_path} activePartKey={activePartKey} />

          {/* Render Hotspots */}
          {activeHotspots.map((spot) => {
            const isSelected = activePartKey === spot.key;
            const config = PARAM_CONFIGS[spot.key];
            const currentVal = currentParams[spot.key] !== undefined 
              ? currentParams[spot.key] 
              : config?.default || 0;

            return (
              <HotspotElement
                key={spot.key}
                spot={spot}
                isSelected={isSelected}
                currentVal={currentVal}
                config={config}
                isAero={spot.type === 'aero'}
                setActivePartKey={setActivePartKey}
              />
            );
          })}
        </Suspense>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          maxPolarAngle={Math.PI / 2 - 0.05} // don't go below ground
          minDistance={0.5}
          maxDistance={100}
        />
        
        <CameraController activePartKey={activePartKey} />
      </Canvas>

      <ModelLoadingOverlay vehicleName={currentVehicle.name} />
    </div>
  );
}
