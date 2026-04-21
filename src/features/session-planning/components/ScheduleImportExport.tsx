import { useRef } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { useSchedulerStore } from '../../../stores/schedulerStore'
import { exportScheduleToJson, importScheduleFromJson } from '../utils/scheduleSerialization'
import { toast } from '../../../hooks/useToast'
import { invoke } from '../../../services/api'

export function ScheduleImportExport() {
  const { schedule, importSchedule } = useSchedulerStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    const json = exportScheduleToJson(schedule)
    const safeName = schedule.planName.replace(/[^a-zA-Z0-9_-]/g, '_')
    const today = new Date().toISOString().slice(0, 10)
    const filename = `${safeName}-${today}.json`

    try {
      const savedPath = await invoke<string>('planning_save_file', { filename, content: json })
      toast({ title: `Exported "${schedule.planName}"`, description: savedPath })
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    }
  }

  const handleImport = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const imported = importScheduleFromJson(text)
      importSchedule(imported)
      toast({
        title: `Imported "${imported.planName}"`,
        description: `${imported.targets.length} target${imported.targets.length !== 1 ? 's' : ''} loaded`,
      })
    } catch (err) {
      toast({
        title: 'Import failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
    // Reset the input so the same file can be re-imported
    e.target.value = ''
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Import schedule file"
      />
      <Button variant="outline" size="sm" onClick={handleImport}>
        <Upload className="h-4 w-4 mr-1" />
        Import
      </Button>
      <Button variant="outline" size="sm" onClick={handleExport} disabled={schedule.targets.length === 0}>
        <Download className="h-4 w-4 mr-1" />
        Export
      </Button>
    </>
  )
}
