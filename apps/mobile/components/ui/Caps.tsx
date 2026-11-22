import type { TextProps } from "react-native";
import { AppText } from "./AppText";
import { caps } from "@/theme";
import type { CapsSize, ColorToken } from "@/theme";

type Props = TextProps & {
  children: React.ReactNode;
  /** `sm` for tight slots, such as three stat tiles across. */
  size?: CapsSize;
  /** `onGradientDim` on a gradient card. */
  color?: ColorToken;
  /** Read by VoiceOver as a heading, for a caption that opens a section. */
  header?: boolean;
  /** `black` for a caption on a filled badge. */
  weight?: "bold" | "black";
};

// The one small uppercase caption. Write the text in sentence case: the capitals come from the
// style, and iOS hands the transformed text to VoiceOver, so the label carries the original
// words and short ones aren't spelled out letter by letter.
const Caps = ({ children, size = "md", color = "inkDim", header = false, weight = "bold", style, ...rest }: Props) => (
  <AppText
    size="xs"
    weight={weight}
    color={color}
    accessibilityRole={header ? "header" : undefined}
    accessibilityLabel={typeof children === "string" || typeof children === "number" ? String(children) : undefined}
    style={[{ fontSize: caps[size].fontSize, letterSpacing: caps[size].letterSpacing, textTransform: "uppercase" }, style]}
    {...rest}
  >
    {children}
  </AppText>
);

export default Caps;
