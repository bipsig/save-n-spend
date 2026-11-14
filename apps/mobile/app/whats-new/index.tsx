import { Fragment, useEffect, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import BackButton from "@/components/shell/BackButton";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import { AppText } from "@/components/ui/AppText";
import TimelineEntry, { MonthLabel, RAIL_CENTRE, RAIL_GUTTER } from "@/components/whatsNew/TimelineEntry";
import { RELEASES } from "@/data/releaseNotes";
import { haptics } from "@/lib/haptics";
import { compareVersions, monthGroups } from "@/lib/whatsNew";
import { useAppZone } from "@/lib/zone";
import { useSettings } from "@/store/settings";
import { toast } from "@/store/toast";
import { APP_VERSION, useWhatsNew } from "@/store/whatsNew";
import { colors, spacing } from "@/theme";

// Notes for a version newer than this build (written ahead of a bump) stay hidden.
const SHIPPED = RELEASES.filter((r) => compareVersions(r.version, APP_VERSION) <= 0);

// Settings › What's new: every version, newest first, under month headers.
const WhatsNewScreen = () => {
  const zone = useAppZone();
  const groups = monthGroups(SHIPPED, zone);

  useEffect(() => {
    useWhatsNew.getState().markSeen(APP_VERSION);
  }, []);

  // The hidden developer switch: seven taps on "You're on" inside a couple of seconds of each
  // other. From the fourth, a toast counts down so the gesture is discoverable once started.
  const taps = useRef({ count: 0, last: 0 });
  const tapVersion = () => {
    const now = Date.now();
    taps.current.count = now - taps.current.last < 1500 ? taps.current.count + 1 : 1;
    taps.current.last = now;
    const left = 7 - taps.current.count;
    if (left <= 0) {
      taps.current.count = 0;
      const next = !useSettings.getState().diagnostics;
      useSettings.getState().update({ diagnostics: next });
      haptics.success();
      toast.info(next ? "Diagnostics on — it's at the bottom of Settings" : "Diagnostics off");
    }
    else if (left <= 3) {
      haptics.tap();
      toast.info(`${left} more tap${left === 1 ? "" : "s"}`);
    }
  };

  const open = (version: string) => router.push(`/whats-new/${version}`);

  return (
    <ScreenScaffold
      header={
        <View style={styles.head}>
          <BackButton />
          <AppText size="xl" weight="black" numberOfLines={1} style={styles.headTitle}>
            What's new
          </AppText>
        </View>
      }
    >
      <View style={styles.youWrap}>
        {/* A plain press target: the row states a fact, and seven quick taps on it switch
            the hidden Diagnostics screen on or off. */}
        <Pressable onPress={tapVersion} accessibilityRole="text" accessibilityLabel={`You're on ${APP_VERSION}`}>
          <AppText size="sm" weight="bold" color="inkSecondary">
            {`You're on ${APP_VERSION}`}
          </AppText>
        </Pressable>
        {groups.length > 0 && (
          <AppText size="xs" color="inkDim">
            {`${SHIPPED.length} version${SHIPPED.length === 1 ? "" : "s"} since ${groups[groups.length - 1].label}`}
          </AppText>
        )}
      </View>

      <View style={styles.timeline}>
        <LinearGradient
          colors={[colors.primary, `${colors.primary}59`, colors.line]}
          locations={[0, 0.12, 0.3]}
          style={styles.rail}
          pointerEvents="none"
        />
        {groups.map((group) => (
          <Fragment key={group.key}>
            <MonthLabel label={group.label} />
            {group.releases.map((release) => (
              <TimelineEntry
                key={release.version}
                release={release}
                top={release === SHIPPED[0]}
                current={compareVersions(release.version, APP_VERSION) === 0}
                onPress={() => open(release.version)}
              />
            ))}
          </Fragment>
        ))}
      </View>
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headTitle: {
    flex: 1,
  },
  youWrap: {
    alignItems: "flex-start",
    gap: 3,
    paddingHorizontal: 2,
  },
  timeline: {
    gap: 20,
    marginTop: spacing.xs,
    paddingLeft: RAIL_GUTTER,
  },
  rail: {
    position: "absolute",
    left: RAIL_CENTRE - 1,
    top: 30,
    bottom: 30,
    width: 2,
    borderRadius: 1,
  },
});

export default WhatsNewScreen;
