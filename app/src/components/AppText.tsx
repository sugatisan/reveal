// Text and TextInput with the app's chosen fonts (studio: Type › Fonts). Text marked with `serif`
// gets the pairing's display face, unmarked text its text face, and anything else keeps its own font.
// Each weight is its own font file, so the matching file is picked and fontWeight reset.
import { forwardRef } from "react";
import { StyleSheet, Text as RNText, TextInput as RNTextInput, TextInputProps, TextProps } from "react-native";
import { FontSet, pick, useFontSet } from "@/design/fonts";
import { serif } from "@/lib/theme";

function fontFor(set: FontSet, style: any) {
  if (!set.display && !set.text) return null;
  const flat = StyleSheet.flatten(style) || {};
  const fam = flat.fontFamily;
  const family = pick(fam === serif ? set.display : !fam ? set.text : undefined, flat.fontWeight);
  return family ? { fontFamily: family, fontWeight: "normal" as const } : null;
}

export const Text = forwardRef<RNText, TextProps>(function Text(props, ref) {
  const set = useFontSet();
  return <RNText ref={ref} {...props} style={[props.style, fontFor(set, props.style)]} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  const set = useFontSet();
  return <RNTextInput ref={ref} {...props} style={[props.style, fontFor(set, props.style)]} />;
});
// So `useRef<TextInput>` keeps working where the instance type is needed.
export type Text = RNText;
export type TextInput = RNTextInput;
