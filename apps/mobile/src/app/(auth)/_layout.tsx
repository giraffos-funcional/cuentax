/**
 * CUENTAX Mobile — Auth Layout
 * Stack navigator for auth screens (no tabs).
 */

import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg.base },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="biometric-unlock" />
    </Stack>
  );
}
