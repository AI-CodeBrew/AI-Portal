# AI Commerce Portal

Multi-merchant e-commerce operations portal: Shopify order sync, WhatsApp confirmations, and Claude-powered AI sales agent.

## Authentication

### Reseller signup
1. Go to `/signup` and create an account with email + password
2. A personal store is auto-created and linked to your account
3. Sign in and connect Shopify + WhatsApp from **Settings**

### Admin account (one-time setup)
1. Set in `.env.local`:
   ```
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=your-secure-password
   ADMIN_NAME=Platform Admin
   ADMIN_SETUP_SECRET=some-random-secret
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
2. Run migrations `001` and `002` in Supabase SQL Editor
3. Create the admin user:
   ```bash
   curl -X POST http://localhost:3000/api/auth/setup-admin \
     -H "x-setup-secret: your-setup-secret"
   ```
4. Sign in at `/login` with the admin email/password → redirected to `/admin`

### Roles

| Role | Routes | Capabilities |
|------|--------|--------------|
| **Reseller** | `/dashboard/*` | Own store, orders, inbox, Shopify + WhatsApp connect |
| **Admin** | `/admin/*` | All resellers, all orders, all chats, platform stats |

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.local.example` to `.env.local` and fill in all values:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** for server-side DB access |
| `ENCRYPTION_KEY` | Random 32+ char string for token encryption |
| `SESSION_SECRET` | Random string for merchant session cookies |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | From Shopify Partner Dashboard |
| `SHOPIFY_APP_URL` | Your app URL (e.g. `http://localhost:3000`) |
| `META_APP_ID` / `META_APP_SECRET` | Meta Developer app credentials |
| `META_CONFIG_ID` | WhatsApp Embedded Signup config ID |
| `WHATSAPP_VERIFY_TOKEN` | Any string for webhook verification |
| `ANTHROPIC_API_KEY` | Claude API key |

For initial WhatsApp testing (before Embedded Signup), set `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.

### 3. Run database migration

Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/jhagyplvhmzafkhlngax/sql/new) and run the contents of:

```
supabase/migrations/001_initial_schema.sql
```

Or with Supabase CLI linked to your project:

```bash
supabase db push
```

### 4. Start the dev server

```bash
npm run dev
```

Visit `http://localhost:3000` → Settings to connect Shopify and WhatsApp.

## Architecture

```
Shopify Store ──webhook──► /api/webhook/shopify ──► Supabase (orders)
                                │
Portal Dashboard ◄──Realtime── orders table
        │
        └── Confirm ──► WhatsApp template (order_confirmed)

Customer WhatsApp ──► /api/whatsapp-webhook ──► Claude AI Agent
                                │                      │
                                │                      ├── search_products
                                │                      ├── check_stock
                                │                      ├── create_draft_order
                                │                      └── escalate_to_human
                                ▼
                         whatsapp_messages / conversations
```

## Pages

- **/orders** — Live order list with Confirm button (triggers WhatsApp template)
- **/inbox** — Human handoff conversations from AI escalations
- **/settings** — Connect Shopify (OAuth) and WhatsApp (Embedded Signup)

## Webhook URLs

Configure in external dashboards:

| Service | URL |
|---------|-----|
| Shopify orders | `{APP_URL}/api/webhook/shopify` |
| WhatsApp messages | `{APP_URL}/api/whatsapp-webhook` |

For production, also deploy the Supabase Edge Function at `supabase/functions/shopify-webhook` as an alternative Shopify webhook target.

## WhatsApp Template

Create an approved template named `order_confirmed` in Meta Business Manager with body variables for:
1. Order number
2. Items summary
3. Total amount

## Shopify App Setup

1. Create a custom app in [Shopify Partners](https://partners.shopify.com)
2. Set redirect URL: `{SHOPIFY_APP_URL}/auth/shopify/callback`
3. Request scopes: `read_orders`, `write_orders`, `read_products`, `read_customers`, `write_draft_orders`

## Meta / WhatsApp Setup

1. Create a Meta app with WhatsApp product
2. Configure Embedded Signup and note the `config_id`
3. Set webhook URL to `{APP_URL}/api/whatsapp-webhook`
4. Subscribe to `messages` field
