# SALTEDHASH: Gardening / Natural Living / Food Master Blueprint

## 1. Theme Summary
A modular, content-first membership platform for Gardening / Natural Living / Food that helps solo founders deliver guides, planners, and community experiences with recurring subscriptions, using a lightweight JSON-first stack and reusable product layers.

## 2. Covered Product Types
- Urban Gardening Club (membership + learning tracks)
- Herbal Living Community (routines + remedies education)
- Green Thumb Subscription (seasonal growing content drops)
- Vegan Meal Planning Hub (meal + prep systems)
- Meal Prep Starter Kit (downloadable starter templates)
- Future niche spin-offs (balcony gardening, family meal systems, and similar extensions)

## 3. Shared Problem Framework
- Fragmented learning: users juggle blogs, videos, notes, and spreadsheets.
- Planning friction: garden cycles, meal prep, and routines are disconnected.
- Subscription fatigue: recurring value is unclear without structured delivery.
- Community noise: discussions are not tied to actionable plans and content.

## 4. Core User Types
- Beginner Grower: wants step-by-step seasonal guidance.
- Natural Living Optimizer: tracks habits, herbal routines, and wellness workflows.
- Practical Meal Planner: needs weekly vegan meal and grocery execution.
- Community Learner: seeks accountability, peer tips, and curated resources.
- Solo Creator-Operator (internal): publishes and monetizes content quickly.

## 5. SALTEDHASH Product Strategy
- Prioritize memberships and digital content over physical logistics.
- Build once, re-skin many using reusable planning/content/community modules.
- Use tiered access for recurring revenue (free, core, premium, expert).
- Ship weekly JSON content packs to maintain low-cost launch velocity.

## 6. Architecture Style
- Monolithic monorepo (frontend + backend unified).
- Vue 3 + Vite client and Express API server.
- JSON/NoSQL file storage only, no external database.
- Stateful client workflows with server-side validation and access enforcement.

## 7. Global System Structure
- Vue UI Layer (dashboard, planners, library, community).
- Express API Gateway (auth, membership checks, content APIs, admin APIs).
- JSON Storage Layer (members, content, plans, posts, subscriptions, downloads).
- Optional local asset storage for images, PDFs, and kits.

## 8. Core Reusable Modules
- member profiles
- content library
- seasonal guides
- plant/garden planner
- meal planner
- grocery checklist
- habit and routine templates
- subscription access control
- community discussion/posts
- partner/brand listing support
- downloadable kit/template system
- notifications/reminders
- activity history/audit log
- admin publishing workflow

## 9. NoSQL / JSON Data Architecture
- Workspace partitioning at `/data/workspaces/{workspaceId}/...`.
- Entity-per-file or grouped collection files (`members.json`, `posts.json`, `plans.json`).
- Atomic read-modify-write pattern guarded by a write queue.
- In-memory index map for ID-to-file resolution.
- Media metadata as JSON with local asset references.
- Backup/export as a full workspace zip bundle.

## 10. Authentication and Authorization
- JWT stored in HTTP-only cookies.
- Password hashing with optional OTP login flow.
- Role scopes: guest, member, premium, moderator, admin.
- Route middleware checks membership tier and feature entitlement.
- Content gating by `accessTier` and `releaseAt`.

## 11. Membership and Content Delivery Engine
- Subscription tiers mapped to features and content access.
- Drip schedules for weekly and seasonal releases.
- Library filtering by level, season, topic, and goal.
- Member progress tracking for guides, saved plans, and streaks.
- Download entitlements for kits/templates by tier.
- Renewal status controls premium visibility and planner limits.

## 12. Planning Toolkit Layer
- Garden planner: crop calendar with sow/transplant/harvest timeline.
- Meal planner: weekly matrix, prep batches, leftovers logic.
- Grocery checklist: generated from meal plans and user-editable.
- Habit templates: hydration, composting, herbal prep, meal prep routines.
- Seasonal guide overlays feeding both garden and meal workflows.

## 13. Folder Structure
```text
saltedhash-garden-living-food/
├── package.json
├── backend/
│   ├── server.js
│   ├── config.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── accessControl.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── members.js
│   │   ├── content.js
│   │   ├── seasonal.js
│   │   ├── planner-garden.js
│   │   ├── planner-meals.js
│   │   ├── grocery.js
│   │   ├── habits.js
│   │   ├── community.js
│   │   ├── partners.js
│   │   ├── downloads.js
│   │   └── admin.js
│   └── data/
│       └── workspaces/workspace_001/
└── frontend/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.js
        ├── App.vue
        ├── store/
        ├── composables/
        ├── components/
        │   ├── Membership/
        │   ├── Content/
        │   ├── Planning/
        │   ├── Community/
        │   └── Shared/
        └── views/
```

## 14. API Design
- `POST /api/auth/login`
- `GET /api/members/me`
- `GET /api/content?type=&season=&tier=`
- `GET /api/seasonal/guides/:id`
- `POST /api/planner/garden`
- `PUT /api/planner/garden/:id`
- `POST /api/planner/meals`
- `PUT /api/planner/meals/:id`
- `POST /api/grocery/generate`
- `POST /api/habits/templates/apply`
- `GET /api/community/posts`
- `POST /api/community/posts`
- `GET /api/partners/listings`
- `GET /api/downloads/:kitId` (tier-gated)
- `POST /api/admin/content/publish`

## 15. Frontend Architecture
- Pinia stores split by domain: auth, membership, content, planning, community.
- Composables for planner math, seasonal logic, and checklist generation.
- Route guards enforcing subscription tier access.
- Responsive dashboard tabs: Learn, Plan, Community, Downloads.
- Lightweight Tailwind-based UI with reusable cards and filters.

## 16. Admin and Community Management System
- Admin dashboard for member counts, active subscriptions, and content performance.
- Content publishing states: draft, scheduled, published.
- Moderation queue: flag, hide, approve workflows.
- Partner/brand listing manager with category and tag controls.
- Export/import toolkit for workspace backup portability.

## 17. Data Models with sample JSON
`settings.json`
```json
{
  "workspaceId": "ws_garden_01",
  "brandName": "SALTEDHASH Green Living",
  "planTiers": ["free", "core", "premium"],
  "storageLimitBytes": 1073741824
}
```

`members.json`
```json
{
  "members": [
    {
      "id": "mem_001",
      "email": "user@example.com",
      "tier": "premium",
      "status": "active",
      "joinedAt": "2026-05-24T00:00:00Z",
      "preferences": { "diet": "vegan", "zone": "tropical" }
    }
  ]
}
```

`content-library.json`
```json
{
  "items": [
    {
      "id": "cnt_101",
      "type": "guide",
      "title": "Balcony Herb Starter Guide",
      "season": "summer",
      "accessTier": "core",
      "releaseAt": "2026-06-01T00:00:00Z",
      "assetUrl": "/assets/ws_garden_01/guides/herb-starter.pdf"
    }
  ]
}
```

`planner.json`
```json
{
  "gardenPlans": [
    {
      "id": "gp_001",
      "memberId": "mem_001",
      "season": "summer",
      "beds": [{ "name": "Bed A", "crops": ["basil", "tomato"] }]
    }
  ],
  "mealPlans": [
    {
      "id": "mp_001",
      "memberId": "mem_001",
      "weekOf": "2026-06-08",
      "meals": [{ "day": "Mon", "dinner": "Chickpea curry bowl" }]
    }
  ]
}
```

`community-posts.json`
```json
{
  "posts": [
    {
      "id": "post_001",
      "authorId": "mem_001",
      "title": "My first balcony harvest",
      "content": "Mint and basil thriving!",
      "createdAt": "2026-05-24T09:00:00Z",
      "status": "published"
    }
  ]
}
```

## 18. MVP Scope
- Max 1 workspace, 3 tiers, and up to 500 members.
- Core modules: profiles, content library, seasonal guides, garden planner, meal planner, grocery checklist, habits, community posts, downloads.
- Basic partner listing directory.
- No physical shipping/subscription logistics in MVP.
- Manual payment status sync acceptable initially.

## 19. Expansion Strategy
- Add physical subscription kits later as an optional module.
- Add creator marketplace for partner bundles and sponsored guides.
- Add mobile wrappers (Capacitor/Tauri) for offline planning.
- Add cohort programs/challenges with leaderboard mechanics.
- Add AI-assisted plan recommendations after data quality stabilizes.

## 20. Risks and Guardrails
- Concurrent JSON writes: enforce server-side queue and file-lock checks.
- Content access leakage: strict tier middleware for all gated routes.
- Community abuse/spam: moderation queue, rate limits, and reporting.
- Planner complexity creep: template-first with bounded fields.
- Storage growth: file-size caps, compression, and archival retention.

## 21. Final Recommendation
Deploy MVP on Render for low-ops execution, keep planning items on a fixed pixel grid for predictable UX and simpler planner logic, and use a clean minimalist visual system with nature-accent colors. Focus phase one on subscription-gated content + planning + community; treat physical subscription logistics as a later optional extension.
