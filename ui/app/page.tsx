"use client"

import {useEffect} from "react"
import TelescopeControl from "../telescope-control"
import {initializeMonitoring} from "@/utils/monitoring"

export default function Page() {
  useEffect(() => {
    // Initialize monitoring when the app loads
    initializeMonitoring()
  }, [])

  // return (
  //   <div className="min-h-screen bg-neutral-900 text-neutral-100 flex items-center justify-center p-10">
  //     <CrtMonitor width={1024} height={720} bezelLabel="VINTAGE-3200" curvature={0.15}>
  //       <div className="w-[1024px] h-[720] flex flex-col items-center justify-center bg-black text-amber-300 font-mono">
  //         <div className="text-5xl mb-6">HELLO, WORLD_</div>
  //         <div className="opacity-80">Press any key to continue…</div>
  //         {/*<TelescopeControl/>*/}
  //       </div>
  //     </CrtMonitor>
  //   </div>
  // )

  return (
    <div>
       <TelescopeControl/>
     </div>
  )
}
