import { Text } from 'react-native'
import type { TextProps } from 'react-native'

type Props = TextProps & {
  weight?: "regular" | "bold" | "black"
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl"
  color?: string
}

const sizes = {
  xs: 11,
  sm: 13,
  md: 16,
  lg: 19,
  xl: 24,
  "2xl": 32,
}

const weights = {
  regular: "400" as const,
  bold: "700" as const,
  black: "900" as const,
}

export const AppText = ({ weight = "regular", size = "md", color = "#101828", style, children, ...rest }: Props) => {
  return (
    <Text
      style={[
        {
          fontSize: sizes[size],
          fontWeight: weights[weight],
          color,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  )
}