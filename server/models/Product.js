// ============================================
// PRODUCT — JSON DB Schema Reference
// ============================================
// All product data is stored in server/db/products.json via server/utils/jsonDB.js.
// This file documents the shape of each record (no Mongoose / no MongoDB).
//
// Schema:
// {
//   id:              string   (UUID, auto-generated)
//   name:            string
//   description:     string
//   price:           number   (selling price in INR)
//   mrp:             number   (maximum retail price)
//   category:        string
//   stock:           number
//   images:          string[] (image URLs)
//   thumbnail:       string   (primary image URL or emoji)
//   sellerId:        string   (references users.id)
//   hsnCode:         string   (GST HSN code)
//   countryOfOrigin: string
//   netQuantity:     string
//   status:          'active' | 'inactive' | 'pending'
//   sales:           number   (total units sold)
//   rating: {
//     average: number
//     count:   number
//   }
//   reviews: Array<{
//     id:        string
//     userId:    string
//     rating:    number (1-5)
//     comment:   string
//     verified:  boolean
//     createdAt: ISO date string
//   }>
//   createdAt: ISO date string  (auto-generated)
//   updatedAt: ISO date string  (auto-updated)
// }
