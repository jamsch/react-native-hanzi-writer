import { ActivityIndicator, Platform } from 'react-native';

interface Props {
  color?: string;
  size?: 'small' | 'large' | number;
}

/**
 * A spinning loading icon
 */
function LoadingIndicator({ color = '#000', size = 'large' }: Props) {
  return (
    <ActivityIndicator
      color={color}
      size={typeof size === 'number' && Platform.OS === 'ios' ? 'large' : size}
    />
  );
}

export default LoadingIndicator;
