import { colors, radius } from "@/theme";
import { useEffect, useRef } from "react";
import { Animated, DimensionValue, StyleSheet } from "react-native";

type Props = {
  width?: DimensionValue
  height?: number
  borderRadius?: number
}

const SkeletonState = ({
  width = "100%",
  height = 16,
  borderRadius = radius.sm
}: Props) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true })
    ]));
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius, opacity }
      ]}
    />
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.line
  }
})

export default SkeletonState;
