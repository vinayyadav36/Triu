// ============================================
// USER — JSON DB Schema Reference
// ============================================
// All user data is stored in server/db/users.json via server/utils/jsonDB.js.
// This file documents the shape of each record (no Mongoose / no MongoDB).
//
// Schema:
// {
//   id:           string  (UUID, auto-generated)
//   name:         string
//   email:        string  (unique, lowercase)
//   phone:        string
//   passwordHash: string  (bcrypt — omitted from API responses)
//   keyHash:      string? (optional personal passkey, bcrypt)
//   role:         'customer' | 'seller' | 'admin' | 'agent' | 'partner' | 'bot'
//   status:       'active' | 'blocked' | 'suspended'
//   seller: {
//     businessName:  string
//     description:   string
//     gstNumber:     string
//     panNumber:     string
//     category:      string
//     bankAccount:   object | null
//     phone:         string
//     address:       object | null
//     status:        'pending' | 'approved' | 'rejected'
//     verified:      boolean
//     appliedAt:     ISO date string
//     approvedAt:    ISO date string | null
//   } | null
//   orders:    string[]  (order ids)
//   wishlist:  string[]  (product ids)
//   address:   object | null
//   lastLogin: ISO date string | null
//   xp:        number
//   level:     number
//   badges:    string[]
//   createdAt: ISO date string  (auto-generated)
//   updatedAt: ISO date string  (auto-updated)
// }
