/**
 * CUENTAX Mobile — StreamingText
 * Renders a blinking cursor at the end of assistant text while streaming.
 */

import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@/theme';

interface StreamingTextProps {
  /** Whether the stream is active */
  isStreaming: boolean;
  /** Whether there's content or just the cursor should show */
  hasContent: boolean;
}

export const StreamingCursor = memo<StreamingTextProps>(
  ({ isStreaming, hasContent }) => {
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
      if (!isStreaming) {
        opacity.setValue(0);
        return;
      }

      const blink = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      );

      blink.start();
      return () => blink.stop();
    }, [isStreaming, opacity]);

    if (!isStreaming) return null;

    return (
      <Animated.View style={[styles.cursor, { opacity }]}>
        <Text style={styles.cursorChar}>{hasContent ? '\u2588' : ''}</Text>
      </Animated.View>
    );
  },
);

StreamingCursor.displayName = 'StreamingCursor';

/** Loading dots animation shown while waiting for first token */
export function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createBounce = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: -6,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      );

    const a1 = createBounce(dot1, 0);
    const a2 = createBounce(dot2, 150);
    const a3 = createBounce(dot3, 300);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.dotsContainer}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { transform: [{ translateY: dot }] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cursor: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cursorChar: {
    color: colors.text.primary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.base * typography.lineHeight.relaxed,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.violet400,
  },
});
