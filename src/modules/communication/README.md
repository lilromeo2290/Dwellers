# Module: Communication

Owns conversations, messages, attachments and notifications.

## Responsibilities
- 1:1 and group conversations between customers and providers.
- Message threads with attachment support (validated via storage module).
- Platform notifications (in-app first; email/SMS/WhatsApp channels plug in
  later through the notification dispatcher interface).
- Read receipts and unread counters.

## Design rules
- Participants of a conversation are enforced server-side on every message
  read/write — never from client-supplied participant lists.
- Attachment uploads pass `validateUpload('message-attachment', …)`.
- Delivery is asynchronous: messages persist first, notifications fan out
  after commit (no user-facing failure when a channel is down).

## Planned API surface
- `GET/POST /api/messages/conversations`
- `GET/POST /api/messages/conversations/[id]/messages`
- `GET /api/notifications` · `POST /api/notifications/[id]/read`

## Dependencies
Identity, Storage, Database, WebSocket mini-service (realtime delivery).
