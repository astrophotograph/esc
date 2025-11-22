"use client"

import CrtMonitor from "@/components/CrtMonitor"
import {SimpleTelescopeControl} from "@/components/telescope/SimpleTelescopeControl"
import {TelescopeProvider} from "@/context/TelescopeContext"

export default function CrtDemo() {
  return (
    <TelescopeProvider>
      <div className="min-h-screen bg-neutral-900 text-neutral-100 flex items-center justify-center p-10">
        <CrtMonitor width={1024} height={720} bezelLabel="EXPERIMENTAL SCOPE CREEP 3000" curvature={0.15}>
          <div className="w-[1024px] h-[720px] bg-black">
            <div
              className="w-[1024px] h-[720] flex flex-col items-center justify-center bg-black text-amber-300 font-mono">
              <div className="text-5xl mb-6">HELLO, WORLD_</div>
              <div className="opacity-80">Press any key to continue…</div>
              {/*<SimpleTelescopeControl/>*/}
            </div>
          </div>
        </CrtMonitor>
      </div>
    </TelescopeProvider>
  )
}
