/**
 * Dwellers — ARTISAN dashboard: JOB REQUESTS (Phase 5, PART 28).
 */
import { WelcomeHeader } from '@/components/dashboard/widgets'
import { ProviderRequestsBoard } from '@/components/requests/provider-requests-board'

export const metadata = { title: 'Job Requests' }
export const dynamic = 'force-dynamic'

export default function RequestsPage() {
  return (
    <div>
      <WelcomeHeader
        name={null}
        title="Job Requests"
        description="Service requests from customers who found you on Dwellers — respond, ask for details or decline."
      />
      <ProviderRequestsBoard basePath="/artisan" />
    </div>
  )
}
