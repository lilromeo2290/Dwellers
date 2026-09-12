#!/usr/bin/env bash
# Dwellers — generate the 10 thin provider request pages (5 roles × 2).
set -euo pipefail
cd /home/z/my-project

declare -A PATHS=(
  [artisan]="ARTISAN"
  [contractor]="CONTRACTOR"
  [company]="CONSTRUCTION_COMPANY"
  [supplier]="SUPPLIER"
  [equipment]="EQUIPMENT_PROVIDER"
)

for role_path in "${!PATHS[@]}"; do
  role_label="${PATHS[$role_path]}"
  mkdir -p "src/app/${role_path}/requests/[id]"

  cat > "src/app/${role_path}/requests/page.tsx" <<EOF
/**
 * Dwellers — ${role_label} dashboard: JOB REQUESTS (Phase 5, PART 28).
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
      <ProviderRequestsBoard basePath="/${role_path}" />
    </div>
  )
}
EOF

  cat > "src/app/${role_path}/requests/[id]/page.tsx" <<EOF
/**
 * Dwellers — ${role_label} request detail (Phase 5, PART 30).
 * Authorization lives in the service layer; foreign requests 404.
 */
import { notFound } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/session'
import { getJobRequest } from '@/modules/projects/job-request-service'
import { NotFoundError } from '@/lib/errors'
import { ProviderRequestDetail, type ProviderRequestView } from '@/components/requests/provider-request-detail'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Request details' }

export default async function ProviderRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthContext()

  let request
  try {
    request = await getJobRequest(auth, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  if (request.access.side !== 'PROVIDER') notFound()

  const locationLine = [request.community?.name, request.location?.name].filter(Boolean).join(', ')
  const view: ProviderRequestView = {
    id: request.id,
    reference: request.reference,
    title: request.title,
    description: request.description,
    status: request.status,
    responseKind: request.responseKind,
    urgency: request.urgency,
    preferredDate: request.preferredDate ? request.preferredDate.toISOString() : null,
    preferredTimeSlot: request.preferredTimeSlot,
    areaText: request.areaText,
    locationLine: locationLine || '—',
    serviceLine: request.service?.name ?? request.category?.name ?? '—',
    customerDisplayName: request.customer?.displayName ?? null,
    servesLocation: request.servesLocation,
    canRespond: request.access.canRespond,
    attachments: request.attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
    })),
    events: request.events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
      actorRole: event.actorRole,
    })),
  }

  return <ProviderRequestDetail request={view} />
}
EOF
done

echo "generated pages for: ${!PATHS[@]}"
