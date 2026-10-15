# Reset All Data Feature - Implementation Guide

## Overview

Added a "Reset all data" feature for organizers to permanently clear all ledger data (groups, members, payments, prizes, receipts) from their account. Also fixed SPA routing issues.

## Changes Made

### 1. **Added "Reset all data" Feature**

#### Location
- **Settings page**: `/settings` (new navigation item in sidebar and mobile nav)
- **Component**: `src/pages/desk/SettingsPage.tsx`

#### Features
- ✅ Strong confirmation required (must type "RESET" exactly)
- ✅ Clear warning about what will be deleted
- ✅ Lists all data types that will be removed
- ✅ Confirms that account/login will NOT be deleted
- ✅ Success message and auto-redirect after reset
- ✅ Error handling with user-friendly messages

#### What Gets Deleted
The reset permanently removes:
- All chit groups (active and archived)
- All members and membership records
- All payment collections
- All prize payouts and withdrawals
- All receipts
- All audit logs
- All counters (member and receipt counters)
- All schedules and import mappings

#### What Does NOT Get Deleted
- ✅ Auth user account
- ✅ Database schema
- ✅ App settings
- ✅ ledger_owners record

### 2. **Backend Implementation**

#### New Migration
**File**: `supabase/migrations/20261015083600_reset_all_data.sql`

Creates `reset_all_data()` RPC function:
- **Security**: SECURITY DEFINER (runs with elevated privileges)
- **Auth**: Requires authenticated user with ledger_owner record
- **Safety**: Only deletes rows owned by calling user (owner_id = auth.uid())
- **Order**: Deletes in correct FK dependency order
- **Transaction**: All deletes happen in single transaction (rollback on error)
- **Bypass**: Temporarily allows deletes by setting session variable for delete triggers

#### Delete Order (respects FK constraints)
1. receipts
2. payment_allocations
3. payment_transactions
4. withdrawal_transactions
5. payout_schedules
6. schedule_import_mappings
7. group_memberships
8. group_schemes
9. groups
10. members
11. member_counters
12. receipt_counters
13. audit_logs

#### Modified Function
Updated `ledger_block_delete()` trigger function to allow deletes when called from `reset_all_data()` by checking session variable `app.allow_delete`.

### 3. **Fixed SPA Routing (404 on Direct Route Access)**

#### Issue
Loading deep routes like `/chits`, `/members`, etc. directly (or refreshing) returned Vercel 404.

#### Solution
**File**: `vercel.json` (new)

Added SPA rewrite rule:
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Now all routes serve `index.html` and React Router handles client-side routing.

### 4. **Navigation Updates**

#### Added Settings Link
- **Sidebar** (desktop): Settings appears as 5th navigation item
- **Bottom nav** (mobile): Settings appears as 5th tab
- **Icon**: Gear/cog icon
- **Route**: `/settings`

#### Files Modified
- `src/components/DeskShell.tsx` - Added Settings link and icon
- `src/App.tsx` - Added `/settings` route

## Files Changed

### New Files
1. `vercel.json` - SPA routing configuration
2. `supabase/migrations/20261015083600_reset_all_data.sql` - Reset RPC and trigger update
3. `src/pages/desk/SettingsPage.tsx` - Settings page with reset feature
4. `RESET_FEATURE.md` - This documentation

### Modified Files
1. `src/components/DeskShell.tsx` - Added Settings navigation
2. `src/App.tsx` - Added Settings route

## Production Setup Required

### ⚠️ IMPORTANT: Apply Migration to Production

The reset feature will NOT work until you apply the migration to your production Supabase database.

#### Option 1: Using Supabase CLI (Recommended)
```bash
cd /workspace
supabase db push
```

#### Option 2: Using Supabase Dashboard SQL Editor
1. Go to https://app.supabase.com
2. Select your project
3. Go to SQL Editor
4. Click "New query"
5. Copy and paste the contents of `supabase/migrations/20261015083600_reset_all_data.sql`
6. Click "Run"

#### Verify Migration Applied
After applying, verify the function exists:
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'reset_all_data';
```

Should return: `reset_all_data`

### Testing the Feature
1. Deploy the code to Vercel (automatic on push to main)
2. Apply the migration to your Supabase database (see above)
3. Visit https://chit-software.vercel.app/settings
4. Click "Reset..." button
5. Type "RESET" in confirmation box
6. Click "Reset All Data"
7. Wait for success message and redirect

## Security Considerations

### Authentication
- Function requires authenticated user (checks `auth.uid()`)
- Only affects data owned by calling user
- Cannot delete other users' data
- RLS policies still enforced

### Trigger Bypass
- Delete triggers prevent normal deletes (immutability)
- `reset_all_data()` sets session variable `app.allow_delete = true`
- Variable is transaction-scoped (auto-reset on commit/rollback)
- Variable is explicitly reset in exception handler

### Transaction Safety
- All deletes in single transaction
- Rollback on any error
- No partial deletes possible

## User Experience

### Before Reset
```
Groups: 6 (including archived)
Members: 24
Payments: Multiple collections and prizes
Receipts: All transaction receipts
```

### After Reset
```
Groups: 0
Members: 0
Payments: 0
Receipts: 0
Clean empty states displayed
```

### Flow
1. User navigates to Settings (sidebar or mobile nav)
2. Sees "Danger Zone" section
3. Clicks "Reset..." button
4. Confirmation modal appears with:
   - Warning message
   - List of what will be deleted
   - Confirmation that account won't be deleted
   - Text input requiring "RESET"
5. Types "RESET" exactly
6. Clicks "Reset All Data"
7. Backend processes deletion
8. Success message appears
9. Auto-redirect to dashboard (page reload)
10. Clean empty states displayed

## Build Status

### All Checks Passed ✅
- **TypeScript**: Compilation successful
- **Linter**: Pass (only pre-existing warnings)
- **Tests**: 16/16 passing
- **Production Build**: Success

## Testing Completed

- [x] Settings page renders correctly
- [x] Navigation updated with Settings link
- [x] Reset button shows confirmation modal
- [x] Typing wrong text shows error
- [x] Confirmation requires exact "RESET" text
- [x] Backend function created with correct logic
- [x] Delete order respects FK constraints
- [x] SPA routing fixed (vercel.json)
- [x] Build passes
- [x] Lint passes
- [x] Tests pass

## Known Limitations

### No Undo
Once reset is clicked and confirmed, there is **no way to undo**. All data is permanently deleted. This is by design but should be clearly communicated to users (which it is in the UI).

### No Backup Option
The feature does not create a backup before deletion. If backup is needed, it should be done manually before reset:
1. Export reports
2. Download payment history
3. Save member lists

### Single Owner Model
The current implementation assumes single owner per ledger. In multi-tenant scenarios with shared groups, this would need modification.

## Future Enhancements (Not Implemented)

Potential additions if needed:
- [ ] Optional backup creation before reset
- [ ] Email confirmation before reset
- [ ] Delay period (e.g., 24 hours) before actual deletion
- [ ] Export all data as JSON/CSV before reset
- [ ] Partial reset (e.g., only delete archived groups)

---

**Status**: ✅ Ready for Production (after migration applied)
**Date**: October 15, 2026
