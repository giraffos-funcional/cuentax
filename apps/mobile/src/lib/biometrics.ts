/**
 * CUENTAX Mobile — Biometric Authentication
 * Wrapper around expo-local-authentication.
 */

import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricType = 'fingerprint' | 'facial' | 'iris' | 'none';

export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

export async function getBiometricType(): Promise<BiometricType> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'facial';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'fingerprint';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'iris';
  }
  return 'none';
}

export async function authenticateWithBiometrics(
  promptMessage = 'Desbloquear CuentaX',
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Usar contraseña',
      disableDeviceFallback: false,
      fallbackLabel: 'Usar contraseña',
    });

    if (result.success) {
      return { success: true };
    }

    return {
      success: false,
      error: result.error ?? 'Autenticacion biometrica fallida',
    };
  } catch {
    return {
      success: false,
      error: 'Error al acceder a la autenticacion biometrica',
    };
  }
}
