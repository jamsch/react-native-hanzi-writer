# @jamsch/react-native-hanzi-writer

## 2.0.1

### Patch Changes

- 9c974a6: Fix a recursion error when completing a stroke on Reanimated v4.5+

## 2.0.0

### Major Changes

- cdbb371: - Added Expo 57 support
- Breaking: `<HanziWriter.GridLines>` must now be placed inside `<HanziWriter.Svg>` instead of above it
- Added a `size` and `padding` attribute to `useHanziWriter()`
