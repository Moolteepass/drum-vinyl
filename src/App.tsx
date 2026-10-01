import {
  ContactShadows,
  Environment,
  //Gltf,
  OrbitControls,
} from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { Suspense, useState } from "react"
import { Vector3 } from "three"
import { Drum } from "./Drum"

const target = new Vector3(0.01, 0.33, -0.06)
const startPos = new Vector3()
  .setFromSphericalCoords(1.46, 1.48, 0.06)
  .add(target)

function App() {
  const [info, setInfo] = useState("")
  const [dragging, setDragging] = useState(false)

  return (
    // right-drag scales the sticker, so keep the browser menu out of the way
    <div
      className="h-screen bg-slate-700"
      onContextMenu={(e) => e.preventDefault()}
    >
      <pre className="absolute top-2 left-2 text-white text-xs z-10">
        {info}
      </pre>
      <Canvas
        className="w-full h-full"
        camera={{ fov: 50, position: startPos.toArray() }}
        gl={{ stencil: true }}
      >
        <Suspense fallback={null}>
          <Environment
            preset="studio"
            environmentIntensity={0.5}
            ground={true}
          />
          <ContactShadows
            position={[0.025, 0, 0.025]}
            opacity={0.9}
            scale={3}
            blur={2}
            far={1}
          />

          {/* <Gltf src={"/scene.gltf"} /> */}
          <Drum onDraggingChange={setDragging} />
        </Suspense>
        <OrbitControls
          onChange={(e) => {
            const change = e?.target

            if (!change) return
            const position = change.object.position
            const target = change.target
            setInfo(
              `pos: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}\n` +
                `azimuth: ${change.getAzimuthalAngle().toFixed(2)}\n` +
                `polar: ${change.getPolarAngle().toFixed(2)}\n` +
                `distance: ${change.getDistance().toFixed(2)}\n` +
                `target: ${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)}`,
            )
          }}
          minDistance={1.46}
          maxDistance={1.56}
          minPolarAngle={1.2}
          maxPolarAngle={1.6}
          minAzimuthAngle={-0.2}
          maxAzimuthAngle={0.2}
          target={target.toArray()}
          enablePan={false}
          enableDamping={true}
          dampingFactor={0.01}
          enabled={!dragging}
        />
      </Canvas>
    </div>
  )
}

export default App
