import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import BackButton from "@/components/shell/BackButton";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import SettingsRow from "@/components/rows/SettingsRow";
import AccountPickerSheet from "@/components/sheets/AccountPickerSheet";
import ChangePasswordSheet from "@/components/sheets/ChangePasswordSheet";
import ConfirmSheet from "@/components/sheets/ConfirmSheet";
import EditProfileSheet from "@/components/sheets/EditProfileSheet";
import ExportSheet from "@/components/sheets/ExportSheet";
import OptionSheet, { type Option } from "@/components/sheets/OptionSheet";
import TimeZoneSheet from "@/components/sheets/TimeZoneSheet";
import { AppText } from "@/components/ui/AppText";
import Avatar from "@/components/ui/Avatar";
import PressableScale from "@/components/ui/PressableScale";
import { useAccounts, useDefaultAccount } from "@/lib/accounts";
import { exportBackup, pickBackupFile, restoreBackup, type PickedBackup } from "@/lib/backup";
import { useCategories } from "@/lib/categories";
import { formatFullDate } from "@/lib/date";
import { lockCapability, authenticate } from "@/lib/lock";
import { detachPush, registerForPush } from "@/lib/push";
import {
  FALLBACK_PREFS,
  deleteAccount,
  initialsOf,
  updatePrefs,
} from "@/lib/profile";
import { zoneLabel } from "@/lib/timezones";
import { zoneMatchesDevice } from "@/lib/zone";
import { useAccountStore } from "@/store/accounts";
import { useCategoryStore } from "@/store/categories";
import { useSession } from "@/store/session";
import { AUTO_LOCK_DELAYS, autoLockLabel, useSettings, type AutoLockSeconds } from "@/store/settings";
import { useOutbox } from "@/store/outbox";
import { toast } from "@/store/toast";
import { spacing } from "@/theme";
import type { BillReminderLead } from "@save-n-spend/types";

// Tiny caps group label (spec .flabel) — same treatment as the More hub's.
const GroupLabel = ({ children }: { children: string }) => (
  <AppText size="xs" weight="bold" color="inkDim" style={styles.groupLabel}>
    {children}
  </AppText>
);

const REMINDER_LEADS: Option[] = [
  { value: 1, label: "1 day" },
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
];

const AUTO_LOCK_OPTIONS: Option[] = AUTO_LOCK_DELAYS.map((seconds) => ({
  value: seconds,
  label: autoLockLabel(seconds),
}));

const SettingsScreen = () => {
  const user = useSession((s) => s.user);
  const prefs = user?.prefs ?? FALLBACK_PREFS;
  const notifications = prefs.notifications;

  const accounts = useAccounts();
  const categories = useCategories();
  const defaultAccount = useDefaultAccount();

  // Device-local half: never sent to the server (spec §10).
  const { privacyMode, appLock, autoLockSeconds, update } = useSettings();

  const profileRef = useRef<BottomSheetModal>(null);
  const accountRef = useRef<BottomSheetModal>(null);
  const zoneRef = useRef<BottomSheetModal>(null);
  const reminderRef = useRef<BottomSheetModal>(null);
  const autoLockRef = useRef<BottomSheetModal>(null);
  const passwordRef = useRef<BottomSheetModal>(null);
  const exportRef = useRef<BottomSheetModal>(null);
  const logoutRef = useRef<BottomSheetModal>(null);
  const deleteRef = useRef<BottomSheetModal>(null);
  const restoreRef = useRef<BottomSheetModal>(null);

  const [backingUp, setBackingUp] = useState(false);
  // Set by pickBackupFile, right before the confirm sheet opens — it's what the
  // sheet's body states concrete facts from (dated, counted), and what onConfirm
  // below actually restores.
  const [picked, setPicked] = useState<PickedBackup | null>(null);

  // Signing out clears the in-memory queue but leaves the file on disk (see
  // store/outbox.ts) — real, but worth naming before someone signs out mid-flight and
  // wonders where a transaction went.
  const pendingSync = useOutbox((s) => s.items.length);

  // Every account-level write goes through here, so one place owns the failure message.
  // Success is silent: each row prints the value it just saved, so a "Saved" banner would
  // restate what is already on screen. Only a failure needs saying — the row flips
  // optimistically, so without this the screen shows a setting the server never took.
  const savePrefs = async (patch: Parameters<typeof updatePrefs>[0]) => {
    try {
      await updatePrefs(patch);
    }
    catch (err) {
      toast.fromError(err, "Couldn't save that setting. Try again.");
      throw err; // let an option sheet stay open and show the reason
    }
  };

  const setNotification = (patch: Partial<typeof notifications>) => {
    void savePrefs({ notifications: patch }).catch(() => {});
  };

  // Turning the lock ON must prove the device can do it, and that the user is who the lock
  // will be checking, or the switch promises protection the hardware can't deliver.
  const toggleAppLock = async (next: boolean) => {
    if (!next) {
      update({ appLock: false });
      toast.info("App Lock is off");
      return;
    }
    const capability = await lockCapability();
    if (!capability.available) {
      toast.error(capability.label);
      return;
    }
    const passed = await authenticate("Confirm it's you to turn on App Lock");
    if (!passed) {
      toast.error("Couldn't confirm it was you, so App Lock stayed off.");
      return;
    }
    update({ appLock: true });
    // The one toggle whose result isn't visible here: it changes the next app launch.
    toast.success("App Lock is on");
  };

  const handleBackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      await exportBackup();
    }
    catch (err) {
      toast.fromError(err, "Couldn't create a backup. Try again.");
    }
    finally {
      setBackingUp(false);
    }
  };

  const handlePickBackup = async () => {
    try {
      const result = await pickBackupFile();
      if (!result) return; // cancelled
      setPicked(result);
      restoreRef.current?.present();
    }
    catch (err) {
      toast.fromError(err, "Couldn't read that file.");
    }
  };

  // Everything budgets/goals/bills need is picked up by their own screens'
  // useFocusEffect the next time they're visited — only the two long-lived
  // Zustand stores (accounts, categories) and the cached session user need an
  // explicit refresh here.
  const handleRestore = async () => {
    if (!picked) return;
    const result = await restoreBackup(picked.payload);
    useSession.getState().setUser(result.user);
    await Promise.all([useAccountStore.getState().load(), useCategoryStore.getState().load()]);
    setPicked(null);
    toast.success("Backup restored");
    router.replace("/(tabs)");
  };

  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <ScreenScaffold
      header={
        <View style={styles.head}>
          <BackButton />
          <AppText size="xl" weight="black">
            Settings
          </AppText>
        </View>
      }
    >
      {/* Profile card — the profile surface lives here, one tap from Edit. */}
      <Card style={styles.profileCard}>
        <Avatar initials={initialsOf(user?.name)} size="lg" gradient />
        <View style={styles.profileInfo}>
          <AppText size="md" weight="black" numberOfLines={1}>
            {user?.name ?? ""}
          </AppText>
          <AppText size="xs" color="inkDim" numberOfLines={1}>
            {user?.email ?? ""}
          </AppText>
        </View>
        <PressableScale
          onPress={() => profileRef.current?.present()}
          scaleTo={0.9}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          <AppText size="sm" weight="bold" color="primary">
            Edit
          </AppText>
        </PressableScale>
      </Card>

      <GroupLabel>PREFERENCES</GroupLabel>
      <Card padded={false} style={styles.group}>
        <SettingsRow
          kind="value"
          first
          icon="wallet"
          tint="blue"
          label="Default account"
          value={defaultAccount?.name ?? "No default"}
          onPress={() => accountRef.current?.present()}
        />
        {/* The sub-line only appears when the account's zone and the phone's have
            drifted apart — usually because the user travelled. Saying so is the
            difference between "my dates look wrong" and "oh, right". */}
        <SettingsRow
          kind="value"
          icon="clock"
          tint="violet"
          label="Time zone"
          sub={zoneMatchesDevice(prefs.timeZone) ? undefined : "Doesn't match this device"}
          value={zoneLabel(prefs.timeZone)}
          onPress={() => zoneRef.current?.present()}
        />
        <SettingsRow
          kind="toggle"
          icon="eyeOff"
          tint="indigo"
          label="Privacy mode"
          sub="Hide amounts as ₹ •••• — tap any one to peek for 10s"
          on={privacyMode}
          onToggle={(next) => update({ privacyMode: next })}
        />
        {/* Locked, not hidden: the app has decided INR, and saying so beats
            leaving the user hunting for a setting that isn't there. */}
        <SettingsRow
          kind="value"
          icon="rupee"
          tint="green"
          label="Currency"
          sub="Fixed for now — INR only"
          value="₹ INR"
          locked
        />
      </Card>

      <GroupLabel>NOTIFICATIONS</GroupLabel>
      <Card padded={false} style={styles.group}>
        <SettingsRow
          kind="toggle"
          first
          icon="notificationsOn"
          tint="amber"
          label="Allow notifications"
          sub="Reminders always appear under the bell — this controls the ones that reach your phone"
          on={notifications.enabled}
          onToggle={(next) => {
            setNotification({ enabled: next });
            // The moment to (re)claim a push token, so someone who never granted the OS
            // permission or reinstalled is asked rather than silently getting no pushes.
            if (next) void registerForPush();
          }}
        />
        {/* The four below are the master switch's children: still readable when it
            is off, but dimmed, because nothing they describe would fire. */}
        <SettingsRow
          kind="value"
          icon="alarm"
          tint="orange"
          label="Bill reminders"
          value={`${notifications.billReminderLead} day${notifications.billReminderLead === 1 ? "" : "s"} before`}
          dimmed={!notifications.enabled}
          onPress={() => reminderRef.current?.present()}
        />
        <SettingsRow
          kind="toggle"
          icon="insights"
          tint="violet"
          label="Budget alerts"
          sub="At 80% and when a category goes over"
          dimmed={!notifications.enabled}
          on={notifications.budgetAlerts}
          onToggle={(next) => setNotification({ budgetAlerts: next })}
        />
        <SettingsRow
          kind="toggle"
          icon="flag"
          tint="green"
          label="Goal milestones"
          sub="At 25 / 50 / 75 / 100%"
          dimmed={!notifications.enabled}
          on={notifications.goalMilestones}
          onToggle={(next) => setNotification({ goalMilestones: next })}
        />
        {/* The three digests, listed shortest period first so the frequency reads down
            the group. Each `sub` names the period it covers and how often it lands —
            never a clock time. The server staggers them an hour apart, but that is a
            scheduling detail: no one turns a switch on wanting to know it fires at 7pm,
            and an exact hour would be a promise the hourly job can't keep anyway. Help
            answers it for anyone who does wonder. */}
        <SettingsRow
          kind="toggle"
          icon="summary"
          tint="teal"
          label="Daily summary"
          sub="Yesterday's spending, each evening"
          dimmed={!notifications.enabled}
          on={notifications.dailySummary}
          onToggle={(next) => setNotification({ dailySummary: next })}
        />
        <SettingsRow
          kind="toggle"
          icon="summary"
          tint="teal"
          label="Weekly summary"
          sub="The week just gone, every Monday"
          dimmed={!notifications.enabled}
          on={notifications.weeklySummary}
          onToggle={(next) => setNotification({ weeklySummary: next })}
        />
        <SettingsRow
          kind="toggle"
          icon="summary"
          tint="teal"
          label="Monthly summary"
          sub="Last month on the 1st, with your biggest category"
          dimmed={!notifications.enabled}
          on={notifications.monthlySummary}
          onToggle={(next) => setNotification({ monthlySummary: next })}
        />
      </Card>

      <GroupLabel>SECURITY</GroupLabel>
      <Card padded={false} style={styles.group}>
        <SettingsRow
          kind="toggle"
          first
          icon="fingerprint"
          tint="red"
          label="App lock"
          sub="Face ID / fingerprint on open"
          on={appLock}
          onToggle={(next) => void toggleAppLock(next)}
        />
        <SettingsRow
          kind="value"
          icon="timer"
          tint="indigo"
          label="Auto-lock"
          value={autoLockLabel(autoLockSeconds)}
          dimmed={!appLock}
          onPress={() => autoLockRef.current?.present()}
        />
        <SettingsRow
          kind="nav"
          icon="key"
          tint="blue"
          label="Change password"
          onPress={() => passwordRef.current?.present()}
        />
      </Card>

      <GroupLabel>DATA</GroupLabel>
      <Card padded={false} style={styles.group}>
        <SettingsRow
          kind="value"
          first
          icon="category"
          tint="pink"
          label="Manage categories"
          value={String(categories.length)}
          onPress={() => router.push("/manage-categories")}
        />
        <SettingsRow
          kind="value"
          icon="bank"
          tint="blue"
          label="Manage accounts"
          value={String(accounts.length)}
          onPress={() => router.push("/manage-accounts")}
        />
        <SettingsRow
          kind="value"
          icon="download"
          tint="teal"
          label="Export all data"
          value="CSV"
          onPress={() => exportRef.current?.present()}
        />
        <SettingsRow
          kind="value"
          icon="cloudBackup"
          tint="indigo"
          label="Backup data"
          sub="A full copy you can restore from later"
          value={backingUp ? "…" : "JSON"}
          dimmed={backingUp}
          onPress={() => void handleBackup()}
        />
      </Card>

      <GroupLabel>ABOUT</GroupLabel>
      <Card padded={false} style={styles.group}>
        <SettingsRow
          kind="nav"
          first
          icon="help"
          tint="amber"
          label="Help & FAQ"
          onPress={() => router.push("/help")}
        />
        <SettingsRow
          kind="nav"
          icon="policy"
          tint="violet"
          label="Privacy policy"
          onPress={() => router.push("/privacy-policy")}
        />
        {/* No onPress, so no chevron — the row states a fact rather than leading anywhere. */}
        <SettingsRow kind="value" icon="info" tint="blue" label="Version" value={version} />
      </Card>

      {/* Danger card — isolated below everything, so neither row can be reached by
          a stray tap aimed at a setting (spec §10). */}
      <Card padded={false} style={[styles.group, styles.dangerCard]}>
        <SettingsRow
          kind="danger"
          first
          icon="logout"
          label="Log out"
          onPress={() => logoutRef.current?.present()}
        />
        <SettingsRow
          kind="danger"
          icon="delete"
          label="Delete account"
          sub="Signs you out and stops all reminders"
          onPress={() => deleteRef.current?.present()}
        />
        <SettingsRow
          kind="danger"
          icon="restore"
          label="Restore from backup"
          sub="Replaces everything currently in the app — cannot be undone"
          onPress={() => void handlePickBackup()}
        />
      </Card>

      {/* Sheets are mounted unconditionally — a sheet rendered inside a branch
          would unmount mid-animation the frame its condition flips. */}
      <EditProfileSheet ref={profileRef} />

      <AccountPickerSheet
        ref={accountRef}
        title="Default account"
        selectedId={prefs.defaultAccount ?? null}
        onPick={(id) => void savePrefs({ defaultAccount: id }).catch(() => {})}
        onClear={() => void savePrefs({ defaultAccount: null }).catch(() => {})}
      />

      <TimeZoneSheet
        ref={zoneRef}
        value={prefs.timeZone}
        onPick={(timeZone) => savePrefs({ timeZone })}
      />

      <OptionSheet
        ref={reminderRef}
        icon="alarm"
        title="Bill reminders"
        subtitle="How far ahead of a due date we nudge you."
        options={REMINDER_LEADS}
        value={notifications.billReminderLead}
        onPick={(days) =>
          savePrefs({ notifications: { billReminderLead: days as BillReminderLead } })
        }
      />

      <OptionSheet
        ref={autoLockRef}
        icon="timer"
        title="Auto-lock"
        subtitle="How long the app can sit in the background before it asks again."
        options={AUTO_LOCK_OPTIONS}
        value={autoLockSeconds}
        onPick={(seconds) => update({ autoLockSeconds: seconds as AutoLockSeconds })}
      />

      <ChangePasswordSheet ref={passwordRef} />

      <ExportSheet ref={exportRef} defaultRange="all" />

      <ConfirmSheet
        ref={logoutRef}
        icon="logout"
        title="Log out?"
        body={
          pendingSync > 0
            ? `${pendingSync} transaction${pendingSync === 1 ? "" : "s"} haven't synced yet — they'll sync once you're signed back in. Your data stays on the server. You'll need your password to sign back in.`
            : "Your data stays on the server. You'll need your password to sign back in."
        }
        confirmLabel="Log out"
        // detachPush first, while the request is still authenticated: a token left on the
        // account keeps pushing this user's reminders to whoever signs in next.
        onConfirm={async () => {
          await detachPush();
          await useSession.getState().signOut();
        }}
      />

      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title="Delete account?"
        // Says the reversibility out loud. The hold is kept anyway: this signs them out and
        // silences every reminder, so a stray tap on the row above must not reach it.
        body="You'll be signed out and we'll stop sending you reminders. Nothing is erased — sign in again with the same email and password and every transaction, budget, bill, goal, and account comes back as it was."
        confirmLabel="Delete my account"
        hold
        onConfirm={deleteAccount}
      />

      <ConfirmSheet
        ref={restoreRef}
        icon="restore"
        title="Restore this backup?"
        body={
          picked
            ? `This replaces every account, transaction, budget, bill, and goal currently in the app with the backup from ${formatFullDate(picked.exportedAt)} — ${picked.counts.transactions} transaction${picked.counts.transactions === 1 ? "" : "s"} across ${picked.counts.accounts} account${picked.counts.accounts === 1 ? "" : "s"}. This cannot be undone.`
            : ""
        }
        confirmLabel="Restore"
        hold
        onConfirm={handleRestore}
      />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  groupLabel: {
    letterSpacing: 1.5, // spec .flabel tracking
    paddingHorizontal: 2,
    marginTop: spacing.xs,
  },
  group: {
    paddingVertical: 2,
  },
  dangerCard: {
    marginTop: spacing.md,
    borderColor: "rgba(255,107,116,0.28)",
  },
});

export default SettingsScreen;
