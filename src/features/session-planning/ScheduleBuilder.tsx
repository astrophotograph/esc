import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { useSchedulerStore } from '../../stores/schedulerStore'
import { useTelescopeStore } from '../../stores'
import { invoke } from '../../services/api'
import { scheduleToWireFormat } from './utils/scheduleSerialization'
import { toast } from '../../hooks/useToast'
import { LocationPicker } from './components/LocationPicker'
import { ObjectSearch } from './components/ObjectSearch'
import { ScheduleTimeline } from './components/ScheduleTimeline'
import { ScheduleImportExport } from './components/ScheduleImportExport'

export function ScheduleBuilder() {
  const { schedule, setPlanName } = useSchedulerStore()
  const { telescopes } = useTelescopeStore()
  const connectedTelescopes = telescopes.filter((t) => t.status === 'connected')

  const [selectedTelescopeId, setSelectedTelescopeId] = useState<string>(
    connectedTelescopes[0]?.id ?? ''
  )
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!selectedTelescopeId) {
      toast({ title: 'No telescope selected', variant: 'destructive' })
      return
    }
    if (schedule.targets.length === 0) {
      toast({ title: 'Schedule is empty', variant: 'destructive' })
      return
    }

    setSending(true)
    try {
      const wire = scheduleToWireFormat(schedule)
      const resp = await invoke<string>('schedule_set_view_plan', {
        telescopeId: selectedTelescopeId,
        plan: wire,
      })
      const result = typeof resp === 'string' ? JSON.parse(resp) : resp
      if (result.success) {
        toast({ title: result.message ?? 'Plan sent successfully' })
      } else {
        toast({ title: result.message ?? 'Failed to send plan', variant: 'destructive' })
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
          ? err
          : JSON.stringify(err)
      toast({
        title: 'Failed to send plan',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Header row: plan name + location */}
      <div className="space-y-3">
        <div>
          <Label htmlFor="plan-name">Plan name</Label>
          <Input
            id="plan-name"
            value={schedule.planName}
            onChange={(e) => setPlanName(e.target.value)}
            className="max-w-xs"
            placeholder="My observing plan"
          />
        </div>
        <LocationPicker />
      </div>

      {/* Two-column layout: search | timeline */}
      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        <div className="flex flex-col min-h-0 border rounded-lg p-3">
          <h3 className="text-sm font-semibold mb-3">Object Search</h3>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ObjectSearch />
          </div>
        </div>

        <div className="flex flex-col min-h-0 border rounded-lg p-3">
          <h3 className="text-sm font-semibold mb-3">Schedule</h3>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScheduleTimeline />
          </div>
        </div>
      </div>

      {/* Footer: telescope selector + import/export + send */}
      <div className="border-t pt-3 flex items-center gap-3 flex-wrap">
        <ScheduleImportExport />

        <div className="flex-1" />

        {connectedTelescopes.length > 0 ? (
          <Select value={selectedTelescopeId} onValueChange={setSelectedTelescopeId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select telescope" />
            </SelectTrigger>
            <SelectContent>
              {connectedTelescopes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.friendlyName ?? t.name ?? t.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">No telescopes connected</span>
        )}

        <Button
          onClick={handleSend}
          disabled={sending || schedule.targets.length === 0 || !selectedTelescopeId}
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Send to Telescope
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
