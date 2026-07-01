import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

type ScreenProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: ViewStyle;
};

type StateProps = {
  actionLabel?: string;
  body: string;
  loading?: boolean;
  onAction?: () => void;
  title: string;
};

type ButtonProps = {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  secondary?: boolean;
  style?: ViewStyle;
};

export function Screen({ children, footer, style }: ScreenProps) {
  return (
    <View style={[styles.screen, style]}>
      <View style={styles.content}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

export function ScreenState({ actionLabel, body, loading, onAction, title }: StateProps) {
  return (
    <Screen style={styles.centered}>
      {loading ? <ActivityIndicator color="#2b6f6b" size="large" /> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} style={styles.stateAction} />
      ) : null}
    </Screen>
  );
}

export function PrimaryButton({ disabled, label, onPress, secondary, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondaryButton : styles.primaryButton,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
        style,
      ]}
    >
      <Text style={[styles.buttonText, secondary ? styles.secondaryButtonText : null]}>{label}</Text>
    </Pressable>
  );
}

export function FieldLabel({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export const colors = {
  border: '#d7ddd9',
  danger: '#a33b2f',
  muted: '#68736f',
  primary: '#2b6f6b',
  surface: '#f6f8f6',
  text: '#18221f',
};

const styles = StyleSheet.create({
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  centered: {
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  footer: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  screen: {
    backgroundColor: colors.surface,
    flex: 1,
    padding: 20,
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: colors.text,
  },
  stateAction: {
    marginTop: 24,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 18,
    textAlign: 'center',
  },
});
