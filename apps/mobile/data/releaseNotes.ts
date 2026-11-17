// Bundled with the app, never fetched. The rules for writing notes are in docs/SHIPPING.md
// (Release notes).

import type { IconName } from "../lib/icons";

export type NoteKind = "new" | "improved" | "fixed";

export interface ReleaseNote {
  kind: NoteKind;
  /** The first sentence, ending in its full stop or colon. */
  title: string;
  /** The rest of the note, shown under the title. */
  detail?: string;
  /** Shown on the timeline's top entry and in the post-update sheet. At most 3 per release. */
  highlight?: boolean;
  /** An expo-router href for "See it". Only screens that exist. */
  link?: string;
  /** The note's own glyph; without one it shows its kind's. */
  icon?: IconName;
}

export interface Release {
  version: string;
  build: number;
  /** yyyy-mm-dd, a calendar day. */
  date: string;
  headline: string;
  /** Behind-the-scenes only: no highlights, no NEW tag, no sheet. */
  quiet?: boolean;
  /** Display order within each kind. */
  notes: ReleaseNote[];
}

/** Newest first. */
export const RELEASES: Release[] = [
  {
    version: "2.8.5",
    build: 25,
    date: "2026-11-18",
    headline: "Every screen looks, loads and counts the same",
    notes: [
      {
        kind: "improved",
        title: "Spending leaves out trips everywhere, with one line for what went on trips.",
        detail: "Home, Insights, Category insights, Month in review and the daily, weekly and monthly summaries now show everyday spending, the same figure Activity and your budgets use. A \"Plus ₹ •••• on trips\" line sits under each total and opens Trips. Savings and net worth still count trips, because that money really left. Category shares add up to 100% and include Uncategorised.",
        highlight: true,
        link: "/insights",
      },
      {
        kind: "improved",
        title: "Privacy mode hides amounts everywhere, notifications included.",
        detail: "With privacy on, amounts are hidden in Notifications, highlights, Month in review, Health and the banners on your lock screen, and VoiceOver says \"amount hidden\". Peek shows them. Bill and SIP banners keep their date. Turning privacy on or off updates banners that are already scheduled.",
        highlight: true,
      },
      {
        kind: "improved",
        title: "Every screen loads the same way and keeps what it showed when a refresh fails.",
        detail: "With data on screen, a slim \"Couldn't refresh · Try again\" strip replaces the error page. Pull down to refresh on every screen. Offline, the strip says how old the saved data is, and buttons that need a connection say so before you tap. While the server is starting up, saved data shows instead of an error. Home opens from saved data even when you launch the app offline.",
        highlight: true,
      },
      {
        kind: "improved",
        title: "One screen header everywhere, with the privacy eye on every screen that shows money.",
        detail: "Actions are icon buttons with spoken labels. Budget, Bills and Goals have a back button, and screen names match the menu.",
      },
      {
        kind: "improved",
        title: "Amounts, percentages and dates follow one style.",
        detail: "One minus sign, signs instead of arrows, percentages to one decimal, exact paise, and dates in your account's time zone. A card shows what's owed instead of a negative balance.",
      },
      {
        kind: "improved",
        title: "Charts and buttons work with VoiceOver and large text.",
        detail: "Each chart reads a one-sentence summary, and buttons say what they do. At the largest text sizes, Try again and See trips move to their own line.",
      },
      {
        kind: "fixed",
        title: "Net worth history no longer counts archived accounts.",
        detail: "Past points used to move when you archived an account.",
      },
      {
        kind: "fixed",
        title: "Switching periods quickly can't show one period's figures under another's name.",
      },
      {
        kind: "fixed",
        title: "Banners no longer repeat each time the app opens.",
      },
      {
        kind: "fixed",
        title: "Peeking on Month in review shows every figure.",
      },
    ],
  },
  {
    version: "2.8.1",
    build: 24,
    date: "2026-11-16",
    headline: "Activity totals follow your filters",
    notes: [
      {
        kind: "improved",
        title: "The totals on Activity add up only the entries you've filtered to.",
        detail: "Pick a category, account, type or search, and Income, Expenses and Net Savings count only the entries in the list, with a Filtered mark beside the period. Transfers are listed but never counted, so with the Transfers filter each figure shows a dash. An entry still waiting to be sent from offline counts once it's sent.",
        highlight: true,
        link: "/activity",
      },
      {
        kind: "improved",
        title: "Exports are always built fresh from the server, never from what's saved for offline, so a file can't miss recent entries.",
      },
      {
        kind: "fixed",
        title: "Categories and accounts load by themselves when the connection comes back.",
        detail: "If the app first opened offline, the category picker and lists stayed empty until you reloaded.",
      },
      {
        kind: "fixed",
        title: "The Income and Expenses sparklines on Home show each month once.",
        detail: "This month appeared twice, and the oldest month dropped off.",
      },
    ],
  },
  {
    version: "2.8.0",
    build: 23,
    date: "2026-11-16",
    headline: "Every save lands once, and archived categories keep their names",
    notes: [
      {
        kind: "new",
        title: "Entries filed under an archived category show its name, with an Archived mark.",
        detail: "Rows show the category's icon with a small archive badge and an Archived tag after the name. An entry's details show the name beside ARCHIVED. Pickers, budgets and filters still leave archived categories out.",
        highlight: true,
        link: "/activity",
        icon: "archive",
      },
      {
        kind: "improved",
        title: "A save lands once, whether you double-tap, tap again after an error, or the reply gets lost.",
        detail: "That covers every form that moves money, and adding an account, person, bill, goal, budget, category or trip. Tapping again after a problem resends the same save instead of making a second one.",
        highlight: true,
      },
      {
        kind: "improved",
        title: "Entries saved offline are sent once when you're back, even if a reply goes missing.",
        icon: "cloudOff",
        detail: "While the server is busy or starting up, the queue waits and tries again, and it marks an entry as failed only when the server turns it down. A Wi-Fi sign-in page can no longer make a queued entry look sent.",
      },
      {
        kind: "improved",
        title: "Large Splitwise imports go through, in seconds.",
        icon: "flight",
        detail: "Everything in the file is saved together or not at all. Approving the same import again, after its reply was lost, adds nothing twice.",
        link: "/trips",
      },
      {
        kind: "improved",
        title: "Backups include your goal contribution history.",
        icon: "cloudBackup",
        detail: "Restoring a backup made from this version brings that history back. A backup made earlier leaves the history you have as it is.",
      },
      {
        kind: "improved",
        title: "While the server is waking up, the app says so and asks you to try again in a minute.",
        detail: "Before, a save at that moment could show a confusing error.",
      },
      {
        kind: "improved",
        title: "When the server turns down a form, the reason shows under the field it's about.",
        detail: "That's on Add transaction, Add goal, adding to a goal, bills and budgets.",
      },
      {
        kind: "improved",
        title: "Bill names can be up to 60 characters, and an account or category name can be a single letter.",
      },
      {
        kind: "fixed",
        title: "A delete you confirmed still happens if the app closes during the few seconds you have to undo it.",
        icon: "undo",
        detail: "It's sent the next time the app opens or comes back online. Undo works as before.",
        highlight: true,
      },
      {
        kind: "fixed",
        title: "Signs and colours follow one rule.",
        detail: "A figure below zero is red and one above is green, and for spending a rise is red. Zero is plain. A negative net savings on Activity used to show green; it's red now, and the Savings tile on Home follows the same rule. A change of nothing no longer shows a minus sign.",
      },
    ],
  },
  {
    version: "2.7.1",
    build: 22,
    date: "2026-11-16",
    headline: "Back that always works, and saves that count once",
    notes: [
      {
        kind: "improved",
        title: "Error messages say what went wrong in plain words.",
        detail: "They name the thing in the app's own words, such as an account or a category, and say what to do next. Something the server can't accept is turned away with its reason, not a general error.",
      },
      {
        kind: "improved",
        title: "A phone still signed in to an account you've closed now signs out straight away.",
      },
      {
        kind: "fixed",
        title: "Back always takes you somewhere now.",
        detail: "A screen opened straight from a link, with nothing behind it, used to ignore Back and ✕. They now take you Home, and so does Go to Home when such a screen runs into a problem.",
        highlight: true,
      },
      {
        kind: "fixed",
        title: "Saving two things at once no longer counts money twice or overwrites a change.",
        detail: "That covers two quick edits to one entry, and a double tap on delete, on turning an expense into an investment, on correcting a balance or on skipping a bill. Redeeming can't take more out of a holding than it's worth, even twice at once. Balances keep matching their entries.",
        highlight: true,
      },
      {
        kind: "fixed",
        title: "Changing the amount, account or date of a split expense now updates what each person owes.",
        detail: "Everyone's part changes in the same proportion, and the whole split stays on one account and one day.",
        highlight: true,
      },
      {
        kind: "fixed",
        title: "Closing a trip with a double tap lets each friend go once.",
        detail: "An expense added while the trip closes is either counted before it closes or turned away, never left on the closed trip.",
        icon: "flight",
      },
      {
        kind: "fixed",
        title: "An offline entry the server turns down is marked as failed, so it no longer holds up the entries queued behind it.",
        icon: "cloudOff",
      },
    ],
  },
  {
    version: "2.7.0",
    build: 21,
    date: "2026-11-14",
    headline: "Version history, and App lock everywhere",
    notes: [
      {
        kind: "new",
        title: "See what every version changed, in Settings › What's new.",
        detail: "Each version's notes are grouped into new, improved and fixed, and a note can open the screen it's about. After an update, a short sheet shows the highlights once.",
        highlight: true,
        link: "/whats-new",
      },
      {
        kind: "fixed",
        title: "App lock now covers everything on screen.",
        detail: "That includes an open sheet and the Add transaction and Add goal screens. The keyboard closes while the app is locked.",
        highlight: true,
      },
    ],
  },
  {
    version: "2.6.0",
    build: 20,
    date: "2026-11-14",
    headline: "Investment trends and exports",
    notes: [
      {
        kind: "new",
        title: "A Trends tab on Investments, once there's some history:",
        icon: "investments",
        detail: "a value chart against what you put in, and a profit and loss chart. Pick 6 months, 1 year (the default) or all time.",
        highlight: true,
        link: "/investments?tab=trends",
      },
      {
        kind: "new",
        title: "On the main Investments page, look at everything together or one holding at a time.",
        icon: "filter",
        detail: "A holding's own page has the same tab, locked to that holding.",
      },
      {
        kind: "new",
        title: "Profit so far, plus your best and worst month, at the top of Trends.",
        icon: "income",
      },
      {
        kind: "new",
        title: "Drag across a chart to read any month, with a gentle tick as you move.",
        icon: "touch",
        detail: "A change that spans several months without an update says how many months it covers.",
      },
      {
        kind: "new",
        title: "A holding shows when its value was last updated, and a short history says it will fill in as the months go by.",
        icon: "restore",
      },
      {
        kind: "new",
        title: "Export an Investments statement as a PDF, from Investments or from any holding.",
        icon: "summary",
        detail: "Choose all holdings or one, a period (including each financial year, April to March), and a preset (Full statement, Summary or Ledger) or your own mix of sections, with an estimate of how many pages it will be. Or take the full ledger as a CSV.",
        highlight: true,
        link: "/investments?export=1",
      },
      {
        kind: "improved",
        title: "Insights exports through the same screen as Activity, as a PDF for a day, week, month or year.",
        icon: "share",
        detail: "It tells you when the chosen period is empty.",
        highlight: true,
        link: "/insights?export=1",
      },
      {
        kind: "improved",
        title: "Every PDF shares one clean letterhead and layout.",
        icon: "summary",
      },
      {
        kind: "improved",
        title: "The Activity export matches the Activity screen and leaves out trip entries.",
        icon: "flight",
      },
      {
        kind: "improved",
        title: "Exports don't run while you're offline, so you never get a half-filled file.",
        icon: "cloudOff",
      },
    ],
  },
  {
    version: "2.5.0",
    build: 19,
    date: "2026-11-12",
    headline: "Match Splitwise on trips",
    notes: [
      {
        kind: "new",
        title: "Match Splitwise:",
        icon: "people",
        detail: "type what Splitwise says each person pays you after it simplifies debts, and the trip's balances follow. A live check shows whether the amounts add up, and Save waits until they do. Your bank balances and net worth never move. \"Back to exact amounts\" undoes it. This works on closed trips too.",
        link: "/trips",
      },
      {
        kind: "new",
        title: "Each person shows what's theirs and what comes via Splitwise.",
        icon: "eye",
        detail: "People whose share is routed through others are greyed out.",
      },
      {
        kind: "new",
        title: "If you add or change trip expenses afterwards, the trip tells you the Splitwise numbers may be out of date.",
        icon: "info",
      },
      {
        kind: "new",
        title: "After a Splitwise import, when it matters, the app takes you back to the trip and opens the match.",
        icon: "flight",
      },
      {
        kind: "improved",
        title: "The Trips view in Activity is gone.",
        icon: "activity",
        detail: "Trip expenses now live on their trip's page, and Activity stays about your everyday money. The summary still says how much went on trips and opens your Trips.",
        link: "/activity",
      },
      {
        kind: "improved",
        title: "A search that matches trip expenses says so and opens the trip, or your Trips list when several match.",
        icon: "search",
      },
      {
        kind: "improved",
        title: "When importing from Splitwise, each name from the file shows in full.",
        icon: "people",
      },
    ],
  },
  {
    version: "2.4.0",
    build: 18,
    date: "2026-10-03",
    headline: "Trips out of your everyday list",
    notes: [
      {
        kind: "improved",
        title: "Activity has separate Everyday and Trips views, so one shared dinner split seven ways no longer floods your list.",
        detail: "The Trips view shows one row per expense (your share), with its own empty state.",
      },
      {
        kind: "improved",
        title: "The Everyday summary says how much went on trips and still counts trips in your savings.",
      },
      {
        kind: "improved",
        title: "The home screen's recent transactions leave trip entries out.",
      },
      {
        kind: "improved",
        title: "Quick Log no longer suggests trip expense titles.",
      },
      {
        kind: "improved",
        title: "Your week and month reviews no longer pick a trip expense as the biggest spend.",
      },
    ],
  },
  {
    version: "2.3.1",
    build: 17,
    date: "2026-10-02",
    headline: "Easier account picking",
    notes: [
      {
        kind: "improved",
        title: "Manage accounts is grouped by kind.",
        icon: "bank",
        detail: "Accounts and investments show a count and total, and people show how many are still open. Settled people fold away behind \"Show N settled\", and people read \"Owes you\" or \"You owe\". Drag-to-reorder works within each group.",
        link: "/manage-accounts",
      },
      {
        kind: "fixed",
        title: "The account picker scrolls now.",
        icon: "tools",
        detail: "It's grouped into accounts, investments and people, with people who still owe or are owed first. A search box appears when the list is long, and what you type can start a new account.",
      },
    ],
  },
  {
    version: "2.3.0",
    build: 16,
    date: "2026-10-01",
    headline: "Trip mode",
    notes: [
      {
        kind: "new",
        title: "Trips:",
        detail: "create a trip with dates, friends and an optional budget, then add shared expenses from inside it. Choose who paid and how to split it, and see each share live.",
        link: "/trips",
      },
      {
        kind: "new",
        title: "Each trip has one long page:",
        detail: "your share against the budget, balances with each friend, spending by category and by day, and a day-by-day journal.",
      },
      {
        kind: "new",
        title: "Settle up with friends, in full or in part, even after the trip is closed.",
      },
      {
        kind: "new",
        title: "Wrap up and close a trip.",
        detail: "Small leftover balances start out as \"Let go\". Reopen a trip any time, or delete it with a press-and-hold, which undoes every expense and settle-up.",
      },
      {
        kind: "new",
        title: "Import a Splitwise group export into a trip.",
        detail: "Review each row, break a lump into parts, and approve. The app checks your balance against Splitwise's own total and warns about rows outside the trip's dates. Importing again only adds new rows.",
      },
      {
        kind: "new",
        title: "The Trips list shows every trip by year, with totals.",
      },
      {
        kind: "new",
        title: "Insights shows all trip spending as one slice; tap it to open your Trips.",
      },
      {
        kind: "new",
        title: "Entries made by a trip carry a ✈ tag and an \"Open trip\" button.",
        detail: "Edit them from the trip, not from Activity.",
      },
      {
        kind: "new",
        title: "If a screen runs into a problem, you get a \"Something went wrong\" page with a reference code, Try again and Go to Home.",
        detail: "The rest of the app keeps working and remembers where you were.",
      },
      {
        kind: "new",
        title: "Error messages from the server carry a short reference code, so a problem can be traced.",
      },
      {
        kind: "improved",
        title: "Trip spending counts against the trip's budget, not your monthly category budgets.",
        detail: "It also stays out of spending alerts, recurring-payment suggestions and the cash-flow forecast.",
      },
      {
        kind: "improved",
        title: "Money friends paid for you shows as one \"Paid by friends\" slice in Insights.",
      },
      {
        kind: "improved",
        title: "Investment accounts no longer appear when choosing which account you paid from, or as your default account.",
      },
      {
        kind: "improved",
        title: "Each investment shows its own icon and colour.",
        detail: "The strongest holding is ranked by yearly return and opens when tapped.",
      },
      {
        kind: "improved",
        title: "SIP reminders talk about investing, not paying a bill.",
      },
      {
        kind: "improved",
        title: "Backups include your trips.",
      },
      {
        kind: "improved",
        title: "Switching tabs is instant.",
      },
      {
        kind: "fixed",
        title: "Safe to spend no longer counts SIPs or bills outside your budgets.",
        detail: "It says \"Bills ahead\" instead of \"Over budget\" when only bills push it below zero.",
      },
      {
        kind: "fixed",
        title: "Reminders on your phone (bills, goal deadlines, new recurring payments) no longer repeat every time you open the app.",
      },
      {
        kind: "fixed",
        title: "SIPs are blue in the cash-flow calendar, so they no longer look like income.",
      },
      {
        kind: "fixed",
        title: "A form you close without saving no longer keeps what you typed.",
      },
      {
        kind: "fixed",
        title: "A tab could open blank.",
      },
      {
        kind: "fixed",
        title: "A holding's yearly return could be cut off.",
      },
      {
        kind: "fixed",
        title: "Sheets no longer slide up under the status bar when the keyboard opens.",
      },
    ],
  },
  {
    version: "2.2.0",
    build: 15,
    date: "2026-09-26",
    headline: "Truer investment returns",
    notes: [
      {
        kind: "new",
        title: "Set both the amount invested so far and the current value on a holding, and correct the invested amount later.",
        detail: "When adding one, say whether it's a monthly SIP or a lump sum, and when it started.",
      },
      {
        kind: "new",
        title: "See each holding's yearly return, and your whole portfolio's, once about three months of money is in.",
        detail: "A prompt helps you add missing start dates.",
        link: "/investments",
      },
      {
        kind: "new",
        title: "Delete an investment completely, with a press-and-hold.",
        detail: "Choose whether to undo or keep the money it moved. The SIP bills that fund it go too.",
      },
      {
        kind: "fixed",
        title: "A holding's value chart was wrong when you added it at a value different from what you put in.",
      },
    ],
  },
  {
    version: "2.1.0",
    build: 14,
    date: "2026-09-26",
    headline: "Investments, SIPs and cash flow",
    notes: [
      {
        kind: "new",
        title: "Investments:",
        detail: "a home for your holdings, with an allocation donut, what you invested this month, your strongest holding and your SIPs. Each holding has its own page, where you update its value or take money out.",
        link: "/investments",
      },
      {
        kind: "new",
        title: "An Invest option when adding a transaction.",
        detail: "Money in and out of a holding shows as \"Invested\" or \"Redeemed\".",
      },
      {
        kind: "new",
        title: "Turn an expense you've already logged into an investment.",
      },
      {
        kind: "new",
        title: "A recurring bill can fund an investment as a SIP, and counts as invested, not spent.",
        detail: "After setting one up, the app offers to move past payments into the holding.",
      },
      {
        kind: "new",
        title: "An optional monthly reminder to update your investment values, on a day you choose.",
      },
      {
        kind: "new",
        title: "Investment highlights:",
        detail: "values that need updating, portfolio milestones and investing streaks. Week and Month in Review gain an investments section.",
      },
      {
        kind: "new",
        title: "The app spots recurring payments and income in your history and offers to turn them into bills or SIPs.",
        detail: "It tells you when it finds a new one, and remembers the ones you mark \"Not recurring\".",
        link: "/bills?suggestions=1",
      },
      {
        kind: "new",
        title: "A cash-flow calendar shows your expected balance day by day through the end of next month, using your bank, cash and wallet accounts and your typical daily spending.",
        link: "/cash-flow",
      },
      {
        kind: "new",
        title: "A \"Next 30 days\" card on the home screen warns if you might run short.",
      },
      {
        kind: "improved",
        title: "SIPs are left out of the \"bills due soon\" reminder and your bills total.",
      },
      {
        kind: "improved",
        title: "An account's type is fixed once it's created.",
      },
      {
        kind: "fixed",
        title: "Marking a bill paid twice by accident no longer charges you twice.",
      },
      {
        kind: "fixed",
        title: "Balances refresh straight after you pay a bill.",
      },
      {
        kind: "fixed",
        title: "One failed reminder on your phone no longer stops the others.",
      },
    ],
  },
  {
    version: "2.0.0",
    build: 13,
    date: "2026-09-20",
    headline: "A smarter home screen, offline mode and reviews",
    notes: [
      {
        kind: "new",
        title: "A redesigned home screen.",
        icon: "home",
        detail: "It has a For You carousel (goal watch, no-spend days, spending by weekday, and your top highlight), Quick Log, what changed since you last opened the app, where your money went, this week at a glance, and this month against your average. It also has bills and budgets at a glance, an emergency fund card, and net-worth milestones.",
      },
      {
        kind: "new",
        title: "Safe to spend:",
        icon: "wallet",
        detail: "how much you can spend per day for the rest of the month, after unpaid bills. It warns if you're likely to run short later in the month.",
        link: "/",
      },
      {
        kind: "new",
        title: "A logging streak:",
        icon: "streak",
        detail: "a flame badge on the home screen from three days in a row, plus a Highlights card.",
      },
      {
        kind: "new",
        title: "Works offline.",
        icon: "cloudOff",
        detail: "The app opens on your saved data, and a banner tells you you're offline. New entries are saved, marked \"Pending\" and sent when you're back. If one can't be sent, you can retry, edit it or discard it. Editing, deleting and exporting wait until you're online.",
      },
      {
        kind: "new",
        title: "Undo for a few seconds after deleting a transaction, bill, goal, account or category.",
        icon: "undo",
      },
      {
        kind: "new",
        title: "Week and Month in Review:",
        icon: "summary",
        detail: "a recap of each closed period, with a timeline, a comparison with the period before, habits, goals and bills, plus net worth for months. Find the last 12 months and 12 weeks under More, with a banner once when a period ends.",
        link: "/review-history",
      },
      {
        kind: "new",
        title: "A permanent history of your highlights, from this version on.",
        icon: "star",
      },
      {
        kind: "new",
        title: "Goal cards say roughly when you'll get there at your current pace.",
        icon: "flag",
      },
      {
        kind: "new",
        title: "Back up all your data, including your settings, to one file and restore it later from Settings, with a press-and-hold to confirm.",
        icon: "cloudBackup",
      },
      {
        kind: "new",
        title: "Pull down to refresh.",
        icon: "repeat",
      },
      {
        kind: "improved",
        title: "Activity filters move into one Filters screen.",
        icon: "filter",
        detail: "Pick several accounts and sub-categories at once, then \"Show N results\" or \"Clear all\".",
      },
      {
        kind: "improved",
        title: "Budget rows judge your pace, not just the percent used.",
        icon: "insights",
      },
      {
        kind: "improved",
        title: "All four summary tiles show a small trend line, and the net worth breakdown shows how it has moved.",
        icon: "investments",
      },
      {
        kind: "improved",
        title: "The home screen and transaction rows work better with VoiceOver.",
        icon: "eye",
      },
      {
        kind: "fixed",
        title: "The app no longer crashes on launch on newer iOS versions.",
        icon: "tools",
      },
    ],
  },
  {
    version: "1.10.0",
    build: 12,
    date: "2026-09-19",
    headline: "More reminders on your phone",
    notes: [
      {
        kind: "new",
        title: "Phone notifications for bills due soon, due today or overdue, goal deadlines, goal milestones, and the weekly and monthly summaries.",
        detail: "They're set up each time you open the app, so open it now and then to keep them coming.",
      },
      {
        kind: "fixed",
        title: "Insights' empty state now matches the period you're looking at, and past periods with nothing in them no longer offer an Add button.",
      },
      {
        kind: "fixed",
        title: "When a search or filter finds nothing, Activity tells you what you searched for or suggests trying a different filter.",
      },
    ],
  },
  {
    version: "1.9.0",
    build: 11,
    date: "2026-09-15",
    headline: "A Day view in Insights and smart titles",
    notes: [
      {
        kind: "new",
        title: "A Day tab in Insights, with an hour-by-hour rhythm strip, an hourly average, and comparisons with yesterday.",
        detail: "Each category's detail screen has one too.",
        link: "/insights",
      },
      {
        kind: "new",
        title: "A Projected card for the current day, week, month or year:",
        detail: "where your spending is likely to end up, against last time, and how long is left. The pace chart draws the projection as a line.",
      },
      {
        kind: "new",
        title: "Highlights for this month now appear on Insights, and can be hidden for a week.",
      },
      {
        kind: "new",
        title: "Title suggestions while logging, from the last 12 months and ranked by how often you use them.",
        detail: "Picking one also fills in its usual category, and once you've chosen a category only its titles are offered. Accept the faded suggestion with a swipe or the arrow, or tap a chip.",
      },
      {
        kind: "improved",
        title: "The Insights PDF now matches the screen:",
        detail: "pace, where it went, daily and hourly rhythm, biggest changes and the projection.",
      },
      {
        kind: "improved",
        title: "A long location no longer pushes a transaction onto two lines, and your note shows under each row and on its detail page.",
      },
    ],
  },
  {
    version: "1.8.0",
    build: 10,
    date: "2026-09-13",
    headline: "Settle up and log again",
    notes: [
      {
        kind: "new",
        title: "Settle up from a person's account.",
        detail: "It opens a transfer already filled in with the full amount, which you can change for a partial repayment.",
      },
      {
        kind: "new",
        title: "Log again today:",
        detail: "repeat any past transaction from its detail page. Repeating a split repeats only your share.",
      },
      {
        kind: "new",
        title: "Your daily summary mentions when a friend's balance hasn't changed for two weeks, then weekly after that.",
      },
    ],
  },
  {
    version: "1.7.0",
    build: 9,
    date: "2026-09-13",
    headline: "Split with friends",
    notes: [
      {
        kind: "new",
        title: "People as accounts.",
        detail: "Each one reads \"Owes you\", \"You owe\" or \"Settled up\", and net worth groups what you're owed.",
      },
      {
        kind: "new",
        title: "Split a new expense between up to 10 people right on the Add form:",
        detail: "equally or your own way, with your share and what you're owed shown as you go. Add a new person from the same place.",
      },
      {
        kind: "new",
        title: "Split entries carry a \"Split\" tag in Activity.",
        detail: "Deleting one removes the whole split and puts every balance back.",
      },
      {
        kind: "fixed",
        title: "Account balances refresh after you save, edit or delete a transaction.",
      },
    ],
  },
  {
    version: "1.6.1",
    build: 8,
    date: "2026-09-12",
    headline: "Cleaner home screen and filters",
    notes: [
      {
        kind: "new",
        title: "Your daily summary can appear on your lock screen, if it's switched on and you've opened the app that day.",
        detail: "With privacy mode on it shows no amounts, and tapping it opens Insights.",
      },
      {
        kind: "new",
        title: "Filter Activity by kind (expense, income or transfer), with categories that match.",
        detail: "Transfers hide the category filters.",
      },
      {
        kind: "improved",
        title: "Reorder categories and accounts by holding and dragging a row.",
        detail: "Sub-categories move with their parent.",
      },
      {
        kind: "improved",
        title: "The home screen puts the summary tiles first, with recent transactions below them.",
        detail: "Every tile opens where its figure comes from: Income and Expenses open Activity filtered for this month, Savings opens Insights, and Net Worth opens the account breakdown.",
      },
      {
        kind: "improved",
        title: "The greeting is now the header's title, with your name under it, and it changes as the day goes on.",
      },
      {
        kind: "improved",
        title: "Transfers read as transfers:",
        detail: "\"From → To\", both accounts on the detail page, and their own delete message.",
      },
      {
        kind: "fixed",
        title: "The four summary tiles could come out different sizes.",
      },
      {
        kind: "fixed",
        title: "Health score parts showed long decimals that squeezed the card.",
      },
      {
        kind: "fixed",
        title: "Empty space under the buttons on confirm screens.",
      },
    ],
  },
  {
    version: "1.5.0",
    build: 6,
    date: "2026-09-11",
    headline: "Richer Insights",
    notes: [
      {
        kind: "new",
        title: "New Insights cards:",
        detail: "spending pace against last period, a donut you can tap to see sub-categories, a daily heatmap with your heaviest day and clear days, and the biggest changes since last period.",
        link: "/insights",
      },
      {
        kind: "new",
        title: "A detail screen for each category, opened from the breakdown.",
        detail: "It has its own period controls, its transactions, and its share of all spending.",
      },
      {
        kind: "new",
        title: "Reorder your categories and accounts from a button in the header.",
        detail: "New ones go to the end.",
      },
      {
        kind: "new",
        title: "Edit and delete bills and goals.",
        detail: "Deleting one keeps its past payments in your transactions.",
      },
      {
        kind: "new",
        title: "Tap net worth to see what each account holds, with accounts in the red marked and a shortcut to manage them.",
      },
      {
        kind: "new",
        title: "A greeting that changes with the time of day, the day of the week, the start and end of the month, and festivals.",
      },
      {
        kind: "new",
        title: "A Done bar above the keyboard, so you can close it without closing the form.",
      },
      {
        kind: "improved",
        title: "Recent transactions lead the home screen.",
      },
      {
        kind: "improved",
        title: "The Insights export lists sub-categories under their parent.",
      },
      {
        kind: "improved",
        title: "A brighter app icon:",
        detail: "a white piggy bank on violet, with more depth.",
      },
      {
        kind: "improved",
        title: "Reminders and summaries arrive more reliably.",
      },
      {
        kind: "improved",
        title: "Long bill and goal names stay on one line.",
      },
      {
        kind: "fixed",
        title: "After a quiet spell, the app no longer runs into errors while the server wakes up.",
      },
      {
        kind: "fixed",
        title: "Swiping down with the keyboard open closed the whole form.",
        detail: "Now it just closes the keyboard.",
      },
      {
        kind: "fixed",
        title: "Switching tabs could show a blank screen.",
      },
      {
        kind: "fixed",
        title: "A sheet you had just closed sometimes ignored the next tap to open it again.",
      },
    ],
  },
  {
    version: "1.3.0",
    build: 4,
    date: "2026-09-08",
    headline: "Balances that match your bank",
    notes: [
      {
        kind: "new",
        title: "Correct an account balance to the figure your bank shows.",
        detail: "You see the difference before you save, and can add a reason. Bank and card accounts can be set to overdrawn or owed. Each account shows when you last checked it.",
      },
      {
        kind: "new",
        title: "Daily and monthly summaries, each with its own switch.",
        detail: "Monthly is on by default and names where most of your money went. Daily is off by default. A period with nothing in it sends nothing.",
      },
      {
        kind: "new",
        title: "New Help answers on fixing a balance and on the summaries.",
      },
      {
        kind: "improved",
        title: "Deleting your account can now be undone:",
        detail: "sign in again and everything is back. Reminders and summaries stop while it's deleted.",
      },
      {
        kind: "improved",
        title: "Balance corrections stay out of your Activity list.",
        detail: "They still appear in exports.",
      },
      {
        kind: "fixed",
        title: "Searches with symbols like brackets no longer fail.",
        detail: "Extra spaces are ignored.",
      },
      {
        kind: "fixed",
        title: "Budgets and Activity no longer flash the previous period's figures while a new one loads.",
      },
      {
        kind: "fixed",
        title: "Tap-to-peek works on the home screen amounts, and the peek button is on every screen.",
      },
      {
        kind: "fixed",
        title: "App lock now also applies when the app first opens.",
      },
    ],
  },
  {
    version: "1.2.0",
    build: 3,
    date: "2026-09-06",
    headline: "A friendly first run",
    notes: [
      {
        kind: "new",
        title: "A welcome tour after you sign up, which confirms your account was created.",
        detail: "You can skip it from any slide.",
      },
      {
        kind: "new",
        title: "A Get started checklist on the home screen.",
        detail: "It ticks itself off from what you've actually done, can be hidden, and goes away once all five steps are done.",
      },
      {
        kind: "new",
        title: "The help page answers what to set up first.",
      },
      {
        kind: "improved",
        title: "An empty home screen or Activity list now offers to add your first transaction.",
      },
    ],
  },
  {
    version: "1.1.0",
    build: 2,
    date: "2026-09-06",
    headline: "Highlights, settings and your health score",
    notes: [
      {
        kind: "new",
        title: "Highlights, reached from More:",
        detail: "up to four short cards about your money, ranked by how much is at stake. Tap one to go to the right screen, or hide it for a week. New accounts see \"Warming up\" for about two weeks. This replaces the \"AI Assistant, coming soon\" entry.",
      },
      {
        kind: "new",
        title: "Your health score is now worked out from your own money instead of a sample figure:",
        detail: "savings rate, safety buffer, bills on time, budgets on pace and goals on pace, over the last 90 days. Parts that don't apply are left out. It has its own detail page, and shows \"Not enough data\" until there's enough history.",
        link: "/health",
      },
      {
        kind: "new",
        title: "Settings:",
        detail: "edit your name, choose a default account and your time zone, set notification preferences, change your password (with a strength meter), log out, and delete your account with a press-and-hold.",
      },
      {
        kind: "new",
        title: "App lock with Face ID, fingerprint or passcode, locking immediately, after 1 minute or after 5 minutes.",
      },
      {
        kind: "new",
        title: "Privacy mode shows amounts as \"₹ ••••\".",
        detail: "Tap any amount, or the eye button by the bell, to show them all for 10 seconds. Exports always show real amounts.",
      },
      {
        kind: "new",
        title: "Manage your accounts (bank, credit card, cash or wallet, with an opening balance) and your categories.",
        detail: "Deleting either archives it and keeps its history.",
      },
      {
        kind: "new",
        title: "Two-level categories:",
        detail: "headings with sub-categories, created right from the category picker or in Manage categories. Deleting a heading archives its sub-categories after a warning. New accounts start with a ready-made set of 8 headings and 21 sub-categories.",
      },
      {
        kind: "new",
        title: "Notifications inside the app, under the bell, with a badge on the app icon.",
        detail: "They cover bills due soon, due today and overdue, budgets at 80% and over, goal milestones and deadlines, and an optional weekly summary.",
      },
      {
        kind: "new",
        title: "Browse past months on the Budget screen, see what was unspent, and set a limit for a month that has ended.",
      },
      {
        kind: "new",
        title: "A full-screen Add Goal with the keypad, a live preview and what the goal costs each month.",
      },
      {
        kind: "new",
        title: "Help & FAQ and privacy policy pages, also on the More tab, which now shows live budget, bill and goal status.",
        link: "/help",
      },
      {
        kind: "new",
        title: "The app icon and launch screen:",
        detail: "a piggy bank taking a rupee coin.",
      },
      {
        kind: "improved",
        title: "Every date, \"today\" and \"this month\" follows your own time zone.",
      },
      {
        kind: "improved",
        title: "Haptic ticks, small animations and confirmation messages throughout, including a tick as you drag across charts.",
      },
      {
        kind: "improved",
        title: "A friendly waiting screen while the server wakes up, with \"Try again\" and \"Continue anyway\".",
      },
      {
        kind: "improved",
        title: "Sub-categories show their parent wherever they're named.",
        detail: "Budgets and Insights count sub-category spending in the parent, and a budget alert names the sub-category that tipped it.",
      },
      {
        kind: "improved",
        title: "The CSV export splits category and sub-category into their own columns.",
      },
      {
        kind: "fixed",
        title: "The app closed itself the moment it opened on the phone.",
      },
      {
        kind: "fixed",
        title: "You were signed out when the server couldn't be reached.",
      },
      {
        kind: "fixed",
        title: "\"Today\" in Activity could be wrong late at night, and a late purchase could fall into the wrong day or month.",
      },
      {
        kind: "fixed",
        title: "A bill due at the end of a month rolled to the wrong date (31 Jan became 3 Mar).",
      },
      {
        kind: "fixed",
        title: "A picked due date could shift to the day before.",
      },
      {
        kind: "fixed",
        title: "Sheets could pop up over unrelated screens, closing a picker could close the form under it, and a reopened sheet kept its old scroll position.",
      },
    ],
  },
  {
    version: "1.0.0",
    build: 1,
    date: "2026-09-04",
    headline: "The first version",
    notes: [
      {
        kind: "new",
        title: "Sign up and log in, with a password strength meter.",
        detail: "You start with a ready set of categories and a Cash account, and stay signed in between launches.",
      },
      {
        kind: "new",
        title: "A home screen with the month's income, spending, savings and net worth, plus upcoming bills, goals, recent transactions and a + button to add more.",
      },
      {
        kind: "new",
        title: "Log expenses, income and transfers on a big ₹ keypad, with the account, date and time, category and sub-category, a note and a location.",
        detail: "See what the account will have left before you save. Edit an expense or income later, or delete any entry.",
      },
      {
        kind: "new",
        title: "Activity:",
        detail: "every transaction grouped by day with month dividers, with search, a category and sub-category filter, and day, week, month, year or all-time views that you can step back through, each with a summary.",
      },
      {
        kind: "new",
        title: "Insights:",
        detail: "income against spending over recent periods, spending by category and by account, your average daily spend, top category and savings rate.",
      },
      {
        kind: "new",
        title: "Export Activity for any time span as CSV or PDF, and Insights as a PDF report with charts.",
      },
      {
        kind: "new",
        title: "Monthly budgets per category, with sub-category spending counted in the parent.",
        detail: "Each shows on track, warning or over, days left and a daily limit.",
      },
      {
        kind: "new",
        title: "Bills, once, monthly or yearly.",
        detail: "Paying one records the expense from the account you choose, and you can skip a cycle of a recurring bill.",
      },
      {
        kind: "new",
        title: "Savings goals with an optional target date, an icon and colour, and quick amounts to add.",
      },
      {
        kind: "new",
        title: "Create your own categories, with about 80 icons and 10 colours, from the category picker.",
      },
      {
        kind: "new",
        title: "Amounts use Indian digit grouping, on a dark \"Midnight Glass\" look.",
      },
    ],
  },
];
