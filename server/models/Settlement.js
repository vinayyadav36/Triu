// ============================================
// SETTLEMENT — JSON DB Schema Reference
// ============================================
// All settlement data is stored in server/db/settlements.json via server/utils/jsonDB.js.
// This file documents the shape of each record (no Mongoose / no MongoDB).
//
// Schema:
// {
//   id:          string  (UUID, auto-generated)
//   sellerId:    string  (references users.id)
//   fromDate:    ISO date string
//   toDate:      ISO date string
//   status:      'processed' | 'pending' | 'failed'
//   summary: {
//     totalGross:      number
//     totalCommission: number
//     totalTds:        number
//     totalRefunds:    number
//     netPayable:      number
//   }
//   orderCount:  number
//   netAmount:   number
//   currency:    'INR'
//   processedAt: ISO date string
//   createdAt:   ISO date string  (auto-generated)
//   updatedAt:   ISO date string  (auto-updated)
// }
