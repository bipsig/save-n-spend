import { colors, fontSize, radius, spacing } from "@/theme";
import { useState } from "react";
import { StyleSheet, TextInput, TextInputProps, View } from "react-native";
import Icon from "./Icon";

const Search = ({
  style,
  ...rest
}: TextInputProps) => {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: focused ? colors.primary : "transparent"
        }
      ]}
    >
      <Icon name="search" size={20} color="gray500" />
      
      <TextInput
        placeholder="Search"
        placeholderTextColor={colors.gray400}
        {...rest}
        style={[styles.input, style]}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e) }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.full,   
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: '100%',
  },
  input: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.ink,
    padding: 0,
  },
})

export default Search;