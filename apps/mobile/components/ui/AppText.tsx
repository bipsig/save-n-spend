import { ColorToken, FontSizeToken, FontWeightToken, theme } from '@/theme'
import { Text } from 'react-native'
import type { TextProps } from 'react-native'

type Props = TextProps & {
  weight?: FontWeightToken
  size?: FontSizeToken
  color?: ColorToken
}

export const AppText = ({
  weight = "regular",
  size = "md",
  color = "ink",
  style,
  children,
  ...rest
}: Props) => {
  const fontSize = theme.fontSize[size]

  return (
    <Text
      style={[
        {
          fontSize,
          fontWeight: theme.fontWeight[weight],
          color: theme.colors[color],
          // Spec: 800-weight display text is tracked tight (−.02em).
          ...(weight === 'black' ? { letterSpacing: -0.02 * fontSize } : null),
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  )
}
