// ============================================
// OTP TOKEN — JSON DB Schema Reference
// ============================================
// All OTP records are stored in server/db/otps.json via server/utils/jsonDB.js.
// This file documents the shape of each record (no Mongoose / no MongoDB).
//
// Schema:
// {
//   id:        string  (UUID, auto-generated)
//   requestId: string  (UUID, returned to client for verification)
//   email:     string
//   otpCode:   string  (6-digit numeric OTP)
//   purpose:   'login' | 'register' | 'reset'
//   expiresAt: ISO date string  (5 minutes from creation)
//   createdAt: ISO date string  (auto-generated)
//   updatedAt: ISO date string  (auto-updated)
// }
