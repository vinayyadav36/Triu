// ============================================
// ORDER — JSON DB Schema Reference
// ============================================
// All order data is stored in server/db/orders.json via server/utils/jsonDB.js.
// This file documents the shape of each record (no Mongoose / no MongoDB).
//
// Schema:
// {
//   id:              string  (UUID, auto-generated)
//   orderId:         string  (human-readable, e.g. ORD-XXXXXXXX)
//   userId:          string  (references users.id)
//   customerName:    string
//   customerEmail:   string
//   customerPhone:   string
//   items: Array<{
//     productId: string
//     sellerId:  string
//     name:      string
//     price:     number
//     quantity:  number
//     image:     string
//     total:     number
//   }>
//   subtotal:        number
//   shipping:        number
//   discount:        number
//   total:           number
//   deliveryAddress: {
//     street:  string
//     city:    string
//     state:   string
//     pincode: string
//     country: string
//   }
//   payment: {
//     method:    'COD' | 'razorpay' | 'upi'
//     status:    'pending' | 'paid' | 'failed' | 'pending_collection'
//     paidAt:    ISO date string | null
//   }
//   status:          'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
//   notes:           string
//   razorpayOrderId:   string?
//   razorpayPaymentId: string?
//   refundedAt:        ISO date string?
//   refundReason:      string?
//   createdAt: ISO date string  (auto-generated)
//   updatedAt: ISO date string  (auto-updated)
// }
