/**
 * Dwellers — supplier notifications (PART 34).
 * In-app only; data is loaded server-side and ownership is session-scoped.
 */
import { getAuthContext } from '@/lib/auth/session'
import { listOwnNotifications } from '@/modules/communication/notification-service'
import { NotificationsList } from '@/components/dashboard/forms'
import { WelcomeHeader } from '@/components/dashboard/widgets'

export const metadata = { title: 'Notifications' }

export default async function SupplierNotificationsPage() {
  const auth = await getAuthContext()
  const { items } = await listOwnNotifications(auth, { page: 1, pageSize: 25 })

  return (
    <div>
      <WelcomeHeader
        name={null}
        title="Notifications"
        description="Important account activity appears here — no SMS or email is sent in this phase."
      />
      <NotificationsList
        initial={items.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          body: item.body,
          readAt: item.readAt ? item.readAt.toISOString() : null,
          createdAt: item.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
