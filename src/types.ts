/** Types extracted from the `hanzi-writer` library */

export type Point = {
  x: number;
  y: number;
};

export type QuizOptions = {
  /** Default: 1. This can be set to make stroke grading more or less lenient. The closer this is to 0 the more strictly the quiz is graded. */
  leniency: number;
  /** Highlights the correct stroke after a set number of incorrect attempts. Setting `false` disables entirely. Default: 3 */
  showHintAfterMisses: number | false;
  /** After a quiz is completed successfully, the character will flash briefly. Default: true */
  highlightOnComplete: boolean;
  /** Whether to treat strokes which are correct besides their direction as correct. */
  acceptBackwardsStrokes: boolean;
  /** Begin quiz on this stroke number rather than stroke 0 */
  quizStartStrokeNum: number;
  onMistake?: (strokeData: StrokeData) => void;
  onCorrectStroke?: (strokeData: StrokeData) => void;
  /** Callback when the quiz completes */
  onComplete?: (summary: { character: string; totalMistakes: number }) => void;
};

export type StrokeData = {
  character: string;
  drawnPath: {
    pathString: string;
    points: Point[];
  };
  isBackwards: boolean;
  strokeNum: number;
  mistakesOnStroke: number;
  totalMistakes: number;
  strokesRemaining: number;
};

export type CharacterJson = {
  strokes: string[];
  medians: number[][][];
  radStrokes?: number[];
};

export type PositionerOptions = {
  /** Default: 0 */
  width: number;
  /** Default: 0 */
  height: number;
  /** Default: 20 */
  padding: number;
};
