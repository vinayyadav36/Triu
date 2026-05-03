// ============================================
// SUPPORT TICKET — JSON DB Schema Reference
// ============================================
// All support ticket data is stored in server/db/support_tickets.json via server/utils/jsonDB.js.
// This file documents the shape of each record (no Mongoose / no MongoDB).
//
// Schema:
// {
//   id:          string  (UUID, auto-generated)
//   userId:      string  (references users.id)
//   orderId:     string? (references orders.id, optional)
//   subject:     string
//   description: string
//   status:      'open' | 'in_progress' | 'resolved' | 'closed'
//   priority:    'low' | 'medium' | 'high' | 'urgent'
//   category:    string
//   replies: Array<{
//     id:        string
//     adminId:   string?
//     userId:    string?
//     message:   string
//     createdAt: ISO date string
//   }>
//   assignedTo:  string?  (admin user id)
//   resolvedAt:  ISO date string?
//   createdAt:   ISO date string  (auto-generated)
//   updatedAt:   ISO date string  (auto-updated)
// }
