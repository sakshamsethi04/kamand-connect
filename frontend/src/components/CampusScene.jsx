import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, Stars, useGLTF, useProgress } from '@react-three/drei'
import * as THREE from 'three'

const MODEL = '/models/campus.glb'
const LIFT = 4.5 // world units a hostel rises when hovered
const TARGET = [-60, 0, 105]
// Warm pools of light near the messes at night (positions taken from the GLB)
const LAMPS = [[70, 22, 42], [165, 24, 98], [-110, 20, 153], [-93, 25, 192], [195, 18, -27], [-30, 22, 95]]

useGLTF.preload(MODEL)

function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="scene-loading">Loading campus {Math.round(progress)}%</div>
    </Html>
  )
}

function Lighting({ night }) {
  return night ? (
    <>
      <color attach="background" args={['#0c1322']} />
      <fog attach="fog" args={['#0c1322', 520, 1150]} />
      <hemisphereLight args={['#5468a8', '#0a0e16', 0.45]} />
      <directionalLight position={[-220, 320, -160]} intensity={0.45} color="#a9bbff" />
      {LAMPS.map((p, i) => <pointLight key={i} position={p} color="#ffb45e" intensity={160} distance={130} decay={1.5} />)}
      <Stars radius={700} depth={120} count={3500} factor={7} saturation={0} fade speed={0.4} />
    </>
  ) : (
    <>
      <color attach="background" args={['#d6e6ee']} />
      <fog attach="fog" args={['#d6e6ee', 650, 1350]} />
      <hemisphereLight args={['#ffffff', '#5d7b4b', 1.0]} />
      <directionalLight
        castShadow position={[160, 320, -120]} intensity={2.4} color="#fff3df"
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-380} shadow-camera-right={380} shadow-camera-top={380}
        shadow-camera-bottom={-380} shadow-camera-near={10} shadow-camera-far={1100}
      />
    </>
  )
}

function Campus({ codes, night, hovered, onHover, onSelect, online }) {
  const { scene } = useGLTF(MODEL)
  const leaveTimer = useRef()

  // Find hostel nodes by name, give them their own materials (so only they glow) and make only them pickable.
  const buildings = useMemo(() => {
    const map = new Map()
    scene.updateMatrixWorld(true)
    scene.traverse((o) => {
      // the model ships a stray 3D "B 10" text on an academic block; only our own pins label hostels
      if (o.name === 'Text') o.visible = false
      if (o.isMesh) {
        o.raycast = () => {}
        o.receiveShadow = true
        if (!o.name.startsWith('Tree')) o.castShadow = true
      }
    })
    for (const obj of scene.children) {
      const code = obj.name.replace(/\.?0\d\d$/, '') // three.js strips dots: 'B14.001' arrives as 'B14001'
      if (!codes.has(code)) continue
      obj.traverse((o) => {
        if (!o.isMesh) return
        if (!o.userData.ownMaterial) {
          o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone()
          o.userData.ownMaterial = true
        }
        o.raycast = THREE.Mesh.prototype.raycast
        o.userData.hostel = code
      })
      if (obj.userData.baseY === undefined) obj.userData.baseY = obj.position.y
      const box = new THREE.Box3().setFromObject(obj)
      const c = box.getCenter(new THREE.Vector3())
      map.set(code, { obj, baseY: obj.userData.baseY, label: [c.x, box.max.y + 3, c.z] })
    }
    return map
  }, [scene, codes])

  // Windows glow at night; hovered hostel glows amber.
  useEffect(() => {
    scene.traverse((o) => {
      if (!o.isMesh) return
      const isHovered = o.userData.hostel && o.userData.hostel === hovered
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m.emissive) continue
        const isWindow = /^(Glass|Orange)/.test(m.name)
        if (isHovered) {
          // warm-white lift: brightens the building without tinting the blue roofs purple
          m.emissive.set(isWindow && night ? '#ffd27a' : night ? '#ffe3b8' : '#fff1d6')
          m.emissiveIntensity = isWindow && night ? 2 : night ? 0.22 : 0.3
        } else if (night && isWindow) {
          m.emissive.set('#ffb04a')
          m.emissiveIntensity = 1.25
        } else {
          m.emissive.set('#000000')
          m.emissiveIntensity = 1
        }
      }
    })
  }, [scene, hovered, night])

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : ''
    return () => { document.body.style.cursor = '' }
  }, [hovered])

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 12)
    for (const [code, b] of buildings) {
      const target = b.baseY + (code === hovered ? LIFT : 0)
      b.obj.position.y += (target - b.obj.position.y) * k
    }
  })

  // A short grace period stops flicker when the lifted building slides out from under the cursor.
  const enter = (code) => { clearTimeout(leaveTimer.current); onHover(code) }
  const leave = () => { clearTimeout(leaveTimer.current); leaveTimer.current = setTimeout(() => onHover(null), 140) }

  return (
    <>
      <primitive
        object={scene}
        onPointerOver={(e) => { const h = e.object.userData.hostel; if (h) { e.stopPropagation(); enter(h) } }}
        onPointerOut={(e) => { if (e.object.userData.hostel) leave() }}
        onClick={(e) => { const h = e.object.userData.hostel; if (h) { e.stopPropagation(); onSelect(h) } }}
      />
      {[...buildings].map(([code, b]) => {
        const on = code === hovered
        return (
          <Html key={code} position={[b.label[0], b.label[1] + (on ? LIFT : 0), b.label[2]]} center zIndexRange={[on ? 30 : 20, 0]}>
            <button
              className={`pin ${on ? 'on' : ''} ${night ? 'night' : ''}`}
              onPointerEnter={() => enter(code)}
              onPointerLeave={leave}
              onClick={() => onSelect(code)}
              aria-label={`Open ${code} chat`}
            >
              {code}
              {online[code.toLowerCase()] > 0 && <span className="pin-online" aria-label={`${online[code.toLowerCase()]} online`}>{online[code.toLowerCase()]}</span>}
              {on && <span className="pin-hint">{online[code.toLowerCase()] ? `${online[code.toLowerCase()]} chatting · open` : 'Open chat'}</span>}
            </button>
          </Html>
        )
      })}
    </>
  )
}

export default function CampusScene({ hostelCodes, night, hovered, onHover, onSelect, online = {} }) {
  const codes = useMemo(() => new Set(hostelCodes), [hostelCodes])
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [-60, 250, -225], fov: 40, near: 1, far: 3000 }}
      gl={{ antialias: true }} onPointerMissed={() => onHover(null)}>
      <Lighting night={night} />
      <Suspense fallback={<Loader />}>
        <Campus codes={codes} night={night} hovered={hovered} onHover={onHover} onSelect={onSelect} online={online} />
      </Suspense>
      <OrbitControls target={TARGET} enableDamping dampingFactor={0.08} minDistance={110} maxDistance={620}
        maxPolarAngle={1.2} minPolarAngle={0.25} screenSpacePanning={false} />
    </Canvas>
  )
}
