import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import AnimatedPath from '../components/AnimatedPath';
import { extendStart, getPathString } from '../geometry';
import type { Stroke } from '../hanzi-writer';

interface StrokeAnimatorProps {
  stroke: Stroke;
  strokeColor: string;
  strokeWidth: number;
}

type AnimateParams = {
  duration: number;
  delay?: number;
  onComplete?: () => void;
};

export type StrokeAnimatorRef = {
  animate(params: AnimateParams): void;
  reset(): void;
};

export const StrokeAnimator = forwardRef<
  StrokeAnimatorRef,
  StrokeAnimatorProps
>(function StrokeAnimator({ stroke, strokeColor, strokeWidth }, ref) {
  const progress = useSharedValue(0);

  useImperativeHandle(ref, () => ({
    reset: () => {
      progress.value = withDelay(
        150,
        withTiming(0, {
          duration: 0,
          easing: Easing.ease,
        })
      );
    },
    animate: (params: {
      duration: number;
      delay: number;
      onComplete?: () => void;
    }) => {
      const { duration, delay, onComplete } = params;
      const onCompleteCallback = () => onComplete?.();
      const strokeIn = withTiming(1, { duration, easing: Easing.linear }, () =>
        runOnJS(onCompleteCallback)()
      );
      progress.value = delay ? withDelay(delay, strokeIn) : strokeIn;
    },
  }));

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
});

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
    // Sometimes the progress value can be slightly out of bounds due to floating point errors
    const clampedProgress = Math.min(Math.max(progress.value, 0), 1);
    return {
      strokeDashoffset: pathLength * (1 - clampedProgress),
      // Ease out the stroke opacity
      strokeOpacity: clampedProgress < 0.01 ? clampedProgress * 2 : 1,
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
