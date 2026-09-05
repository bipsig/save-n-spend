import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { haptics } from "@/lib/haptics";
import { searchZones, shortlistZones } from "@/lib/timezones";
import { deviceZone } from "@/lib/zone";
import { colors, radius, spacing } from "@/theme";

// Fixed height, like the category picker: the list is long, and a sheet that grows to
// fit it would open at a different height depending on what was typed last.
const SNAP_POINTS = ["78%"];

type Props = {
  /** The zone currently saved on the account. */
  value: string;
  /** Awaited, so a failed save keeps the sheet open with the reason. */
  onPick: (zone: string) => Promise<void> | void;
};

// Choosing the zone the whole app reads its days from (see lib/zone). Every other
// setting sheet in the app is a short list of choices; this one can't be, so it
// leads with the device's own zone and a curated shortlist and lets search reach
// the rest.
const TimeZoneSheet = forwardRef<BottomSheetModal, Props>(({ value, onPick }, ref) => {
  // Own handle, so `dismiss` closes *this* sheet rather than the top of gorhom's
  // provider-wide queue.
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const device = deviceZone();
  const browsing = search.trim() === "";
  const results = useMemo(() => (browsing ? shortlistZones() : searchZones(search)), [browsing, search]);
  // Offered as its own row above the list, so it isn't also listed inside it.
  const showDeviceRow = browsing && device !== value;

  const reset = () => {
    setSearch("");
    setPending(null);
    setError(null);
  };

  const choose = async (zone: string) => {
    if (pending !== null) return;
    if (zone === value) {
      dismiss();
      return;
    }
    setPending(zone);
    setError(null);
    try {
      await onPick(zone);
      dismiss();
    }
    catch (err) {
      // Kept in the sheet rather than toasted: the sheet stays open on failure and
      // the reason belongs beside the row that refused.
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't save that time zone. Try again.");
      setPending(null);
    }
  };

  const row = (
    zone: string,
    title: string,
    subtitle: string,
    key: string = zone,
  ) => {
    const selected = zone === value;
    return (
      // `select`, not the default tap: this is landing on one item out of a set,
      // which is the tick the OS reserves for exactly that.
      <PressableScale
        key={key}
        style={[styles.row, selected && styles.rowSelected, pending === zone && styles.rowPending]}
        scaleTo={0.98}
        haptic={false}
        onPress={() => {
          haptics.select();
          void choose(zone);
        }}
      >
        <View style={styles.info}>
          <AppText size="sm" weight="bold" numberOfLines={1}>
            {title}
          </AppText>
          <AppText size="xs" color="inkDim" numberOfLines={1}>
            {subtitle}
          </AppText>
        </View>
        {selected && <Icon name="budgetOk" size={20} color="success" />}
      </PressableScale>
    );
  };

  return (
    // Keyed on the search term, so each new set of results starts at the top. Typing
    // into a scrolled shortlist otherwise leaves you looking at the middle of a list
    // that is now three entries long.
    <AppSheet ref={innerRef} onDismiss={reset} scrollable snapPoints={SNAP_POINTS} scrollResetKey={search.trim()}>
      <View style={styles.identity}>
        <Icon name="clock" size={24} containerSize={52} container="square" gradient="accent" />
        <View style={styles.identityText}>
          <AppText size="md" weight="black">
            Time zone
          </AppText>
          <AppText size="sm" color="inkDim">
            Decides which day a transaction lands on, when a month starts and ends,
            and the hour reminders arrive.
          </AppText>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Icon name="search" size={18} color="gray500" />
        <BottomSheetTextInput
          placeholder="Search a city, region or offset"
          placeholderTextColor={colors.gray400}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
        />
      </View>

      {/* The device's zone is offered as its own row, above search, so the common
          case — "just use where I am" — never needs typing. It stays out of the
          list below to avoid the same zone appearing twice. */}
      {showDeviceRow && (
        <View style={styles.block}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.blockLabel}>
            THIS DEVICE
          </AppText>
          {row(device, "Use this device's time zone", device.replace(/_/g, " "), `device-${device}`)}
        </View>
      )}

      <View style={styles.block}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.blockLabel}>
          {browsing ? "COMMON" : "RESULTS"}
        </AppText>
        {results.length > 0 ? (
          results
            .filter((option) => !(showDeviceRow && option.zone === device))
            .map((option) => row(option.zone, option.city, `${option.region} · ${option.offset}`))
        ) : (
          <AppText size="sm" color="inkDim">
            No time zone matches that. Try a nearby city.
          </AppText>
        )}
      </View>

      {error && (
        <AppText size="sm" color="danger" style={styles.error}>
          {error}
        </AppText>
      )}
    </AppSheet>
  );
});

TimeZoneSheet.displayName = "TimeZoneSheet";

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: 3,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
  },
  block: {
    gap: spacing.sm,
  },
  blockLabel: {
    letterSpacing: 1.3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rowSelected: {
    borderColor: "rgba(163,148,255,0.5)",
    backgroundColor: "rgba(139,123,255,0.15)",
  },
  rowPending: {
    opacity: 0.6,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  error: {
    textAlign: "center",
  },
});

export default TimeZoneSheet;
