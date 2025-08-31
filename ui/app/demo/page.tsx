"use client"

import CrtMonitor from "@/components/CrtMonitor"
import { SimpleTelescopeControl } from "@/components/telescope/SimpleTelescopeControl"
import { TelescopeProvider } from "@/context/TelescopeContext"

export default function CrtDemo() {
  return (
    <TelescopeProvider>
      <div className="min-h-screen bg-neutral-900 text-neutral-100 flex items-center justify-center p-10">
        <CrtMonitor width={1024} height={720} bezelLabel="VINTAGE-3200" curvature={0.15}>
          <div className="w-[1024px] h-[720px] bg-black">
            <SimpleTelescopeControl />
          </div>
        </CrtMonitor>
      </div>
    </TelescopeProvider>
  )
}
