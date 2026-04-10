/**
 * Step Indicator — 5 dots with labels, active step highlighted in violet.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/theme';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  labels: string[];
}

export function StepIndicator({ currentStep, totalSteps, labels }: StepIndicatorProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const isActive = i === currentStep;
        const isCompleted = i < currentStep;

        return (
          <View key={i} style={styles.step}>
            <View
              style={[
                styles.dot,
                isActive && styles.dotActive,
                isCompleted && styles.dotCompleted,
              ]}
            >
              {isCompleted && <Text style={styles.check}>&#10003;</Text>}
              {isActive && <View style={styles.dotInner} />}
            </View>
            <Text
              style={[
                styles.label,
                (isActive || isCompleted) && styles.labelActive,
              ]}
              numberOfLines={1}
            >
              {labels[i]}
            </Text>
            {i < totalSteps - 1 && (
              <View style={[styles.line, isCompleted && styles.lineCompleted]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  step: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bg.elevated,
    borderWidth: 2,
    borderColor: colors.border.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    borderColor: colors.brand.violet600,
    backgroundColor: colors.bg.surface,
  },
  dotCompleted: {
    borderColor: colors.brand.violet600,
    backgroundColor: colors.brand.violet600,
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.violet600,
  },
  check: {
    color: colors.text.inverse,
    fontSize: 12,
    fontWeight: typography.weight.bold,
  },
  label: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  labelActive: {
    color: colors.brand.violet600,
    fontWeight: typography.weight.medium,
  },
  line: {
    position: 'absolute',
    top: 12,
    left: '60%',
    right: '-40%',
    height: 2,
    backgroundColor: colors.border.light,
    zIndex: -1,
  },
  lineCompleted: {
    backgroundColor: colors.brand.violet600,
  },
});
