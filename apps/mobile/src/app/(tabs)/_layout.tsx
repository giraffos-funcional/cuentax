/**
 * CUENTAX Mobile — Tab Layout
 * Bottom tab navigator: Dashboard, Scan (raised FAB), Documents, More.
 */

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, shadows } from '@/theme';

function ScanTabIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.scanButton}>
      <Ionicons
        name="camera"
        size={26}
        color={colors.text.inverse}
      />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand.violet600,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: '',
          tabBarIcon: ({ focused }) => <ScanTabIcon focused={focused} />,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Documentos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Mas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bg.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    paddingTop: spacing.sm,
    ...shadows.md,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  tabBarItem: {
    gap: 2,
  },
  scanButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand.violet600,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
});
