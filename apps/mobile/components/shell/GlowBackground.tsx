import { StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";

// Ambient glow — matches the approved mockup's blob geometry:
// a violet bloom at the top-left and an emerald bloom on the right edge at
// ~1/3 screen height (BEHIND the summary grid, so the glass tiles have light
// to show through). Glass over flat darkness reads as an opaque tile.
const GlowBackground = () => (
  <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
    <Defs>
      <RadialGradient id="glowViolet" cx="20%" cy="10%" r="60%">
        <Stop offset="0%" stopColor="#6A4CFF" stopOpacity={0.55} />
        <Stop offset="55%" stopColor="#6A4CFF" stopOpacity={0.18} />
        <Stop offset="100%" stopColor="#6A4CFF" stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id="glowEmerald" cx="88%" cy="34%" r="52%">
        <Stop offset="0%" stopColor="#12B981" stopOpacity={0.42} />
        <Stop offset="55%" stopColor="#12B981" stopOpacity={0.14} />
        <Stop offset="100%" stopColor="#12B981" stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id="glowFloor" cx="45%" cy="105%" r="55%">
        <Stop offset="0%" stopColor="#6A4CFF" stopOpacity={0.22} />
        <Stop offset="100%" stopColor="#6A4CFF" stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#glowViolet)" />
    <Rect width="100%" height="100%" fill="url(#glowEmerald)" />
    <Rect width="100%" height="100%" fill="url(#glowFloor)" />
  </Svg>
);

export default GlowBackground;
