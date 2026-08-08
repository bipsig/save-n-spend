import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@/components/ui/Icon";
import { gradients, spacing } from "@/theme";

// Spec .fab — the one global action: glowing violet +, → Add Transaction.
// Self-positioning (bottom-right, above the safe area); drop into a scaffold's
// `floating` slot.
const Fab = ({ onPress }: { onPress: () => void }) => {
    const { bottom } = useSafeAreaInsets();
    return (
        <View style={[styles.wrap, { bottom: bottom + spacing.lg }]}>
            <Pressable onPress={onPress} style={styles.fab} accessibilityLabel="Add transaction">
                <LinearGradient
                    colors={[...gradients.brand]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={[StyleSheet.absoluteFill, styles.round]}
                    pointerEvents="none"
                />
                <Icon name="add" size={26} color="surface" />
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        position: "absolute",
        right: 20,
    },
    fab: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        shadowColor: "#6D5CFF",
        shadowOpacity: 0.55,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10,
    },
    round: {
        borderRadius: 29,
    },
});

export default Fab;
