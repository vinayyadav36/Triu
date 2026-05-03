// ============================================
// GENERATED DOCUMENT — JSON DB Schema Reference
// ============================================
// All generated documents are stored in server/db/documents.json via server/utils/jsonDB.js.
// This file documents the shape of each record (no Mongoose / no MongoDB).
//
// Schema:
// {
//   id:           string  (UUID, auto-generated)
//   type:         'invoice' | 'gst_return' | 'settlement_report' | 'receipt'
//   referenceId:  string  (id of referenced entity, e.g. orderId, settlementId)
//   generatedFor: string  (references users.id)
//   generatedBy:  string  (references users.id, or 'system')
//   data:         object  (document payload — structure varies by type)
//   fileUrl:      string? (URL if file was uploaded to storage)
//   createdAt:    ISO date string  (auto-generated)
//   updatedAt:    ISO date string  (auto-updated)
// }
