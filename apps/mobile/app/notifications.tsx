import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Animated, { LinearTransition } from "react-native-reanimated";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import NotificationRow from "@/components/rows/NotificationRow";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/states/EmptyState";
import ScreenStates from "@/components/states/ScreenStates";
import SkeletonState from "@/components/states/SkeletonState";
import { haptics } from "@/lib/haptics";
import { routeFor } from "@/lib/notifications";
import { useOnlineGate } from "@/lib/onlineGate";
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
  const fetchedAt = useNotifications((s) => s.fetchedAt);
  const load = useNotifications((s) => s.load);

  // The feed lives in a store, not a query, so no write or focus rule refreshes it: this
  // does. A reminder can arrive while the app sits in the background.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const markGate = useOnlineGate("Mark all read");
  const state = { loading, error, refetch: load, fetchedAt, hasData: items.length > 0 || (!loading && !error) };

  const open = (id: string) => {
    const notification = items.find((item) => item._id === id);
    // Offline the dot would go out and come back; the row still opens what it points at.
    if (markGate.allowed) void useNotifications.getState().markRead(id);

    // Only navigate where the notification actually points. A weekly summary that
    // dumped the user on a random screen would be worse than one that stays put.
    const route = routeFor(notification?.link);
    if (route) router.push(route);
  };

  // The same header in every state; "Mark all read" only while something is unread (Q2: an
  // icon circle, spoken by name).
  const header = {
    title: "Notifications",
    back: true,
    actions: unread > 0
      ? [{
        kind: "markAllRead" as const,
        label: markGate.allowed ? "Mark all read" : "Mark all read, needs a connection",
        disabled: !markGate.allowed,
        onPress: () => {
          haptics.success();
          void useNotifications.getState().markAllRead();
        },
      }]
      : [],
  };

  const skeleton = (
    <View style={styles.skeletonCol}>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonState key={i} height={64} borderRadius={radius.lg} />
      ))}
    </View>
  );

  return (
    <ScreenScaffold {...header} states={state}>
      <ScreenStates state={state} skeleton={skeleton}>
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
      </ScreenStates>

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
  group: {
    paddingVertical: 2,
  },
  skeletonCol: {
    gap: spacing.lg,
  },
});

export default NotificationsScreen;
