import { ColorToken, FontSizeToken, FontWeightToken, theme } from '@/theme'
import { Text } from 'react-native'
import type { TextProps } from 'react-native'
import { spoken } from '@/lib/maskAmounts'

type Props = TextProps & {
  weight?: FontWeightToken
  size?: FontSizeToken
  color?: ColorToken
}

// Plain text children, joined, when that's all there is.
const plainText = (children: React.ReactNode): string | null => {
  const parts = Array.isArray(children) ? children : [children]
  return parts.every((p) => typeof p === 'string' || typeof p === 'number') ? parts.join('') : null
}

export const AppText = ({
  weight = "regular",
  size = "md",
  color = "ink",
  style,
  children,
  accessibilityLabel,
  ...rest
}: Props) => {
  const fontSize = theme.fontSize[size]
  // A masked figure is read "amount hidden", not as bullets (gaps row 181).
  const text = accessibilityLabel ?? plainText(children)
  const label = text !== null && text.includes('••••') ? spoken(text) : accessibilityLabel

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
      accessibilityLabel={label}
      {...rest}
    >
      {children}
    </Text>
  )
}
