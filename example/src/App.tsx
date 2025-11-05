import { useState } from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  View,
  TextInput,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  GestureHandlerRootView,
  ScrollView,
} from 'react-native-gesture-handler';
import {
  useHanziWriter,
  HanziWriter,
  defaultCharDataLoader,
} from '@jamsch/react-native-hanzi-writer';

export default function App() {
  const [character, setCharacter] = useState('验');
  const [showGridLines, setShowGridLines] = useState(true);
  const [showOutline, setShowOutline] = useState(true);
  const [showCharacter, setShowCharacter] = useState(true);
  const [enableBackwardsStrokes, setEnableBackwardsStrokes] = useState(false);

  const writer = useHanziWriter({
    character,
    // (Optional) This is where you would load the character data from your backend
    loader: (char) => {
      return defaultCharDataLoader(char);
    },
  });
  const quizActive = writer.quiz.useStore((s) => s.active);
  const animatorState = writer.animator.useStore((s) => s.state);

  const startQuiz = () => {
    writer.quiz.start({
      /** Optional. Default: 1. This can be set to make stroke grading more or less lenient. Closer to 0 the more strictly strokes are graded. */
      leniency: 1,
      /** Optional. Default: 0. */
      quizStartStrokeNum: 0,
      /** Highlights the correct stroke (using <HanziWriter.QuizMistakeHighlighter />) after the provided number of incorrect attempts. Setting to `false` disables this. */
      showHintAfterMisses: 2,
      acceptBackwardsStrokes: enableBackwardsStrokes,
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
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.container}>
        <ScrollView style={styles.container}>
          <View style={[styles.optionsContainer, styles.mt20]}>
            <View style={[styles.row, styles.wrap, styles.justifyCenter]}>
              <CheckboxButton
                title="Gridlines"
                onPress={() => setShowGridLines((show) => !show)}
                checked={showGridLines}
              />

              <CheckboxButton
                title="Character"
                onPress={() => setShowCharacter((show) => !show)}
                checked={showCharacter}
              />

              <CheckboxButton
                title="Outline"
                onPress={() => setShowOutline((show) => !show)}
                checked={showOutline}
              />
            </View>
          </View>
          <HanziWriter
            writer={writer}
            loading={<Text>Loading...</Text>}
            error={<Text>Error loading character</Text>}
            style={styles.writerContainer}
          >
            {showGridLines && <HanziWriter.GridLines color="#ddd" />}
            <HanziWriter.Svg>
              {showOutline && <HanziWriter.Outline color="#ccc" />}
              {showCharacter && (
                <HanziWriter.Character color="#555" radicalColor="green" />
              )}
              <HanziWriter.QuizStrokes radicalColor="green" />
              <HanziWriter.QuizMistakeHighlighter color="#539bf5" />
            </HanziWriter.Svg>
          </HanziWriter>

          <View style={styles.optionsContainer}>
            <View style={styles.row}>
              <View>
                <Text style={styles.heading}>QUIZ</Text>
                <View style={styles.itemsStart}>
                  <CheckboxButton
                    title="Backwards strokes"
                    disabled={quizActive}
                    onPress={() => setEnableBackwardsStrokes((state) => !state)}
                    checked={enableBackwardsStrokes}
                  />
                  <Button
                    disabled={animatorState === 'playing'}
                    onPress={quizActive ? writer.quiz.stop : startQuiz}
                    title={quizActive ? 'Stop Quiz' : 'Start Quiz'}
                  />
                </View>
              </View>
              <View style={styles.mlAuto}>
                <Text style={[styles.heading, styles.textRight]}>ANIMATE</Text>
                <View style={styles.row}>
                  <Button
                    disabled={quizActive}
                    onPress={() => {
                      if (animatorState === 'playing') {
                        writer.animator.cancelAnimation();
                      } else {
                        writer.animator.animateCharacter({
                          delayBetweenStrokes: 800,
                          strokeDuration: 500,
                          onComplete() {
                            console.log('Animation complete!');
                          },
                        });
                      }
                    }}
                    title={
                      animatorState === 'playing'
                        ? 'Stop animating'
                        : 'Animate Strokes'
                    }
                  />
                </View>
              </View>
            </View>
            <Text style={styles.heading}>LOAD CHARACTER</Text>
            <TextInput
              value={character}
              onChangeText={setCharacter}
              style={[styles.bgGrey, styles.p4, styles.m4, styles.rounded]}
            />
          </View>
        </ScrollView>
      </View>
    </GestureHandlerRootView>
  );
}

function CheckboxButton(props: {
  title: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.button,
        styles.checkboxButton,
        props.checked && styles.bgBlue,
        props.disabled && styles.opacity50,
      ]}
    >
      <View>
        {props.checked && <Text style={styles.checkbox}>✓</Text>}
        {!props.checked && (
          <Text style={[styles.checkbox, styles.unchecked]}>✘</Text>
        )}
        <Text style={[styles.fontBold, props.checked && styles.textWhite]}>
          {props.title}
        </Text>
      </View>
    </Pressable>
  );
}

function Button(props: {
  onPress: () => void;
  title: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.button, props.style, props.disabled && styles.opacity50]}
      disabled={props.disabled}
    >
      <Text style={styles.fontBold}>{props.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: 'row' },
  mlAuto: { marginLeft: 'auto' },
  fontBold: { fontWeight: 'bold' },
  itemsStart: { alignItems: 'flex-start' },
  p4: { padding: 4 },
  m4: { margin: 4 },
  mt20: { marginTop: 20 },
  bgBlue: { backgroundColor: '#539bf5' },
  bgGrey: { backgroundColor: '#eee' },
  textWhite: { color: '#fff' },
  textRight: { textAlign: 'right' },
  heading: {
    fontSize: 12,
    color: '#888',
    fontWeight: 'bold',
    margin: 2,
    marginTop: 8,
  },
  rounded: { borderRadius: 8 },
  wrap: { flexWrap: 'wrap' },
  justifyCenter: { justifyContent: 'center' },
  optionsContainer: { padding: 8 },
  button: {
    position: 'relative',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#eee',
    margin: 2,
  },
  checkboxButton: {
    paddingLeft: 24,
  },
  checkbox: {
    position: 'absolute',
    top: 0,
    left: -16,
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  unchecked: {
    color: 'black',
  },
  writerContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    backgroundColor: '#eee',
  },
  opacity50: { opacity: 0.5 },
});
