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

const fontFamilies = {
  regular: "Lato_400Regular",
  bold: "Lato_700Bold",
  black: "Lato_900Black"
}

export const AppText = ({ weight = "regular", size = "md", color = "#101828", style, children, ...rest }: Props) => {
  return (
    <Text
      style={[
        {
          fontSize: sizes[size],
          fontFamily: fontFamilies[weight],
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