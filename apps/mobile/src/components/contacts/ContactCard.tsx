/**
 * Contact Card — avatar with initials, name, RUT, giro. Touchable to detail.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Card, Avatar } from '@/components/ui';
import { formatRUT } from '@/lib/formatters';
import type { Contact } from '@/lib/dte-types';
import { colors, spacing, typography } from '@/theme';

interface ContactCardProps {
  contact: Contact;
}

export const ContactCard = memo(function ContactCard({ contact }: ContactCardProps) {
  return (
    <Card
      onPress={() => router.push(`/(stacks)/contacts/${contact.id}`)}
      style={styles.card}
    >
      <View style={styles.row}>
        <Avatar name={contact.razon_social} size={44} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{contact.razon_social}</Text>
          <Text style={styles.rut}>{formatRUT(contact.rut)}</Text>
          {contact.giro && (
            <Text style={styles.giro} numberOfLines={1}>{contact.giro}</Text>
          )}
        </View>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  rut: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  giro: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
});
