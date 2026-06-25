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
  return (
    <Text
      style={[
        {
          fontSize: theme.fontSize[size],
          fontFamily: theme.fontFamily[weight],
          color: theme.colors[color],
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  )
}