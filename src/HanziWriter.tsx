import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import {
  strokeMatches,
  Character,
  parseCharData,
  Positioner,
  UserStroke,
} from './hanzi-writer';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector';
import type { Point, QuizOptions, CharacterJson } from './types';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import RNSvg, {
  Defs,
  ClipPath,
  Path,
  G,
  PathProps,
  SvgProps,
} from 'react-native-svg';
import LoadingIndicator from './components/LoadingIndicator';
import simplify from './simplify';
import { getPathString as getPathStringWorklet } from './geometry-worklet';
import StrokeAnimator from './components/StrokeAnimator';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedGestureHandler,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { usePromise } from './hooks/usePromise';
import AnimatedPath from './components/AnimatedPath';
import {
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import { generateId } from './utils';

export const HanziWriterContext = createContext<ReturnType<
  typeof useHanziWriter
> | null>(null);

interface HanziWriterProps {
  writer: ReturnType<typeof useHanziWriter>;
  children: ReactNode;
  /** What to display while the character is loading */
  loading?: JSX.Element;
  /** What to display if there's an error */
  error?: JSX.Element;
  /** Container style */
  style?: StyleProp<ViewStyle>;
}

export function HanziWriter(props: HanziWriterProps) {
  return (
    <View style={[styles.hanziWriterRoot, props.style]}>
      <HanziWriterContext.Provider value={props.writer}>
        <CharacterLoader loading={props.loading} error={props.error}>
          {props.children}
          <UserStrokeGesture />
        </CharacterLoader>
      </HanziWriterContext.Provider>
    </View>
  );
}

HanziWriter.Svg = HanziWriterSvg;
HanziWriter.GridLines = HanziWriterGridLines;
HanziWriter.Outline = HanziWriterOutline;
HanziWriter.Character = HanziWriterCharacter;
HanziWriter.QuizMistakeHighlighter = QuizMistakeHighlighter;
HanziWriter.QuizStrokes = HanziWriterQuizStrokes;

export async function defaultCharDataLoader(
  char: string
): Promise<CharacterJson> {
  return fetch(
    `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${char}.json`
  ).then((res) => res.json());
}

export function QuizMistakeHighlighter({
  color = '#555',
  strokeDuration = 400,
}) {
  const writer = useContext(HanziWriterContext)!;
  const quiz = writer.quiz.useStore((s) => s);
  const animationPath = writer.characterClass?.strokes[quiz.index];

  const animationKey = useMemo((): string | null => {
    if (
      typeof quiz.params?.showHintAfterMisses === 'boolean' &&
      !quiz.params?.showHintAfterMisses
    ) {
      return null;
    }
    const showHintAfterMisses = quiz.params?.showHintAfterMisses || 3;

    const shouldAnimateStroke =
      (quiz.mistakes[quiz.index] || 0) >= showHintAfterMisses;

    if (shouldAnimateStroke) {
      return generateId();
    }
    return null;
  }, [quiz.mistakes, quiz.index, quiz.params]);

  if (!quiz.active || !animationPath || !animationKey) {
    return null;
  }

  return (
    <G transform={TRANSFORM}>
      <StrokeAnimator
        strokeColor={color}
        strokeWidth={100}
        key={`mistake.${animationPath.strokeNum}.${animationKey}`}
        stroke={animationPath}
        resetOnComplete={true}
        duration={strokeDuration}
      />
    </G>
  );
}

/** Animates all strokes */
export function CharacterAnimator({
  color = '#555',
  radicalColor,
}: {
  color?: string;
  radicalColor?: string;
}) {
  const writer = useContext(HanziWriterContext)!;
  const animationState = writer.animator.useStore((s) => s);

  if (animationState.state !== 'playing' || !writer.characterClass) {
    return null;
  }

  return (
    <>
      {writer.characterClass.strokes.map((stroke, idx) => {
        const isLast = idx === writer.characterClass!.strokes.length - 1;
        const colorToUse = stroke.isInRadical ? radicalColor : color;
        return (
          <StrokeAnimator
            strokeColor={colorToUse || color}
            strokeWidth={100}
            key={`char.${stroke.strokeNum}`}
            stroke={stroke}
            duration={animationState.strokeDuration}
            delay={
              idx * animationState.delayBetweenStrokes +
              animationState.strokeDuration * idx
            }
            onComplete={
              isLast ? writer.animator.onAnimationComplete : undefined
            }
          />
        );
      })}
    </>
  );
}

interface CharacterLoaderProps {
  /** What to display while the character is loading */
  loading?: JSX.Element;
  /** What to display if there's an error */
  error?: JSX.Element;
  /** Resolved character data */
  children: ReactNode;
}

export function CharacterLoader({
  loading,
  error,
  children,
}: CharacterLoaderProps) {
  const writer = useContext(HanziWriterContext)!;

  switch (writer.characterState.status) {
    case 'idle':
      return null;
    case 'rejected':
      return error || <Text>Error loading character</Text>;
    case 'pending':
      return loading || <LoadingIndicator />;
    default:
      return <>{children}</>;
  }
}

const TRANSFORM = 'translate(20, 248.515625) scale(0.25390625, -0.25390625)';

export type HanziWriterAnimationState =
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'cancelled';

const positioner = new Positioner({ height: 300, width: 300, padding: 0 });

/** This component handles everything to do with the user's gestures on the writer element */
export function UserStrokeGesture() {
  const writer = useContext(HanziWriterContext)!;
  const points = useSharedValue<Point[]>([]);
  const active = writer.quiz.useStore((state) => state.active);
  const fade = useSharedValue(1);

  const check = () => {
    const simplifiedPoints = simplify(points.value, 1);
    writer.quiz.check(simplifiedPoints);
    // Fade out the user's stroke
    fade.value = withTiming(0, { duration: 200 }, () => {
      // reset the values
      points.value = [];
      fade.value = 1;
    });
  };

  const onGestureEvent =
    useAnimatedGestureHandler<PanGestureHandlerGestureEvent>({
      onStart(event) {
        points.value = [{ x: event.x, y: event.y }];
      },
      onActive(event) {
        points.value = [...points.value, { x: event.x, y: event.y }];
      },
      onEnd() {
        if (points.value.length > 0) {
          runOnJS(check)();
        }
      },
    });

  const animatedPathProps = useAnimatedProps(() => ({
    d: getPathStringWorklet(points.value),
    opacity: fade.value,
  }));

  return (
    <PanGestureHandler enabled={active} onGestureEvent={onGestureEvent}>
      <Animated.View style={StyleSheet.absoluteFill}>
        <RNSvg width="300" height="300">
          <G>
            <AnimatedPath
              animatedProps={animatedPathProps}
              stroke="black"
              strokeWidth="2"
            />
          </G>
        </RNSvg>
      </Animated.View>
    </PanGestureHandler>
  );
}

interface HanziWriterSvgProps extends SvgProps {
  children?: ReactNode;
}

function HanziWriterSvg({ children, ...rest }: HanziWriterSvgProps) {
  const writer = useContext(HanziWriterContext)!;

  return (
    <RNSvg width="300" height="300" {...rest}>
      <Defs>
        {writer.characterClass?.strokes.map((stroke) => (
          <ClipPath
            key={`clip.${stroke.strokeNum}`}
            id={`clip.${stroke.strokeNum}`}
          >
            <Path d={stroke.path} />
          </ClipPath>
        ))}
      </Defs>

      {children || null}
    </RNSvg>
  );
}

function HanziWriterQuizStrokes(props: {
  color?: string;
  radicalColor?: string;
}) {
  const { color = '#555' } = props;
  const writer = useContext(HanziWriterContext)!;
  const quizIndex = writer.quiz.useStore((state) => state.index);

  const correctPaths =
    writer.characterClass?.strokes.filter((_, i) => quizIndex > i) || [];

  return (
    <G transform={TRANSFORM}>
      {correctPaths.map((stroke) => {
        const colorToUse = stroke.isInRadical ? props.radicalColor : color;
        return (
          <PathFadeIn
            key={`c.${stroke.strokeNum}`}
            d={stroke.path}
            fill={colorToUse || color}
          />
        );
      })}
    </G>
  );
}

function HanziWriterCharacter(props: {
  color?: string;
  radicalColor?: string;
}) {
  const writer = useContext(HanziWriterContext)!;
  const { characterClass } = writer;
  const quizActive = writer.quiz.useStore((state) => state.active);
  const isAnimating = writer.animator.useStore(
    (state) => state.state === 'playing'
  );
  const color = props.color || '#555';
  const showCharStrokes = !quizActive && !isAnimating;

  return (
    <>
      {showCharStrokes && (
        <G transform={TRANSFORM}>
          {characterClass?.strokes.map((stroke) => {
            const fillColor = stroke.isInRadical ? props.radicalColor : color;
            return (
              <Path
                key={`sc.${stroke.strokeNum}`}
                d={stroke.path}
                fill={fillColor || color}
              />
            );
          })}
        </G>
      )}
      <G transform={TRANSFORM}>
        <CharacterAnimator color={color} radicalColor={props.radicalColor} />
      </G>
    </>
  );
}

function HanziWriterOutline(props: { color?: string }) {
  const writer = useContext(HanziWriterContext);
  // const isQuizActive = writer?.quiz.useStore((s) => s.active);
  // const isAnimating = writer?.animator.useStore((s) => s.state === 'playing');

  const color = props.color || '#ededed';

  return (
    <G transform={TRANSFORM}>
      {writer?.characterClass?.strokes.map((stroke) => {
        return (
          <Path key={`o.${stroke.strokeNum}`} d={stroke.path} fill={color} />
        );
      })}
    </G>
  );
}

function PathFadeIn(props: PathProps) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300, easing: Easing.linear });
  }, [opacity]);

  const animatedProps = useAnimatedProps(() => {
    return {
      fillOpacity: opacity.value,
    };
  });

  return <AnimatedPath animatedProps={animatedProps} {...props} />;
}

export function HanziWriterGridLines(props: {
  color?: string;
  width?: number;
}) {
  const { color = '#eee', width = 3 } = props;
  return (
    <>
      <View
        style={[
          styles.gridlineHorizontal,
          { borderColor: color, borderBottomWidth: width },
        ]}
      />
      <View
        style={[
          styles.gridlineVertical,
          { borderColor: color, borderLeftWidth: width },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hanziWriterRoot: {
    height: 300,
    width: 300,
    maxHeight: 300,
  },
  gridlineHorizontal: {
    ...StyleSheet.absoluteFillObject,
    bottom: '50%',
    top: '50%',
  },
  gridlineVertical: {
    ...StyleSheet.absoluteFillObject,
    bottom: 0,
    left: '50%',
    top: 0,
    width: 1,
  },
});

function createStoreApi<T>(initialState: T) {
  let state = initialState;
  const subscribers = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    getState: () => state,
    setState(newState: Partial<T>) {
      state = { ...state, ...newState };
      subscribers.forEach((listener) => listener());
    },
  };
}

type AvailableQuizOptions = Omit<QuizOptions, 'highlightOnComplete'>;

type StartQuizParams = Partial<AvailableQuizOptions>;

interface CharacterAnimatorState {
  character: string;
  state: 'playing' | 'stopped';
  animationKey: string | null;
  onComplete: (() => void) | null;
  delayBetweenStrokes: number;
  strokeDuration: number;
}

const useCharacterAnimator = (params: { character: string }) => {
  const animationKeyRef = useRef('');

  const characterAnimatorStore = useMemo(() => {
    return createStoreApi<CharacterAnimatorState>({
      character: params.character,
      state: 'stopped',
      animationKey: null,
      onComplete: null,
      delayBetweenStrokes: 1500,
      strokeDuration: 400,
    });
  }, [params.character]);

  return {
    useStore<T>(
      selector: (state: CharacterAnimatorState) => T,
      equalityFn?: any
    ): T {
      return useStore(characterAnimatorStore, selector, equalityFn);
    },
    store: characterAnimatorStore,
    animateCharacter(params?: {
      /** In milliseconds. Default: 400 */
      strokeDuration?: number;
      /** In milliseconds. Default: 1500 */
      delayBetweenStrokes?: number;
      onComplete?: () => void;
    }) {
      const { strokeDuration = 400, delayBetweenStrokes = 1500 } = params || {};
      animationKeyRef.current = generateId();
      characterAnimatorStore.setState({
        state: 'playing',
        animationKey: animationKeyRef.current,
        onComplete: params?.onComplete,
        delayBetweenStrokes,
        strokeDuration,
      });
    },
    cancelAnimation() {
      characterAnimatorStore.setState({ state: 'stopped' });
    },
    onAnimationComplete: () => {
      const { animationKey } = characterAnimatorStore.getState();
      // Avoid race conditions
      if (animationKeyRef.current === animationKey) {
        characterAnimatorStore.getState().onComplete?.();
        characterAnimatorStore.setState({ state: 'stopped' });
      }
    },
  };
};

type QuizState =
  | {
      readonly active: false;
      character: string;
      index: number;
      mistakes: Record<number, number>;
      params: null;
    }
  | {
      readonly active: true;
      character: string;
      index: number;
      mistakes: Record<number, number>;
      params: StartQuizParams;
    };

const createQuizStore = (character: string) => {
  const api = createStoreApi<QuizState>({
    character,
    active: false,
    mistakes: {},
    index: 0,
    params: null,
  });

  return {
    ...api,
    next() {
      api.setState({ index: api.getState().index + 1 });
    },
  };
};

function useStore(
  api: ReturnType<typeof createStoreApi>,
  selector: (state: any) => any,
  equalityFn: any
) {
  return useSyncExternalStoreWithSelector(
    api.subscribe,
    api.getState,
    api.getState,
    selector,
    equalityFn
  );
}

const useQuiz = (params: {
  characterClass: Character | null;
  character: string;
  cancelAnimation(): void;
}) => {
  const { cancelAnimation, character, characterClass } = params;

  const quizStore = useMemo(() => createQuizStore(character), [character]);

  const check = useCallback(
    (simplifiedPoints: Point[]) => {
      if (!characterClass) {
        return;
      }
      const { index, mistakes, params } = quizStore.getState();
      const [firstExternalPoint, ...restExternalPoints] = simplifiedPoints;
      const firstPoint = positioner.convertExternalPoint(firstExternalPoint);
      const userStroke = new UserStroke(index, firstPoint, firstExternalPoint);

      for (const externalPoint of restExternalPoints) {
        const offset = positioner.convertExternalPoint(externalPoint);
        userStroke.appendPoint(offset, externalPoint);
      }

      const { isMatch, meta } = strokeMatches(
        userStroke,
        characterClass,
        index,
        {
          leniency: params?.leniency || 1.2,
        }
      );

      const isAccepted =
        isMatch || (meta.isStrokeBackwards && params?.acceptBackwardsStrokes);

      if (!isAccepted) {
        const numMistakes = (mistakes[index] || 0) + 1;
        quizStore.setState({
          mistakes: {
            ...mistakes,
            [index]: numMistakes,
          },
        });
        quizStore.getState().params?.onMistake?.({
          character,
          drawnPath: {
            pathString: '',
            points: userStroke.points,
          },
          isBackwards: meta.isStrokeBackwards,
          mistakesOnStroke: numMistakes,
          strokeNum: index,
          strokesRemaining: characterClass.strokes.length - index,
          totalMistakes: Object.keys(mistakes).length,
        });
      } else {
        const active = index < characterClass.strokes.length - 1;

        if (!active) {
          params?.onComplete?.({
            totalMistakes: Object.keys(mistakes).length,
            character: characterClass.symbol,
          });
        }
        quizStore.setState({ index: active ? index + 1 : 0, active });
      }
    },
    [character, characterClass, quizStore]
  );

  return {
    store: quizStore,
    useStore<T>(selector: (state: QuizState) => T, equalityFn?: any): T {
      return useStore(quizStore, selector, equalityFn);
    },
    check,
    start: (params: StartQuizParams) => {
      if (!characterClass) {
        console.warn("Can't start quiz, character not loaded yet");
        return;
      }
      // Cancel any running animations
      cancelAnimation();

      // Start from an index between 0 and the number of strokes
      const index = Math.max(
        Math.min(
          params.quizStartStrokeNum || 0,
          characterClass.strokes.length - 1
        ),
        0
      );

      quizStore.setState({
        active: true,
        index,
        mistakes: {},
        params,
      });
    },
    stop: () => {
      quizStore.setState({
        active: false,
        index: 0,
        mistakes: {},
        params: null,
      });
    },
  };
};

export const useHanziWriter = (params: {
  character: string;
  loader?: (char: string) => Promise<CharacterJson> | CharacterJson;
}) => {
  const { character } = params;

  const promise = useCallback(async () => {
    const loader = params.loader || defaultCharDataLoader;
    const value = loader(character);
    if (value instanceof Promise) {
      return value.then((res) => parseCharData(character, res));
    }
    return parseCharData(character, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

  const { state: characterState, refetch } = usePromise({
    cacheKey: `char.${character}`,
    promiseFn: promise,
  });

  const animator = useCharacterAnimator({ character });

  const characterClass =
    characterState.status === 'resolved' ? characterState.data : null;

  const quiz = useQuiz({
    character,
    characterClass,
    cancelAnimation: animator.cancelAnimation,
  });

  return {
    animator,
    quiz,
    characterState,
    characterClass,
    refetch,
  };
};
