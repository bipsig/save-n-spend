import { useRef } from "react";
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
import { useCategories } from "@/lib/categories";
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
import { useSession } from "@/store/session";
import { AUTO_LOCK_DELAYS, autoLockLabel, useSettings, type AutoLockSeconds } from "@/store/settings";
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

  // Every account-level write goes through here, so one place owns the failure
  // message and no row has to repeat the try/catch.
  //
  // Success is deliberately silent: each of these rows prints the value it just
  // saved, so a "Saved" banner would only restate what is already on screen. Only
  // a failure needs saying — the row flips optimistically, so without this the
  // screen would be showing a setting the server never took.
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

  // Turning the lock ON has to prove the device can actually do it, and that the
  // user is who the lock will be checking — otherwise the switch would promise
  // protection the hardware can't deliver.
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
    // The one toggle whose result isn't visible on this screen: what changed is
    // what happens the next time the app is opened.
    toast.success("App Lock is on");
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
            // Turning it on is the moment to (re)claim a push token: someone whose OS
            // permission was never granted, or who reinstalled, gets asked here rather
            // than silently getting an in-app-only feed.
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
        <SettingsRow
          kind="toggle"
          icon="summary"
          tint="teal"
          label="Weekly summary"
          sub="Every Monday morning"
          dimmed={!notifications.enabled}
          on={notifications.weeklySummary}
          onToggle={(next) => setNotification({ weeklySummary: next })}
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
          sub="Erases every transaction, budget, and goal"
          onPress={() => deleteRef.current?.present()}
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
        body="Your data stays on the server. You'll need your password to sign back in."
        confirmLabel="Log out"
        // detachPush first: it is an authenticated request, and a token left on the
        // account would keep pushing this user's reminders to a phone somebody else
        // is now signed in on.
        onConfirm={async () => {
          await detachPush();
          await useSession.getState().signOut();
        }}
      />

      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title="Delete account?"
        body="This erases your account and every transaction, budget, bill, goal, and category in it. It cannot be undone."
        confirmLabel="Delete my account"
        hold
        onConfirm={deleteAccount}
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
