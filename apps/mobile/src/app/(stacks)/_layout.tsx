/**
 * Stacks Layout — shared stack navigator for non-tab screens.
 */

import { Stack } from 'expo-router';
import { colors, typography } from '@/theme';

export default function StacksLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg.base },
        animation: 'slide_from_right',
      }}
    />
  );
}
