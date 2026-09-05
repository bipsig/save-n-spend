import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Animated, { LinearTransition } from "react-native-reanimated";
import BackButton from "@/components/shell/BackButton";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import NotificationRow from "@/components/rows/NotificationRow";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import { haptics } from "@/lib/haptics";
import { routeFor } from "@/lib/notifications";
import { useAppZone } from "@/lib/zone";
import { useNotifications } from "@/store/notifications";
import { radius, spacing } from "@/theme";

// The bell's destination, and the honest record of everything the app has told this
// account. Push can be refused, missed, or swiped away; this list can't be.

const NotificationsScreen = () => {
  useAppZone(); // subscribe: the zone decides which day each row's timestamp names

  const items = useNotifications((s) => s.items);
  const unread = useNotifications((s) => s.unread);
  const loading = useNotifications((s) => s.loading);
  const loadingMore = useNotifications((s) => s.loadingMore);
  const hasNextPage = useNotifications((s) => s.hasNextPage);
  const error = useNotifications((s) => s.error);
  const load = useNotifications((s) => s.load);

  // Refetched on focus like every other data screen: a reminder can arrive while the
  // app sits in the background, and the feed is the thing that has to know.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const open = (id: string) => {
    const notification = items.find((item) => item._id === id);
    void useNotifications.getState().markRead(id);

    // Only navigate where the notification actually points. A weekly summary that
    // dumped the user on a random screen would be worse than one that stays put.
    const route = routeFor(notification?.link);
    if (route) router.push(route);
  };

  const headerRight = unread > 0
    ? (
      <Button
        label="Mark all read"
        pill
        size="sm"
        onPress={() => {
          haptics.success();
          void useNotifications.getState().markAllRead();
        }}
      />
    )
    : undefined;

  const header = (
    <View style={styles.head}>
      <BackButton />
      <AppText size="xl" weight="black" style={styles.headTitle}>
        Notifications
      </AppText>
      {headerRight}
    </View>
  );

  if (error && items.length === 0) {
    return (
      <ScreenScaffold header={header}>
        <ErrorState message={error} onRetry={load} />
      </ScreenScaffold>
    );
  }

  if (loading && items.length === 0) {
    return (
      <ScreenScaffold header={header}>
        <View style={styles.skeletonCol}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonState key={i} height={64} borderRadius={radius.lg} />
          ))}
        </View>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold header={header}>
      {items.length === 0 ? (
        <EmptyState
          icon="bell"
          title="Nothing to catch up on"
          subtitle="Bill reminders, budget alerts and goal milestones land here as they happen."
        />
      ) : (
        // `layout` so rows settle instead of jumping when a page is appended.
        <Animated.View layout={LinearTransition.duration(220)}>
          <Card padded={false} style={styles.group}>
            {items.map((notification, i) => (
              <NotificationRow
                key={notification._id}
                first={i === 0}
                notification={notification}
                onPress={() => open(notification._id)}
              />
            ))}
          </Card>
        </Animated.View>
      )}

      {/* A button rather than infinite scroll: the list is a log people read the top of,
          and loading older pages should be something they ask for. */}
      {hasNextPage && (
        <Button
          label="Load older"
          variant="secondary"
          size="sm"
          loading={loadingMore}
          onPress={() => void useNotifications.getState().loadMore()}
        />
      )}
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
  group: {
    paddingVertical: 2,
  },
  skeletonCol: {
    gap: spacing.lg,
  },
});

export default NotificationsScreen;
