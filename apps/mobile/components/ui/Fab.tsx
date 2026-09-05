import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Icon from "@/components/ui/Icon";
import { haptics } from "@/lib/haptics";
import { gradients, spacing } from "@/theme";

// Deeper than a CTA's 0.98: the FAB is a small circle, so it needs more travel
// before the squeeze is visible at all.
const PRESSED_SCALE = 0.9;
const SPRING = { damping: 14, stiffness: 300, mass: 0.4 } as const;

// Spec .fab — the one global action: glowing violet +, → Add Transaction.
// Self-positioning (bottom-right, above the safe area); drop into a scaffold's
// `floating` slot.
const Fab = ({ onPress }: { onPress: () => void }) => {
    const { bottom } = useSafeAreaInsets();

    const scale = useSharedValue(1);
    const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    return (
        // Fades in rather than appearing with the screen: the FAB is the one thing
        // floating over the content, so it should arrive a beat after it.
        <Animated.View
            entering={FadeIn.delay(120).duration(220)}
            style={[styles.wrap, { bottom: bottom + spacing.lg }]}
        >
            {/* Glow on an unclipped, opaque layer — the Pressable clips the
                gradient (overflow:hidden) so it can't also cast the halo.
                Animated here so the halo squeezes with the button, not against it. */}
            <Animated.View style={[styles.glow, pressStyle]}>
                <Pressable
                    onPress={onPress}
                    onPressIn={() => {
                        scale.value = withSpring(PRESSED_SCALE, SPRING);
                        haptics.press();
                    }}
                    onPressOut={() => {
                        scale.value = withSpring(1, SPRING);
                    }}
                    style={styles.fab}
                    accessibilityLabel="Add transaction"
                >
                    <LinearGradient
                        colors={[...gradients.brand]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0.8, y: 1 }}
                        style={[StyleSheet.absoluteFill, styles.round]}
                        pointerEvents="none"
                    />
                    <Icon name="add" size={26} color="surface" />
                </Pressable>
            </Animated.View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        position: "absolute",
        right: 20,
    },
    glow: {
        borderRadius: 29,
        backgroundColor: "#6D5CF6",
        shadowColor: "#6D5CFF",
        shadowOpacity: 0.55,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10,
    },
    fab: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    round: {
        borderRadius: 29,
    },
});

export default Fab;
