# V2 UI Prototype — read this first

This build is for checking the new design only. It does **not** touch your
Supabase project — `src/supabase.js` is byte-for-byte identical to your
original file.

## How the test login works

All auth is mocked locally in `src/mockData.js`. No network request is made
when you log in.

| Role     | Email                | Password   |
|----------|-----------------------|-----------|
| Admin    | admin@mmer3.com       | Admin123!  |
| Employee | employee@test.com     | Test1234   |

I don't have access to your real Supabase admin password (it's hashed on
Supabase's side, not stored in the code), so `Admin123!` is a stand-in for
this test build only.

Sign-up also works in test mode — it adds a row to a local (browser
`localStorage`) store instead of writing to Supabase, so you can try that
flow too. Data resets if you clear your browser storage.

Clock in/out, breaks, and the timesheet all work against that same local
store, so you can click through every view with realistic data. Email
reminders (EmailJS) are stubbed to a console log instead of actually
sending, so testing won't spam your real inbox.

## Running it

```
npm install
npm start
```

## Going back to production

Once you're happy with the design:
1. Delete `src/mockData.js` and this file.
2. In `Login.js`, `SignUp.js`, `Dashboard.js`, and `AdminDashboard.js`,
   remove the `if (TEST_MODE) { ... }` branches — the original Supabase
   calls are still right below each one, untouched.
3. In `App.js`, remove the `TEST_MODE` check in the `useEffect` and the
   ribbon banner.

Everything else — file structure, filenames, component names, routing,
Supabase config — is exactly as it was in your original project.
