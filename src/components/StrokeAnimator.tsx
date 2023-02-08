import { useEffect, useMemo, useRef } from 'react';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import AnimatedPath from '../components/AnimatedPath';
import { extendStart, getPathString } from '../geometry';
import type { Stroke } from '../hanzi-writer';

interface StrokeAnimatorProps {
  stroke: Stroke;
  duration: number;
  delay?: number;
  strokeColor: string;
  strokeWidth: number;
  resetOnComplete?: boolean;
  onComplete?: () => void;
}

export default function StrokeAnimator({
  stroke,
  duration,
  delay,
  strokeColor,
  strokeWidth,
  resetOnComplete,
  onComplete,
}: StrokeAnimatorProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const onCompleteCallback = () => onComplete?.();

    const strokeIn = withTiming(1, { duration, easing: Easing.linear }, () =>
      runOnJS(onCompleteCallback)()
    );

    const animations: number[] = [
      delay ? withDelay(delay, strokeIn) : strokeIn,
    ];

    if (resetOnComplete) {
      animations.push(
        withDelay(
          150,
          withTiming(0, {
            duration: 0,
            easing: Easing.ease,
          })
        )
      );
    }

    if (animations.length < 2) {
      progress.value = animations[0];
    } else {
      // @ts-ignore
      progress.value = withSequence(...animations);
    }
  }, [resetOnComplete, onComplete, progress, delay, duration]);

  const path = useMemo(() => {
    const extendedMaskPoints = extendStart(stroke.points, strokeWidth / 2);
    return getPathString(extendedMaskPoints);
  }, [stroke.points, strokeWidth]);

  const pathLength = stroke.getLength() + strokeWidth / 2;

  return (
    <AnimatedStroke
      clipPath={`url(#clip.${stroke.strokeNum})`}
      progress={progress}
      d={path}
      color={strokeColor}
      pathLength={pathLength}
    />
  );
}

interface AnimatedStrokeProps {
  d: string;
  progress: Animated.SharedValue<number>;
  clipPath: string;
  pathLength: number;
  color: string;
}

function AnimatedStroke({
  d,
  progress,
  clipPath,
  color,
  pathLength,
}: AnimatedStrokeProps) {
  const ref = useRef(null);

  const animatedProps = useAnimatedProps(() => {
    return {
      strokeDashoffset: pathLength * (1 - progress.value),
      // Ease out the stroke opacity
      strokeOpacity: progress.value < 0.01 ? progress.value * 2 : 1,
    };
  });

  return (
    <AnimatedPath
      ref={ref}
      animatedProps={animatedProps}
      d={d}
      stroke={color}
      clipPath={clipPath}
      strokeWidth={180}
      strokeLinecap="round"
      fill="none"
      strokeDasharray={`${pathLength},${pathLength}`}
    />
  );
}
