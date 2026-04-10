import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function DTELayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg.base },
      }}
    />
  );
}
