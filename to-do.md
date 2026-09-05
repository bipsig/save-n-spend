# Features TODO

- [X] Add Transaction Button in All Activity Page
- [X] Budgets screen should support previous months as well
- [X] Option to view not just monthly transactions in all activity but also yearly, weekly, daily
- [X] Better Filters on All Activity Screen
- [X] Add note, location receipt not working
- [X] Transfer Button in Add Transaction
- [X] Better Category Picker in Add Transaction
- [X] Some division in All Transactions (like daily divider)
- [X] No time picker in Add Transaction. Automatically maps to 12 am
- [X] Keyboard auto opens when creating new category
- [X] Update Add Goals Screen with designed Screen
- [X] Catgory Modal auto opens sometimes when other modals are opened
- [ ] Add App Icon
- [ ] Escape and length-cap the Activity search term — it goes straight into `$regex` (transactionController.ts:89, transactionSchema.ts:42), so `(` 500s and `(a+)+b` backtracks on the database
- [X] Highlights, per docs/insights-engine.md — deterministic rules, no model; its own screen behind the More-tab hero rather than on the Insights tab, so insights stayed untouched
- [ ] Fixtures for `highlightSnapshotService` — the rules are covered, the Mongo-and-calendar half is not (budget created mid-month, backdated transaction in a closed month)