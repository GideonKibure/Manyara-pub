# Manyara Pub Management System

Manyara Pub sells drinks and also earns money from a pool table and a korokoro machine. This app lets the owner watch stock, approve what employees submit, and see sales and other income separately.

Sign-in, stock, sales, and approvals use a live Supabase project. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` locally and on Vercel. There are no built-in demo logins.

## Run it locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local`, add the public Supabase URL and anon key, then open http://127.0.0.1:5173. Sign in with a user created in Supabase Auth. The first user is an employee until you promote them to admin in SQL.

## What the business can do

- Administrators manage products, categories, units, suppliers, employees, settings, reports, and the audit log.
- Employees submit stock received, sales, and, when allowed, pool table or korokoro collections.
- A submission starts as pending. Confirmed stock and confirmed revenue do not change until an administrator approves it.
- Approving a sale deducts stock once. Approving it again does nothing.
- Rejecting or withdrawing a sale releases the quantity it had reserved.
- Available stock is confirmed stock minus quantities reserved by other pending sales.
- Low stock means available stock is above zero and at or below the product minimum. Out of stock means available stock is zero.
- Pool table and korokoro income never changes drink stock. Prices are settings, starting at TSh 2,000 per game and TSh 1,000 per play.
- Reports can be filtered, exported as CSV, and printed. Pending work is kept out of confirmed totals.

## Folder structure

```text
src/
  app/                  router and route guards
  components/ui/        buttons, fields, tables, dialogs
  context/              application state
  data/                 demo seed
  features/
    inventory/          confirmed, reserved, and available stock
    notifications/      alert creation without duplicate refreshes
    reports/            dashboard and report calculations
    transactions/       approval and submission details
  layouts/              sign-in, administrator, and employee shells
  lib/                  Supabase browser client
  pages/                route screens
  schemas/              Zod validation
  services/             local transactions and Supabase RPC wrappers
  utils/                dates, money, CSV
supabase/migrations/    PostgreSQL schema, RLS, and approval functions
```

## How stock is stored

Confirmed stock is not a number someone can type over. It is the sum of inventory movements:

- opening balance
- approved stock in, after any crate or carton conversion
- approved sales, as a negative quantity
- administrator adjustments

Pending sales reserve quantity but do not add a movement. Available stock is confirmed minus reserved. The same calculation lives in `src/features/inventory/stock.ts` for the demo and in `public.current_stock()` for Supabase.

Example: Safari Lager is tracked in bottles and received in crates of 24. One approved crate adds 24 bottles. A different product can use a different conversion.

## Database relationships

```text
profiles 1---* stock_in_transactions 1---* stock_in_items *---1 products
profiles 1---* sales_transactions     1---* sales_items     *---1 products
products 1---* inventory_movements
products *---1 categories
products *---1 units
activity_types 1---* activity_transactions *---1 profiles
profiles 1---* notifications
profiles 1---* audit_logs
```

Approval status is `pending`, `approved`, `rejected`, or `cancelled`. Only `pending` sales reserve stock. Only `approved` sales and deliveries change the ledger.

## Supabase setup

When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, the app signs in with Supabase Auth and reads and writes that database. Without those values there is no live login.

1. Create a Supabase project.
2. In the SQL editor, run these files in order:
   - `supabase/migrations/001_initial.sql`
   - `supabase/migrations/002_auto_approve_invoiced_stock_in.sql`
   - `supabase/migrations/003_connect_api.sql`
3. In Authentication → Providers → Email, turn off “Confirm email” if staff should sign in immediately after an administrator creates them. Leave it on if you want each person to open an email first.
4. In Authentication → URL configuration, set Site URL to `http://127.0.0.1:5173` and add `http://127.0.0.1:5173/reset-password` as a redirect URL. Add the production URL before deploying.
5. In Authentication → Users, add the first person.
6. Promote that person from the SQL editor. The app cannot grant administrator access:

```sql
update public.profiles
set role = 'admin'
where email = 'the-email-you-created@example.com';
```

7. Copy `.env.example` to `.env.local` and set the public values only. In Project Settings → API, copy the Project URL and the `anon` `public` key:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

8. Restart `npm run dev` and sign in with that email and password.

Do not put the service-role key in `.env`, `.env.local`, or frontend code.

The connected app calls these database functions. They run with the signed-in user, and row level security still applies to ordinary table access:

- `submit_stock_in`, `finalize_stock_in`, `approve_stock_in`, `reject_stock_in`
- `submit_sale`, `approve_sale`, `reject_sale`
- `submit_activity`, `approve_activity`, `reject_activity`
- `cancel_submission`, `adjust_inventory`, `email_for_login`

A stock delivery that includes an invoice reference is approved in the same step that records it. Confirmed stock increases immediately, and the submitter is stored as the reviewer so the approval is identifiable as automatic. A delivery with no invoice reference stays pending until an administrator approves or rejects it.

Each manual approval function locks the pending row, checks that the caller is an administrator and is not the person who submitted it, checks stock where needed, writes the ledger, then changes the status. `finalize_stock_in` is the exception used for an invoiced delivery: the submitter may call it, and it approves only when the invoice reference is present. If any step fails, PostgreSQL rolls the transaction back. A direct table update cannot flip a status to approved, and employees cannot insert movements.

Notifications store an `in_app` channel today. Email or WhatsApp can be added later by reading that same record.

## Deploy to Vercel and use live Supabase data

Vite bakes `VITE_` values into the build. The published site only talks to Supabase if those two variables exist in Vercel **before** you deploy (or you redeploy after adding them).

1. In [Supabase](https://supabase.com/dashboard) open the project, then **Project Settings → API**. Copy **Project URL** and the **anon public** key. Do not copy the service-role key.
2. In [Vercel](https://vercel.com) import `https://github.com/GideonKibure/Manyara-pub.git` (framework: Vite).
3. In the Vercel project go to **Settings → Environment Variables** and add both keys for **Production**, **Preview**, and **Development**:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4. Deploy (or **Redeploy** if the site was already built without those variables).
5. Copy the live URL, for example `https://manyara-pub.vercel.app`.
6. In Supabase go to **Authentication → URL configuration**:
   - **Site URL**: the Vercel URL
   - **Redirect URLs**: `https://your-app.vercel.app/**`, `https://your-app.vercel.app/reset-password`, and `http://127.0.0.1:5173/**` for local work
7. In **Authentication → Providers → Email**, turn off **Confirm email** if staff should sign in as soon as an admin creates them.
8. In **Authentication → Users**, add the first person. Then in the SQL editor promote that person:

```sql
update public.profiles
set role = 'admin'
where email = 'the-email-you-created@example.com';
```

9. Sign in on the Vercel URL with that email and password. Stock, sales, bills, and approvals now read and write the same Supabase tables as local `.env.local`.

Optional: Vercel **Integrations → Supabase** can inject the same public URL and anon key. Still never add the service-role key to Vercel or the frontend.

`vercel.json` sends client routes back to `index.html`. `npm run build` typechecks and builds the production bundle.

## Checks worth repeating

- Administrator and employee sign in land on different dashboards.
- An employee who opens an administrator URL sees access denied.
- A delivery with an invoice reference increases confirmed stock immediately. A delivery without one, and every sale, stays pending and does not change confirmed stock.
- Approving a sale reduces confirmed stock once. A second approval is refused.
- Rejecting or withdrawing a sale releases its reservation.
- A sale larger than available stock, including other pending sales, is refused.
- Low and out-of-stock products show on the dashboard.
- Pool table and korokoro approvals change income only.
- Reports export CSV and print without treating pending sales as revenue.
