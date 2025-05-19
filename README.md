# @jamsch/react-native-hanzi-writer

[![npm version](https://badge.fury.io/js/@jamsch%2Freact-native-hanzi-writer.svg)](https://www.npmjs.com/package/@jamsch/react-native-hanzi-writer) ![bundle size](https://img.shields.io/bundlephobia/min/@jamsch/react-native-hanzi-writer)

Hanzi/Kanji writer and stroke order quizzer library for React Native, based on the vanilla JS [hanzi-writer](https://github.com/chanind/hanzi-writer) library.

![preview](https://i.imgur.com/5EkOdbR.gif)

## Installation

```sh
# Peer dependencies required for this library to function
npx expo install react-native-gesture-handler
npx expo install react-native-reanimated
npx expo install react-native-svg

# Install this library
npm install @jamsch/react-native-hanzi-writer
```

## Basic Usage

> [!IMPORTANT]
> Make sure your entire application is wrapped in a `<GestureHandlerRootView>` element for gestures to work in quiz mode. Also make sure that the order of the elements inside `<HanziWriter.Svg>` match the above example as it affects the display layering. That being said, you still can conditionally render these components.

```tsx
import { Button, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HanziWriter, useHanziWriter } from '@jamsch/react-native-hanzi-writer';

function App() {
  const writer = useHanziWriter({
    character: '验',
    // (Optional) This is where you would load the character data from a CDN
    loader(char) {
      return fetch(
        `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${char}.json`
      ).then((res) => res.json());
    },
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HanziWriter
        writer={writer}
        // Optional, render out your loading UI
        loading={<Text>Loading...</Text>}
        // Optional, render out an error UI in case the fetch call fails
        error={
          <View>
            <Text>Error loading character. </Text>
            <Button title="Refetch" onPress={writer.refetch} />
          </View>
        }
        style={{ alignSelf: 'center' }}
      >
        {/** Optional, grid lines to help draw the character */}
        <HanziWriter.GridLines color="#ddd" />
        <HanziWriter.Svg>
          {/** The outline is laid under the character */}
          <HanziWriter.Outline color="#ccc" />
          {/** The character is displayed on top. Animations run here. Quizzing will hide it */}
          <HanziWriter.Character color="#555" radicalColor="green" />
          {/** Quiz strokes display after every correct stroke in quiz mode */}
          <HanziWriter.QuizStrokes />
          {/** The mistake highligher will animate and fade out a stroke in quiz mode */}
          <HanziWriter.QuizMistakeHighlighter
            color="#539bf5"
            strokeDuration={400}
          />
        </HanziWriter.Svg>
      </HanziWriter>
    </GestureHandlerRootView>
  );
}
```

## Starting the quiz

You can start the quiz by calling `writer.quiz.start()`.

- To listen for state changes (such as the current stroke index, or whether the quiz is active), use `writer.quiz.useStore(selector)`
- To listen for specific quiz events (such as completed, correct stroke, mistakes), attach them as arguments to `writer.quiz.start()`.
- To change the user stroke style you can optionally pass `userStrokeStyle={{ strokeColor: 'blue', strokeWidth: 10, strokeLinecap: 'round', strokeLinejoin: 'round' }}` to `<HanziWriter>`

```tsx
import { HanziWriter, useHanziWriter } from '@jamsch/react-native-hanzi-writer';

function App() {
  const writer = useHanziWriter({ character: '验' });

  const quizActive = writer.quiz.useStore((s) => s.active);

  const startQuiz = () => {
    writer.quiz.start({
      /** Optional. Default: 1. This can be set to make stroke grading more or less lenient. Closer to 0 the more strictly strokes are graded. */
      leniency: 1,
      /** Optional. Default: 0. */
      quizStartStrokeNum: 0,
      /** Highlights correct stroke (uses <QuizMistakeHighlighter />) after incorrect attempts. Set to `false` to disable. */
      showHintAfterMisses: 2,
      onComplete({ totalMistakes }) {
        console.log(
          `Quiz complete! You made a total of ${totalMistakes} mistakes`
        );
      },
      onCorrectStroke() {
        console.log('onCorrectStroke');
      },
      onMistake(strokeData) {
        console.log('onMistake', strokeData);
      },
    });
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HanziWriter writer={writer}>
        {/** Include all the HanziWriter.XXX components here */}
      </HanziWriter>
      <Button
        onPress={quizActive ? writer.quiz.stop : startQuiz}
        title={quizActive ? 'Stop Quiz' : 'Start Quiz'}
      />
    </GestureHandlerRootView>
  );
}
```

## Animating strokes

Running stroke order animations is simple.

- Call `writer.animator.animateCharacter()` with optional arguments to control stroke duration, delays between strokes.
- Call `writer.animator.cancelAnimation()` to cancel the running animation.
- Use `writer.animator.useStore(selector)` to listen for changes to the animation state.

```tsx
import { HanziWriter, useHanziWriter } from '@jamsch/react-native-hanzi-writer';

function App() {
  const writer = useHanziWriter({ character: '验' });

  const animatorState = writer.animator.useStore((s) => s.state);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HanziWriter writer={writer}>
        {/** Include all the HanziWriter.XXX components here */}
      </HanziWriter>
      <Button
        onPress={() => {
          if (animatorState === 'playing') {
            writer.animator.cancelAnimation();
          } else {
            writer.animator.animateCharacter({
              /** Optional. Default: 1000ms */
              delayBetweenStrokes: 800,
              /** Optional. Default: 400ms */
              strokeDuration: 800,
              /** Optional. */
              onComplete() {
                console.log('Animation complete!');
              },
            });
          }
        }}
        title={
          animatorState === 'playing' ? 'Stop animating' : 'Animate Strokes'
        }
      />
    </GestureHandlerRootView>
  );
}
```

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT
